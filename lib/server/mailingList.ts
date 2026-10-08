// =========================================================================
// SERVER-ONLY mailing-list logic shared by the subscribe / confirm / unsubscribe
// and "my email updates" API routes. Uses the service-role client because the
// subscriber table is private (only admins can read it from the browser).
// =========================================================================
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { sendEmail, mailConfig } from '@/lib/server/mailer';
import { MAILING_CONSENT_TEXT, MAILING_SOURCES, type MailingSource } from '@/lib/mailingConsent';
import { SITE } from '@/lib/site';

const CONFIRM_RESEND_MINUTES = 10;   // don't email the same address more often than this
export const CONFIRM_VALID_DAYS = 7;

interface SubscriberRow {
  id: string; email: string; status: string; user_id: string | null;
  confirm_token: string | null; confirm_sent_at: string | null; unsubscribe_token: string;
}

export function cleanSource(v: unknown): MailingSource {
  return MAILING_SOURCES.includes(v as MailingSource) ? (v as MailingSource) : 'website';
}

function cleanText(v: unknown, max = 80): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
  return t || null;
}

function profileFromUser(user: User | null) {
  const m = (user?.user_metadata ?? {}) as Record<string, unknown>;
  return {
    full_name: cleanText(m.full_name ?? m.name),
    state: cleanText(m.state),
    lga: cleanText(m.lga),
  };
}

async function findByEmail(email: string): Promise<SubscriberRow | null> {
  const { data } = await supabaseAdmin()
    .from('mailing_subscribers')
    .select('id, email, status, user_id, confirm_token, confirm_sent_at, unsubscribe_token')
    .eq('email', email)
    .maybeSingle();
  return (data as SubscriberRow | null) ?? null;
}

/** True when this signed-in user has proven they own `email` (verified sign-in email). */
function ownsEmail(user: User | null, email: string) {
  return Boolean(user?.email && user.email.toLowerCase() === email && (user.email_confirmed_at || user.confirmed_at));
}

export type SubscribeResult = 'subscribed' | 'check_email';

/**
 * Adds someone to the list after they ticked the consent box.
 * • Signed-in person subscribing their own verified email → subscribed immediately.
 * • Anyone else → "pending" + confirmation email (double opt-in), so nobody can sign up someone else.
 * The answer never reveals whether an address was already on the list.
 */
export async function subscribe(opts: {
  email: string; user: User | null; source: MailingSource;
  fullName?: unknown; state?: unknown; lga?: unknown;
}): Promise<SubscribeResult> {
  const db = supabaseAdmin();
  const email = opts.email.trim().toLowerCase();
  const now = new Date().toISOString();
  const existing = await findByEmail(email);
  const fromUser = ownsEmail(opts.user, email) ? profileFromUser(opts.user) : { full_name: null, state: null, lga: null };
  const details = {
    full_name: cleanText(opts.fullName) ?? fromUser.full_name,
    state: cleanText(opts.state) ?? fromUser.state,
    lga: cleanText(opts.lga) ?? fromUser.lga,
  };
  // Keep previously stored details if the new request didn't include them.
  const keep = <T,>(o: T) => Object.fromEntries(Object.entries(o as object).filter(([, v]) => v !== null && v !== undefined));

  if (ownsEmail(opts.user, email)) {
    const row = {
      email, user_id: opts.user!.id, status: 'subscribed',
      ...(existing?.status === 'subscribed' ? {} : { source: opts.source }),
      consent_text: MAILING_CONSENT_TEXT, consent_at: now, confirmed_at: now, unsubscribed_at: null, confirm_token: null,
      ...keep(details),
    };
    const { error } = existing
      ? await db.from('mailing_subscribers').update(row).eq('id', existing.id)
      : await db.from('mailing_subscribers').insert(row);
    if (error) throw new Error(error.message);
    return 'subscribed';
  }

  if (existing?.status === 'subscribed') return 'check_email';   // already on the list; say nothing more

  // Throttle repeat confirmation emails to the same address.
  if (existing?.confirm_sent_at && Date.now() - new Date(existing.confirm_sent_at).getTime() < CONFIRM_RESEND_MINUTES * 60_000) {
    return 'check_email';
  }
  if (!mailConfig().ready) throw new Error('MAIL_NOT_READY');

  const token = crypto.randomUUID();
  const row = {
    email, status: 'pending', source: opts.source, consent_text: MAILING_CONSENT_TEXT, consent_at: now,
    confirm_token: token, confirm_sent_at: now, ...keep(details),
  };
  if (existing) {
    // Re-subscribing after unsubscribing/bouncing also goes through confirmation.
    await db.from('mailing_subscribers').update(row).eq('id', existing.id);
  } else {
    const { error } = await db.from('mailing_subscribers').insert(row);
    if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
  }

  await sendEmail({
    to: email,
    tag: 'confirm',
    reason: `Someone (hopefully you) asked to join the ${SITE.name} mailing list with this address. If it wasn't you, ignore this email and you won't hear from us.`,
    content: {
      subject: 'Please confirm your Qozob email updates',
      preheader: 'One tap to confirm. Ignore this email if it was not you.',
      body: `Thanks for joining the ${SITE.name} community!\n\nTap the button below to confirm you want ${SITE.name} news, fuel-price tips and reward updates. The link works for ${CONFIRM_VALID_DAYS} days.\n\nIf you did not ask for this, simply ignore this email — you will not be added.`,
      ctaLabel: 'Confirm my email',
      ctaUrl: `${SITE.url}/api/mailing/confirm?token=${token}`,
    },
  });
  return 'check_email';
}

export async function confirmToken(token: string): Promise<'confirmed' | 'expired' | 'invalid'> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return 'invalid';
  const db = supabaseAdmin();
  const { data } = await db.from('mailing_subscribers').select('id, status, confirm_sent_at').eq('confirm_token', token).maybeSingle();
  if (!data) return 'invalid';
  if (data.confirm_sent_at && Date.now() - new Date(data.confirm_sent_at).getTime() > CONFIRM_VALID_DAYS * 86_400_000) return 'expired';
  const now = new Date().toISOString();
  await db.from('mailing_subscribers')
    .update({ status: 'subscribed', confirmed_at: now, unsubscribed_at: null, confirm_token: null })
    .eq('id', data.id);
  return 'confirmed';
}

export async function unsubscribeToken(token: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return false;
  const { data } = await supabaseAdmin()
    .from('mailing_subscribers')
    .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString(), confirm_token: null })
    .eq('unsubscribe_token', token)
    .select('id');
  return Boolean(data && data.length);
}

/** The signed-in user's subscription status (matched by account or verified email). */
export async function statusForUser(user: User): Promise<string> {
  const db = supabaseAdmin();
  const { data: byId } = await db.from('mailing_subscribers').select('status').eq('user_id', user.id).limit(1);
  if (byId && byId[0]) return byId[0].status as string;
  if (user.email) {
    const row = await findByEmail(user.email.toLowerCase());
    if (row) return row.status;
  }
  return 'none';
}

export async function unsubscribeUser(user: User) {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const patch = { status: 'unsubscribed', unsubscribed_at: now, confirm_token: null };
  await db.from('mailing_subscribers').update(patch).eq('user_id', user.id);
  if (user.email) await db.from('mailing_subscribers').update(patch).eq('email', user.email.toLowerCase());
}
