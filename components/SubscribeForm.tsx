"use client";

// Email sign-up box. The consent box starts unticked and the button stays disabled
// until it is ticked (NDPA 2023 / NDPC GAID 2025: consent must be a clear, active choice).
import React, { useId, useState } from 'react';
import Link from 'next/link';
import { Loader2, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import { MAILING_CONSENT_TEXT, type MailingSource } from '@/lib/mailingConsent';
import { ui, cx } from '@/lib/ui';

export function SubscribeForm({
  source = 'website',
  tone = 'surface',
  title = 'Get fuel-price news by email',
  subtitle = 'Price trends, money-saving tips and reward announcements. No spam.',
}: {
  source?: MailingSource;
  tone?: 'surface' | 'brand';
  title?: string;
  subtitle?: string;
}) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [honey, setHoney] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const onBrand = tone === 'brand';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) return setResult({ ok: false, msg: 'Please tick the box to agree first.' });
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/mailing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, consent: true, source, website: honey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not subscribe. Please try again.');
      setResult({
        ok: true,
        msg: data.status === 'subscribed'
          ? "You're subscribed. Thank you!"
          : 'Almost done! Check your inbox (and spam folder) for a confirmation link.',
      });
      setEmail('');
      setConsent(false);
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : 'Could not subscribe.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="w-full" aria-labelledby={`${id}-title`}>
      <p id={`${id}-title`} className={cx('font-bold text-base', onBrand ? 'text-on-brand' : 'text-fg')}>{title}</p>
      <p className={cx('text-sm mt-0.5', onBrand ? 'text-on-brand-muted' : 'text-fg-muted')}>{subtitle}</p>

      {/* Honeypot for bots (hidden from people and screen readers) */}
      <input type="text" tabIndex={-1} autoComplete="off" value={honey} onChange={e => setHoney(e.target.value)}
        className="hidden" aria-hidden="true" name="website" />

      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
        <div className="relative flex-1 min-w-0">
          <Mail className={cx('absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4', onBrand ? 'text-on-brand-muted' : 'text-fg-subtle')} aria-hidden />
          <input
            id={`${id}-email`}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={onBrand
              ? 'block w-full h-11 pl-11 pr-4 rounded-full bg-white/10 border border-brand-line text-on-brand text-sm placeholder:text-on-brand-muted outline-none focus:ring-4 focus:ring-brand-accent/30 focus:border-brand-accent'
              : cx(ui.input, ui.inputWithIcon, 'h-11 rounded-full')}
          />
        </div>
        <button type="submit" disabled={busy || !consent}
          className={cx(ui.btn, 'h-11 px-5 shrink-0', onBrand ? 'bg-brand-accent text-[#1E1B4B] hover:brightness-110' : ui.btnPrimary)}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : 'Subscribe'}
        </button>
      </div>

      <label className={cx('mt-2.5 flex items-start gap-2.5 text-xs leading-relaxed cursor-pointer', onBrand ? 'text-on-brand-muted' : 'text-fg-muted')}>
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[var(--brand-accent)]" />
        <span>
          {MAILING_CONSENT_TEXT} See our{' '}
          <Link href="/privacy" className={cx('underline underline-offset-2 font-semibold', onBrand ? 'text-on-brand' : 'text-fg')}>Privacy Policy</Link>.
        </span>
      </label>

      {result && (
        <p role="status" className={cx('mt-2.5 flex items-start gap-2 text-sm font-medium',
          onBrand ? 'text-on-brand' : result.ok ? 'text-success' : 'text-danger')}>
          {result.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-brand-accent" aria-hidden /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />}
          {result.msg}
        </p>
      )}
    </form>
  );
}

