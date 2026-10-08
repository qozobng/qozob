"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, X, Navigation, Trophy, Star, CheckCircle2, Sparkles } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { GoogleGlyph } from '@/components/AuthShell';
import { ui, cx } from '@/lib/ui';

// =========================================================================
// SIGN-UP PROMPTS
// Browsing Qozob is open to everyone. When a guest taps something that needs an account
// (directions, dropping a price, rating, claiming) we show a friendly prompt instead of
// throwing them onto a login page. After signing up / in they come straight back to the
// station and the action they wanted (via ?next=/?select=ID&go=ACTION).
// =========================================================================

export type JoinReason = 'directions' | 'price' | 'rate' | 'claim' | 'nudge';

const COPY: Record<JoinReason, { title: string; text: (station?: string) => string }> = {
  directions: {
    title: 'Get directions with a free account 🧭',
    text: (s) => `Sign up in seconds and we'll open turn-by-turn directions${s ? ` to ${s}` : ''} right after.`,
  },
  price: {
    title: 'Drop a price, win rewards 💸',
    text: () => 'Your price helps other Nigerians save, and every verified update counts toward ₦10,000 monthly in your LGA.',
  },
  rate: {
    title: 'Rate this station ⭐',
    text: () => 'Tell others if the pump gives full litres. It takes a free account and two taps.',
  },
  claim: {
    title: 'Own this station? 🏪',
    text: () => 'Create a free station-owner account to claim it, publish official prices and see insights.',
  },
  nudge: {
    title: 'Make Qozob yours 🙌',
    text: () => 'Free account, no spam. Unlock directions and start earning toward ₦10,000 a month in your LGA.',
  },
};

const PERKS = [
  { icon: Navigation, text: 'Directions to the best-priced station' },
  { icon: Trophy, text: 'Win ₦10,000 monthly for updating prices' },
  { icon: Star, text: 'Rate pumps and track your contributions' },
];

/** Starts Google sign-in and returns to `next` afterwards (new accounts see the welcome page first). */
function useGoogleJoin(next: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const start = async () => {
    setLoading(true);
    setError('');
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (err) {
      setError(err.message);
      setLoading(false);
    }
  };
  return { loading, error, start };
}

const q = (next: string) => (next && next !== '/' ? `?next=${encodeURIComponent(next)}` : '');

export function JoinPrompt({ reason, stationName, next, onClose }: {
  reason: JoinReason;
  stationName?: string;
  next: string;
  onClose: () => void;
}) {
  const google = useGoogleJoin(next);
  const copy = COPY[reason];
  const signupHref = `/signup${q(next)}`;
  const loginHref = `/login${q(next)}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={cx(ui.overlay, 'z-[150]')} role="dialog" aria-modal="true" aria-labelledby="join-title" onClick={onClose}>
      <div className={cx(ui.modal, 'max-w-sm p-6 sm:p-7')} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className={ui.modalClose} aria-label="Close">
          <X className="w-5 h-5" />
        </button>

        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-lg" aria-hidden>
          <Sparkles className="h-6 w-6" />
        </span>
        <h2 id="join-title" className="mt-4 pr-8 text-xl font-bold tracking-tight text-fg">{copy.title}</h2>
        <p className="mt-2 text-sm text-fg-muted">{copy.text(stationName)}</p>

        <ul className="mt-4 space-y-2">
          {PERKS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2.5 text-sm text-fg">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 border border-line text-primary" aria-hidden>
                <Icon className="h-3.5 w-3.5" />
              </span>
              {text}
            </li>
          ))}
        </ul>

        {google.error && <p role="alert" className="mt-4 text-sm font-medium text-danger">{google.error}</p>}

        <div className="mt-6 space-y-2.5">
          <button
            type="button"
            onClick={google.start}
            disabled={google.loading}
            className={cx(ui.btn, ui.btnLg, ui.btnSecondary, 'w-full gap-3 shadow-sm')}
          >
            {google.loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <GoogleGlyph />}
            Continue with Google
          </button>
          <Link href={signupHref} className={cx(ui.btn, ui.btnLg, ui.btnPrimary, 'w-full')}>
            Create free account
          </Link>
        </div>

        <p className="mt-4 text-center text-sm text-fg-muted">
          Already have an account?{' '}
          <Link href={loginHref} className={ui.link}>Sign in</Link>
        </p>
        <button type="button" onClick={onClose} className="mt-2 w-full text-center text-xs font-medium text-fg-subtle hover:text-fg py-1">
          Not now, keep browsing
        </button>
      </div>
    </div>
  );
}

/** Small, dismissible bottom sheet shown to guests who are clearly finding Qozob useful. */
export function JoinNudge({ next, onClose }: { next: string; onClose: () => void }) {
  const google = useGoogleJoin(next);
  const copy = COPY.nudge;
  return (
    <div
      role="dialog"
      aria-labelledby="nudge-title"
      className="fixed z-[120] left-3 right-3 bottom-24 lg:left-6 lg:right-auto lg:bottom-6 lg:w-[380px] rounded-2xl border border-line bg-surface text-fg shadow-2xl p-4 animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      <button onClick={onClose} className="absolute top-2.5 right-2.5 p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-surface-2" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
      <p id="nudge-title" className="pr-8 text-base font-bold text-fg">{copy.title}</p>
      <p className="mt-1 text-sm text-fg-muted">{copy.text()}</p>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-fg">
        {['Directions', '₦10k monthly', 'Rate pumps'].map((t) => (
          <li key={t} className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden />{t}</li>
        ))}
      </ul>
      {google.error && <p role="alert" className="mt-2 text-xs font-medium text-danger">{google.error}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={google.start}
          disabled={google.loading}
          className={cx(ui.btn, 'h-10 px-3 text-sm', ui.btnSecondary, 'gap-2')}
        >
          {google.loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <GoogleGlyph className="w-4 h-4" />}
          Google
        </button>
        <Link href={`/signup${q(next)}`} className={cx(ui.btn, 'h-10 px-3 text-sm', ui.btnPrimary)}>
          Join free
        </Link>
      </div>
    </div>
  );
}
