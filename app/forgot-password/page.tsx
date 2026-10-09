"use client";

// =========================================================================
// FORGOT PASSWORD
// Sends a Supabase password-reset email. The link (token-hash template in
// supabase/email-templates/reset-password.html, or Supabase's default link)
// signs the person in and lands on /reset-password to choose a new one.
// The same message is shown whether or not the email has an account, so
// nobody can use this page to find out who uses Qozob.
// =========================================================================

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, Loader2, Mail, MailCheck } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { AuthShell } from '@/components/AuthShell';
import { cx, ui } from '@/lib/ui';

function ForgotContent() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') || '');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const addr = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return setError('Enter a valid email address.');
    setBusy(true);
    const { error: err } = await createClient().auth.resetPasswordForEmail(addr, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
    });
    setBusy(false);
    // Only surface rate-limit style errors; never reveal whether the account exists.
    if (err && /security purposes|rate limit|too many/i.test(err.message)) {
      return setError('Please wait a minute before asking for another reset email.');
    }
    setSent(true);
  };

  if (sent) {
    return (
      <AuthShell title="Check your email" subtitle="We've sent you a link to reset your password.">
        <div className="flex flex-col items-center text-center gap-4 animate-in fade-in zoom-in-95 duration-300">
          <span className="w-16 h-16 rounded-full bg-success-soft border border-success-line flex items-center justify-center">
            <MailCheck className="w-8 h-8 text-success" aria-hidden />
          </span>
          <p className={ui.body}>
            If <strong className="text-fg">{email.trim()}</strong> has a Qozob account, a reset link is on its way.
            It works once and expires after about an hour. Check your spam or promotions folder if you can&rsquo;t see it.
          </p>
          <button type="button" onClick={() => setSent(false)} className={cx(ui.btn, ui.btnMd, ui.btnSecondary)}>
            Use a different email
          </button>
          <Link href="/login" className={cx(ui.link, 'text-sm inline-flex items-center gap-1')}>
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we'll send you a link to choose a new one.">
      {error && (
        <div role="alert" className={cx(ui.alertError, 'mb-6')}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> <span>{error}</span>
        </div>
      )}
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="email" className={ui.label}>Email address</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle pointer-events-none" aria-hidden />
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cx(ui.input, ui.inputWithIcon)}
              placeholder="you@example.com"
            />
          </div>
        </div>
        <button type="submit" disabled={busy} className={cx(ui.btn, ui.btnLg, ui.btnPrimary, 'w-full')}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : 'Send reset link'}
        </button>
      </form>
      <p className="mt-8 text-center text-sm text-fg-muted">
        Remembered it?{' '}
        <Link href="/login" className={ui.link}>Back to sign in</Link>
      </p>
      <p className="mt-3 text-center text-xs text-fg-subtle">
        Signed up with Google? Use &ldquo;Continue with Google&rdquo; on the sign-in page instead.
      </p>
    </AuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-canvas"><Loader2 className="w-8 h-8 animate-spin text-accent" aria-label="Loading" /></div>}>
      <ForgotContent />
    </Suspense>
  );
}

