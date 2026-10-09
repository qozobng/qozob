"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { AlertTriangle, CheckCircle2, Clock, LogOut, UserRound, X } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { getRole } from '@/lib/roles';
import { NIGERIAN_STATES, joinPhone, normaliseState, stateLabel } from '@/lib/nigeria';
import { PROFILE_GRACE_DAYS, formatCountdown, profileStatus, splitPhone, suggestedNames } from '@/lib/profile';
import { PhoneField } from '@/components/PhoneField';
import { ui, cx } from '@/lib/ui';

// =========================================================================
// PROFILE GATE
// Signed-in users without a name, phone and state (mostly Google sign-ups)
// see a gentle countdown banner for PROFILE_GRACE_DAYS. After that, every
// page is covered by the profile form until it's filled in.
// Note: this is enforced in the browser. It nudges real users; it is not a
// security boundary (the database rules still decide what data anyone gets).
// =========================================================================

/** Pages that must stay reachable without a complete profile. */
const EXEMPT_PREFIXES = [
  '/welcome', '/auth', '/login', '/signup', '/forgot-password', '/reset-password',
  '/privacy', '/terms', '/rewards/rules', '/mailing',
];

const SNOOZE_KEY = 'qz-profile-banner-snooze';
const SNOOZE_MS = 4 * 60 * 60 * 1000; // banner comes back after 4 hours

function isExempt(path: string | null): boolean {
  if (!path) return false;
  return EXEMPT_PREFIXES.some(p => path === p || path.startsWith(`${p}/`));
}

function readSnooze(): number {
  try { return Number(localStorage.getItem(SNOOZE_KEY)) || 0; } catch { return 0; }
}

export function ProfileGate() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [snoozedUntil, setSnoozedUntil] = useState(() => (typeof window === 'undefined' ? 0 : readSnooze()));
  const [formOpen, setFormOpen] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);

  // Track the signed-in user. When the stored session says "incomplete", double-check with the
  // server once, in case the profile was finished on another device.
  useEffect(() => {
    const supabase = createClient();
    let checkedFresh = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      setNow(Date.now());
      if (u && !checkedFresh && !profileStatus(u).complete) {
        checkedFresh = true;
        supabase.auth.getUser().then(({ data }) => { if (data.user) setUser(data.user); });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const status = useMemo(() => (user ? profileStatus(user) : null), [user]);
  const active = !!user && !!status && !status.complete && getRole(user) !== 'Admin' && !isExempt(pathname);
  const remaining = status ? status.deadline - now : 0;
  const blocked = active && remaining <= 0;

  // Live countdown (only while it matters)
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [active]);

  const snooze = () => {
    const until = Date.now() + SNOOZE_MS;
    try { localStorage.setItem(SNOOZE_KEY, String(until)); } catch { /* private mode */ }
    setSnoozedUntil(until);
  };

  const onSaved = useCallback((u: User) => {
    setSavedName(String(u.user_metadata?.first_name || '').trim() || 'there');
    setUser(u);
  }, []);

  const closeAll = () => { setSavedName(null); setFormOpen(false); };

  if (!user) return null;

  // Success message stays up (with a Close button) even though the profile is now complete
  if (savedName !== null) {
    return (
      <Modal labelId="qz-profile-done">
        <div className="p-6 sm:p-7 text-center">
          <CheckCircle2 className="mx-auto w-12 h-12 text-success" aria-hidden />
          <h2 id="qz-profile-done" className={cx(ui.h2, 'mt-3')}>Thanks, {savedName}!</h2>
          <p className={cx(ui.body, 'mt-1.5')}>Your profile is complete. You have full access to Qozob.</p>
          <button type="button" autoFocus onClick={closeAll} className={cx(ui.btn, ui.btnLg, ui.btnPrimary, 'mt-5 w-full')}>Close</button>
        </div>
      </Modal>
    );
  }

  if (!active || !status) return null;

  if (blocked || formOpen) {
    return (
      <Modal labelId="qz-profile-title" locked={blocked} onClose={() => setFormOpen(false)}>
        <ProfileForm user={user} blocked={blocked} onSaved={onSaved} onClose={blocked ? undefined : () => setFormOpen(false)} />
      </Modal>
    );
  }

  if (snoozedUntil > now) return null;

  // Grace period: small floating banner with the countdown
  const bottom = pathname === '/' ? 'bottom-[92px] lg:bottom-5' : 'bottom-5';
  return createPortal(
    <div
      role="status"
      className={cx('fixed inset-x-3 sm:left-auto sm:right-5 sm:w-[24rem] z-[300] animate-in fade-in slide-in-from-bottom-2 duration-300', bottom)}
    >
      <div className="relative flex items-start gap-3 rounded-2xl border border-warning-line bg-surface p-3.5 pr-10 shadow-xl">
        <span className="mt-0.5 shrink-0 h-9 w-9 rounded-full bg-warning-soft text-on-warning-soft flex items-center justify-center">
          <Clock className="w-4.5 h-4.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-fg">Complete your profile</p>
          <p className="text-xs text-fg-muted mt-0.5 leading-relaxed">
            Add your name, phone and state. Access is paused in{' '}
            <span className="font-bold text-fg tabular">{formatCountdown(remaining)}</span> if it&apos;s still missing.
          </p>
          <button type="button" onClick={() => setFormOpen(true)} className={cx(ui.btn, ui.btnSm, ui.btnPrimary, 'mt-2.5')}>
            Complete now
          </button>
        </div>
        <button type="button" onClick={snooze} aria-label="Remind me later" title="Remind me later" className="absolute top-2.5 right-2.5 p-1.5 rounded-full text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors">
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>
    </div>,
    document.body,
  );
}

// -------------------------------------------------------------------------
// Modal shell: portal to <body>, scroll lock, and (when locked) the rest of
// the page is made inert so it can't be clicked or tabbed into.
// -------------------------------------------------------------------------
function Modal({ children, labelId, locked = false, onClose }: {
  children: React.ReactNode;
  labelId: string;
  locked?: boolean;
  onClose?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    if (!locked) return;
    const root = rootRef.current;
    const touched: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === root || (root && el.contains(root)) || el.hasAttribute('inert')) continue;
      el.setAttribute('inert', '');
      touched.push(el);
    }
    return () => touched.forEach(el => el.removeAttribute('inert'));
  }, [locked]);

  useEffect(() => {
    if (locked || !onClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, onClose]);

  return createPortal(
    <div
      ref={rootRef}
      className={cx(ui.overlay, 'z-[1000] overflow-y-auto', locked && 'bg-brand/80 backdrop-blur-md')}
      onMouseDown={(e) => { if (!locked && onClose && e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={labelId} className={cx(ui.modal, 'max-w-md my-auto')}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// -------------------------------------------------------------------------
// The form itself
// -------------------------------------------------------------------------
function ProfileForm({ user, blocked, onSaved, onClose }: {
  user: User;
  blocked: boolean;
  onSaved: (u: User) => void;
  onClose?: () => void;
}) {
  const meta = user.user_metadata || {};
  const names = suggestedNames(user);
  const initialPhone = splitPhone(meta.full_phone || user.phone);
  const country = String(meta.country || 'Nigeria');
  const inNigeria = country.toLowerCase() === 'nigeria';

  const [first, setFirst] = useState(names.first);
  const [last, setLast] = useState(names.last);
  const [code, setCode] = useState(initialPhone.code);
  const [phone, setPhone] = useState(initialPhone.national);
  const [state, setState] = useState<string>(inNigeria ? (normaliseState(meta.state) ?? '') : String(meta.state || ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const f = first.trim().replace(/\s+/g, ' ');
    const l = last.trim().replace(/\s+/g, ' ');
    if (f.length < 2 || l.length < 2) return setError('Please enter your first and last name.');
    const fullPhone = joinPhone(code, phone);
    if (fullPhone.replace(/\D/g, '').length < code.replace(/\D/g, '').length + 7) {
      return setError('Please enter a valid phone number.');
    }
    if (!state.trim()) return setError('Please choose your state.');

    setSaving(true);
    const { data, error: err } = await createClient().auth.updateUser({
      data: {
        first_name: f,
        last_name: l,
        full_name: `${f} ${l}`,
        full_phone: fullPhone,
        state: state.trim(),
        country,
        profile_completed_at: new Date().toISOString(),
      },
    });
    setSaving(false);
    if (err || !data.user) return setError(err?.message || 'Could not save your details. Please try again.');
    onSaved(data.user);
  };

  const signOut = async () => {
    await createClient().auth.signOut();
    window.location.href = '/';
  };

  return (
    <form onSubmit={submit} className="p-6 sm:p-7" noValidate>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close" className={ui.modalClose}>
          <X className="w-5 h-5" aria-hidden />
        </button>
      )}

      <span className="h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center">
        <UserRound className="w-5 h-5" aria-hidden />
      </span>
      <h2 id="qz-profile-title" className={cx(ui.h2, 'mt-3')}>Complete your profile</h2>
      <p className={cx(ui.body, 'mt-1')}>
        {blocked
          ? `Your ${PROFILE_GRACE_DAYS}-day grace period has ended. Add your details to keep using Qozob.`
          : 'Tell us who you are. It keeps price updates trustworthy and lets us reach you about rewards.'}
      </p>
      <p className="mt-1 text-xs text-fg-subtle truncate">Signed in as {user.email}</p>

      {blocked && (
        <div className={cx(ui.alertWarning, 'mt-4')}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          <span>Access is paused until this form is saved.</span>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="qz-pf-first" className={ui.label}>First name</label>
          <input id="qz-pf-first" autoFocus required autoComplete="given-name" value={first} onChange={e => setFirst(e.target.value)} className={ui.input} maxLength={60} />
        </div>
        <div>
          <label htmlFor="qz-pf-last" className={ui.label}>Last name</label>
          <input id="qz-pf-last" required autoComplete="family-name" value={last} onChange={e => setLast(e.target.value)} className={ui.input} maxLength={60} />
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor="qz-pf-phone" className={ui.label}>Phone number</label>
        <PhoneField id="qz-pf-phone" code={code} onCodeChange={setCode} value={phone} onChange={setPhone} required />
      </div>

      <div className="mt-3">
        <label htmlFor="qz-pf-state" className={ui.label}>State</label>
        {inNigeria ? (
          <select id="qz-pf-state" required value={state} onChange={e => setState(e.target.value)} className={ui.select}>
            <option value="" disabled>Choose your state</option>
            {NIGERIAN_STATES.map(s => <option key={s} value={s}>{stateLabel(s)}</option>)}
          </select>
        ) : (
          <input id="qz-pf-state" required autoComplete="address-level1" value={state} onChange={e => setState(e.target.value)} className={ui.input} maxLength={60} />
        )}
      </div>

      {error && (
        <div className={cx(ui.alertError, 'mt-4')} role="alert">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <button type="submit" disabled={saving} className={cx(ui.btn, ui.btnLg, ui.btnPrimary, 'mt-5 w-full')}>
        {saving ? 'Saving…' : 'Save my details'}
      </button>

      {blocked && (
        <button type="button" onClick={signOut} className={cx(ui.btn, ui.btnSm, ui.btnGhost, 'mt-3 w-full')}>
          <LogOut className="w-4 h-4" aria-hidden /> Sign out
        </button>
      )}
      <p className="mt-3 text-center text-xs text-fg-subtle">
        We use these details as described in our <a href="/privacy" className={ui.link}>privacy policy</a>.
      </p>
    </form>
  );
}
