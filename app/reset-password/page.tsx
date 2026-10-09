"use client";

// =========================================================================
// RESET / SET PASSWORD
// Reached from a password-reset email (signed in by /auth/confirm or
// /auth/callback) or from an admin invitation (?mode=invite&next=/admin).
// =========================================================================

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { AuthShell } from '@/components/AuthShell';
import { landingPathFor, safeNext } from '@/lib/roles';
import { cx, ui } from '@/lib/ui';

function strength(p: string): { score: number; label: string } {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  const score = Math.min(4, s);
  return { score, label: ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][score] };
}

function ResetContent() {
  const router = useRouter();
  const params = useSearchParams();
  const invite = params.get('mode') === 'invite';
  const next = safeNext(params.get('next'), '');

  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUser(data.user ?? null));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    const { data, error: err } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (err) {
      return setError(/different from the old/i.test(err.message) ? 'Choose a password you have not used before.' : err.message);
    }
    setDone(true);
    const dest = landingPathFor(data.user ?? user ?? null, next || (invite ? '/admin' : null));
    window.setTimeout(() => router.replace(dest), 1600);
  };

  if (user === undefined) {
    return <div className="min-h-screen flex items-center justify-center bg-canvas"><Loader2 className="w-8 h-8 animate-spin text-accent" aria-label="Loading" /></div>;
  }

  if (!user) {
    return (
      <AuthShell title="This link has expired" subtitle="Password links work once and only for a short time.">
        <div className={cx(ui.alertWarning, 'mb-6')}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          <span>Ask for a new link and open it on this device. {invite && 'If you were invited as an admin, use your invited email address.'}</span>
        </div>
        <Link href="/forgot-password" className={cx(ui.btn, ui.btnLg, ui.btnPrimary, 'w-full')}>Send me a new link</Link>
        <p className="mt-6 text-center text-sm text-fg-muted"><Link href="/login" className={ui.link}>Back to sign in</Link></p>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title={invite ? 'You are all set' : 'Password updated'} subtitle="Taking you in…">
        <div className="flex flex-col items-center gap-3 text-center animate-in fade-in zoom-in-95 duration-300">
          <span className="w-16 h-16 rounded-full bg-success-soft border border-success-line flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-success" aria-hidden />
          </span>
          <p className={ui.body}>Next time, sign in with <strong className="text-fg">{user.email}</strong> and your new password.</p>
        </div>
      </AuthShell>
    );
  }

  const st = strength(password);
  return (
    <AuthShell
      title={invite ? 'Set your password' : 'Choose a new password'}
      subtitle={invite ? 'You have been invited to help run Qozob. Choose a password to finish setting up your account.' : `For ${user.email}`}
    >
      {error && (
        <div role="alert" className={cx(ui.alertError, 'mb-6')}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> <span>{error}</span>
        </div>
      )}
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="new-password" className={ui.label}>New password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle pointer-events-none" aria-hidden />
            <input
              id="new-password"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={8}
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={cx(ui.input, ui.inputWithIcon, 'pr-11')}
              placeholder="At least 8 characters"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors"
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
          {password && (
            <div className="mt-2 flex items-center gap-2" aria-live="polite">
              <div className="flex gap-1 flex-1">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={cx('h-1.5 flex-1 rounded-full transition-colors duration-300',
                    i < st.score ? (st.score <= 1 ? 'bg-danger' : st.score === 2 ? 'bg-warning' : 'bg-success') : 'bg-surface-3')} />
                ))}
              </div>
              <span className="text-xs text-fg-subtle w-16 text-right">{st.label}</span>
            </div>
          )}
        </div>
        <div>
          <label htmlFor="confirm-password" className={ui.label}>Confirm new password</label>
          <input
            id="confirm-password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={ui.input}
            placeholder="Type it again"
          />
        </div>
        <button type="submit" disabled={busy} className={cx(ui.btn, ui.btnLg, ui.btnPrimary, 'w-full')}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : invite ? 'Save and continue' : 'Update password'}
        </button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-canvas"><Loader2 className="w-8 h-8 animate-spin text-accent" aria-label="Loading" /></div>}>
      <ResetContent />
    </Suspense>
  );
}

