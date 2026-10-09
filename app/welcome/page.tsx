"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Navigation, Trophy, Star, Loader2, AlertTriangle, MailCheck, ArrowRight } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { Wordmark } from '@/components/Wordmark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { getRole, landingPathFor, safeNext } from '@/lib/roles';
import { ui, cx } from '@/lib/ui';

// =========================================================================
// /welcome — shown right after someone verifies their email (or signs in with Google
// for the first time). Friendly confirmation, what they can do now, and a short countdown
// that takes them to the map automatically (admins: the admin dashboard).
// =========================================================================

const COUNTDOWN_SECONDS = 6;

type View =
  | { kind: 'loading' }
  | { kind: 'ready'; firstName: string; target: string; isAdmin: boolean }
  | { kind: 'signin'; target: string }
  | { kind: 'error'; code: string };

const ERROR_TEXT: Record<string, string> = {
  otp_expired: 'This confirmation link has expired or has already been used.',
  access_denied: 'This confirmation link has expired or has already been used.',
  invalid_link: 'This link is incomplete. Please use the button in your most recent Qozob email.',
};

const PERKS = [
  { icon: Navigation, title: 'Directions to any station', text: 'One tap opens turn-by-turn directions in Google Maps.' },
  { icon: Trophy, title: 'Win ₦10,000 every month', text: 'Drop prices to climb your LGA leaderboard.' },
  { icon: Star, title: 'Rate pumps, help Nigerians', text: 'Flag short-changing and reward honest stations.' },
];

function WelcomeContent() {
  const params = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [left, setLeft] = useState(COUNTDOWN_SECONDS);
  const [paused, setPaused] = useState(false);
  const goneRef = useRef(false);

  // Work out who this is and where they should go
  useEffect(() => {
    let alive = true;
    (async () => {
      const next = params.get('next');
      // Errors can arrive as ?error=... or, from Supabase's own pages, as #error_code=...
      const hash = typeof window !== 'undefined' ? new URLSearchParams(window.location.hash.slice(1)) : new URLSearchParams();
      const err = params.get('error') || hash.get('error_code') || hash.get('error');

      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;
      if (user) {
        const meta = user.user_metadata || {};
        const firstName = String(meta.first_name || meta.full_name || meta.name || '').trim().split(/\s+/)[0] || '';
        setView({ kind: 'ready', firstName, target: landingPathFor(user, next), isAdmin: getRole(user) === 'Admin' });
      } else if (err) {
        setView({ kind: 'error', code: err });
      } else {
        const back = safeNext(next);
        setView({ kind: 'signin', target: `/login${back !== '/' ? `?next=${encodeURIComponent(back)}` : ''}` });
      }
    })();
    return () => { alive = false; };
  }, [params, supabase]);

  const target = view.kind === 'ready' || view.kind === 'signin' ? view.target : null;

  // Countdown → redirect (full navigation so the fresh session cookie is used everywhere)
  useEffect(() => {
    if (!target || paused) return;
    if (left <= 0) {
      if (!goneRef.current) { goneRef.current = true; window.location.replace(target); }
      return;
    }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left, target, paused]);

  const go = () => { if (target && !goneRef.current) { goneRef.current = true; window.location.replace(target); } };

  // Countdown ring
  const R = 22;
  const C = 2 * Math.PI * R;
  const progress = target ? left / COUNTDOWN_SECONDS : 0;

  return (
    <div className="min-h-screen bg-canvas text-fg flex flex-col">
      <header className="bg-brand-grad">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between">
          <Link href="/" aria-label="Qozob home" className="rounded-md"><Wordmark tone="brand" size="md" /></Link>
          <ThemeToggle tone="brand" />
        </div>
      </header>

      <main className="flex-1 flex items-start sm:items-center justify-center px-5 py-10">
        <div className={cx(ui.card, 'w-full max-w-md p-6 sm:p-8 text-center animate-in fade-in zoom-in-95 duration-300')}>
          {view.kind === 'loading' && (
            <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" aria-label="Loading" /></div>
          )}

          {view.kind === 'ready' && (
            <>
              <div className="relative mx-auto mb-5 h-20 w-20">
                <span className="absolute inset-0 rounded-full bg-success/20 animate-ping motion-reduce:animate-none" aria-hidden />
                <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-success text-white shadow-lg">
                  <CheckCircle2 className="h-10 w-10" aria-hidden />
                </span>
              </div>
              <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight">
                {view.firstName ? `Welcome to Qozob, ${view.firstName}!` : 'Welcome to Qozob!'} <span aria-hidden>🎉</span>
              </h1>
              <p className="mt-2 text-sm text-fg-muted">Your email is verified and your account is ready.</p>

              {!view.isAdmin && (
                <ul className="mt-6 space-y-3 text-left">
                  {PERKS.map(({ icon: Icon, title, text }) => (
                    <li key={title} className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary"><Icon className="h-4 w-4" aria-hidden /></span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-fg">{title}</span>
                        <span className="block text-xs text-fg-muted mt-0.5">{text}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {view.kind === 'signin' && (
            <>
              <span className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-success-soft text-on-success-soft border border-success-line">
                <MailCheck className="h-10 w-10" aria-hidden />
              </span>
              <h1 className="text-2xl font-extrabold tracking-tight">You&apos;re verified <span aria-hidden>✅</span></h1>
              <p className="mt-2 text-sm text-fg-muted">Sign in once on this device to continue. Your email address is confirmed.</p>
            </>
          )}

          {view.kind === 'error' && (
            <>
              <span className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-warning-soft text-on-warning-soft border border-warning-line">
                <AlertTriangle className="h-10 w-10" aria-hidden />
              </span>
              <h1 className="text-2xl font-extrabold tracking-tight">That link didn&apos;t work</h1>
              <p className="mt-2 text-sm text-fg-muted">{ERROR_TEXT[view.code] || 'Something went wrong with this link.'}</p>
              <p className="mt-2 text-sm text-fg-muted">If you already confirmed your email, just sign in. Otherwise, sign up again to get a fresh link.</p>
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link href="/login" className={cx(ui.btn, ui.btnLg, ui.btnPrimary, 'flex-1')}>Sign in</Link>
                <Link href="/signup" className={cx(ui.btn, ui.btnLg, ui.btnSecondary, 'flex-1')}>Create account</Link>
              </div>
            </>
          )}

          {target && (
            <div className="mt-7 flex flex-col items-center gap-4">
              <div className="flex items-center gap-3" aria-live="polite">
                <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90" aria-hidden>
                  <circle cx="28" cy="28" r={R} fill="none" stroke="var(--line)" strokeWidth="5" />
                  <circle
                    cx="28" cy="28" r={R} fill="none" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round"
                    strokeDasharray={C} strokeDashoffset={C * (1 - progress)}
                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                  />
                  <text x="28" y="28" textAnchor="middle" dominantBaseline="central" transform="rotate(90 28 28)" className="fill-[var(--fg)] text-base font-bold">{Math.max(left, 0)}</text>
                </svg>
                <p className="text-sm text-fg-muted text-left">
                  {paused ? 'Paused.' : <>Taking you {view.kind === 'signin' ? 'to sign in' : view.kind === 'ready' && view.isAdmin ? 'to the admin dashboard' : 'to the map'} in <span className="font-semibold text-fg tabular">{Math.max(left, 0)}s</span>…</>}
                </p>
              </div>
              <button type="button" onClick={go} className={cx(ui.btn, ui.btnLg, ui.btnPrimary, 'w-full')}>
                {view.kind === 'signin' ? 'Sign in now' : view.kind === 'ready' && view.isAdmin ? 'Open admin dashboard' : 'Take me to the map'} <ArrowRight className="w-4 h-4" aria-hidden />
              </button>
              <button type="button" onClick={() => setPaused((p) => !p)} className="text-xs font-semibold text-fg-muted hover:text-fg underline underline-offset-4">
                {paused ? 'Resume countdown' : 'Stay on this page'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <WelcomeContent />
    </Suspense>
  );
}

