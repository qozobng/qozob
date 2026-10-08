"use client";

// "Email updates" switch for the signed-in user's Settings page.
import React, { useEffect, useState } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import { MAILING_CONSENT_TEXT } from '@/lib/mailingConsent';
import { cx } from '@/lib/ui';

type Status = 'loading' | 'subscribed' | 'pending' | 'off' | 'unavailable';

export function EmailUpdatesCard() {
  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/mailing/me')
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!alive) return;
        if (!ok) return setStatus('unavailable');
        setEmail(d.email ?? null);
        setStatus(d.status === 'subscribed' ? 'subscribed' : d.status === 'pending' ? 'pending' : 'off');
      })
      .catch(() => alive && setStatus('unavailable'));
    return () => { alive = false; };
  }, []);

  const on = status === 'subscribed';

  const toggle = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/mailing/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(on ? { subscribed: false } : { subscribed: true, consent: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not update.');
      if (d.status === 'subscribed') { setStatus('subscribed'); setMsg('Email updates are on.'); }
      else if (d.status === 'pending') { setStatus('pending'); setMsg('Check your inbox to confirm.'); }
      else { setStatus('off'); setMsg('Email updates are off. You will not get marketing emails.'); }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not update.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-surface border border-line rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-fg flex items-center gap-2"><Mail className="w-4 h-4 text-primary" aria-hidden /> Email updates</h3>
        <p className="text-sm text-fg-muted mt-0.5">
          {on ? `News and reward updates go to ${email ?? 'your email'}.`
            : status === 'pending' ? 'Waiting for you to confirm from your inbox.'
            : MAILING_CONSENT_TEXT}
        </p>
        {msg && <p role="status" className="text-xs font-medium text-fg mt-1.5">{msg}</p>}
      </div>
      {status === 'loading' ? (
        <Loader2 className="w-5 h-5 animate-spin text-fg-subtle" aria-label="Loading" />
      ) : status === 'unavailable' ? (
        <span className="text-xs text-fg-subtle">Not available right now</span>
      ) : (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Email updates"
          onClick={toggle}
          disabled={busy}
          className={cx(
            'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60',
            on ? 'bg-primary border-primary' : 'bg-surface-3 border-line-strong',
          )}
        >
          <span className={cx('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-6' : 'translate-x-1')} />
        </button>
      )}
    </div>
  );
}

