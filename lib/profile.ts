import type { User } from '@supabase/supabase-js';
import { DIAL_CODES } from '@/lib/nigeria';

// =========================================================================
// PROFILE COMPLETION
// Every account must carry a real name, phone number and state. Email sign-ups
// give these on the form; Google sign-ups don't, so they get a short grace
// period to add them before the app is locked behind the profile form
// (see components/ProfileGate.tsx).
// =========================================================================

/** Days a new account can browse before the profile form becomes mandatory. */
export const PROFILE_GRACE_DAYS = 3;

/**
 * When this rule went live. Accounts created before it get the full grace
 * period counted from this moment instead of from their sign-up date.
 */
export const PROFILE_RULE_START = '2026-10-09T16:00:00Z';

const DAY_MS = 24 * 60 * 60 * 1000;

export type ProfileField = 'first_name' | 'last_name' | 'phone' | 'state';

export const PROFILE_FIELD_LABEL: Record<ProfileField, string> = {
  first_name: 'first name',
  last_name: 'last name',
  phone: 'phone number',
  state: 'state',
};

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** True when a stored phone number has enough digits to be real (country code + 7 or more). */
export function isUsablePhone(v: unknown): boolean {
  return text(v).replace(/\D/g, '').length >= 10;
}

export interface ProfileStatus {
  complete: boolean;
  missing: ProfileField[];
  /** Epoch ms after which the profile form can no longer be skipped. */
  deadline: number;
}

export function profileStatus(user: User): ProfileStatus {
  const meta = user.user_metadata || {};
  const missing: ProfileField[] = [];
  if (!text(meta.first_name)) missing.push('first_name');
  if (!text(meta.last_name)) missing.push('last_name');
  if (!isUsablePhone(meta.full_phone)) missing.push('phone');
  if (!text(meta.state)) missing.push('state');

  const created = Date.parse(user.created_at || '') || Date.now();
  const start = Math.max(created, Date.parse(PROFILE_RULE_START));
  return { complete: missing.length === 0, missing, deadline: start + PROFILE_GRACE_DAYS * DAY_MS };
}

/** The name to show for a signed-in user: their own first + last name, or their email until they add it. */
export function displayName(user: User | null | undefined): string {
  if (!user) return '';
  const meta = user.user_metadata || {};
  const name = [text(meta.first_name), text(meta.last_name)].filter(Boolean).join(' ');
  return name || user.email || 'My account';
}

/** Single letter for avatar bubbles. */
export function initialOf(user: User | null | undefined): string {
  return (displayName(user).charAt(0) || 'Q').toUpperCase();
}

/** Best guess at first / last name for prefilling (Google gives one combined name). */
export function suggestedNames(user: User): { first: string; last: string } {
  const meta = user.user_metadata || {};
  const first = text(meta.first_name);
  const last = text(meta.last_name);
  if (first || last) return { first, last };
  const parts = (text(meta.full_name) || text(meta.name)).split(/\s+/).filter(Boolean);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') };
}

/** Splits a stored phone ("+2348031234567", or the auth phone "2348031234567") into dial code + national part. */
export function splitPhone(raw: unknown): { code: string; national: string } {
  const v = text(raw);
  if (!v) return { code: '+234', national: '' };
  const withPlus = v.startsWith('+') ? v : `+${v.replace(/\D/g, '')}`;
  // Longest codes first so "+1" never swallows a longer code
  const match = [...DIAL_CODES].sort((a, b) => b.code.length - a.code.length).find(d => withPlus.startsWith(d.code));
  if (!match) return { code: '+234', national: v.replace(/\D/g, '') };
  return { code: match.code, national: withPlus.slice(match.code.length) };
}

/** "2d 5h", "3h 12m", "8m" - short countdown text. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMin = Math.ceil(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

