"use client";

// /mailing — result page for the email confirmation link, and the unsubscribe page
// linked from every email (/mailing?unsubscribe=<token>). Unsubscribing needs one
// button press so email security scanners that "click" links can't unsubscribe people.
import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, AlertTriangle, Loader2, MailX, ArrowLeft } from 'lucide-react';
import { Wordmark } from '@/components/Wordmark';
import { SubscribeForm } from '@/components/SubscribeForm';
import { ui, cx } from '@/lib/ui';
import { SITE } from '@/lib/site';

const STATUS: Record<string, { ok: boolean; title: string; text: string }> = {
  confirmed: { ok: true, title: "You're subscribed!", text: `Thanks for confirming. You'll now get ${SITE.name} news, fuel-price tips and reward updates. Every email has a one-click unsubscribe link.` },
  expired: { ok: false, title: 'This link has expired', text: 'Confirmation links work for 7 days. Enter your email below to get a fresh one.' },
  invalid: { ok: false, title: 'This link is not valid', text: 'It may have been used already. If you are not yet subscribed, enter your email below.' },
  error: { ok: false, title: 'Something went wrong', text: 'We could not confirm your email right now. Please try again in a few minutes.' },
};

function MailingContent() {
  const params = useSearchParams();
  const status = params.get('status');
  const unsubToken = params.get('unsubscribe');
  const [unsubState, setUnsubState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  const unsubscribe = async () => {
    setUnsubState('busy');
    try {
      const res = await fetch('/api/mailing/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: unsubToken }),
      });
      setUnsubState(res.ok ? 'done' : 'error');
    } catch {
      setUnsubState('error');
    }
  };

  const info = status ? STATUS[status] ?? STATUS.invalid : null;

  return (
    <main className="min-h-screen bg-canvas text-fg flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8" aria-label={`${SITE.name} home`}><Wordmark size="lg" /></Link>
      <div className={cx(ui.card, 'w-full max-w-lg p-6 sm:p-8')}>
        {unsubToken ? (
          unsubState === 'done' ? (
            <div className="text-center">
              <CheckCircle2 className="w-12 h-12 mx-auto text-success" aria-hidden />
              <h1 className={cx(ui.h1, 'mt-4 text-2xl')}>You&apos;ve been unsubscribed</h1>
              <p className={cx(ui.body, 'mt-2')}>You won&apos;t receive any more marketing emails from {SITE.name}. We may still send emails you need about your account (for example, password resets or reward payments).</p>
            </div>
          ) : (
            <div className="text-center">
              <MailX className="w-12 h-12 mx-auto text-primary" aria-hidden />
              <h1 className={cx(ui.h1, 'mt-4 text-2xl')}>Unsubscribe from {SITE.name} emails?</h1>
              <p className={cx(ui.body, 'mt-2')}>Press the button and we&apos;ll stop sending you news and updates straight away.</p>
              {unsubState === 'error' && (
                <div className={cx(ui.alertError, 'mt-4 text-left')}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> We couldn&apos;t process that. Please try again, or email {SITE.contactEmail}.</div>
              )}
              <button onClick={unsubscribe} disabled={unsubState === 'busy'} className={cx(ui.btn, ui.btnLg, ui.btnPrimary, 'mt-6 w-full')}>
                {unsubState === 'busy' ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : 'Yes, unsubscribe me'}
              </button>
            </div>
          )
        ) : info ? (
          <div>
            <div className="text-center">
              {info.ok ? <CheckCircle2 className="w-12 h-12 mx-auto text-success" aria-hidden /> : <AlertTriangle className="w-12 h-12 mx-auto text-warning" aria-hidden />}
              <h1 className={cx(ui.h1, 'mt-4 text-2xl')}>{info.title}</h1>
              <p className={cx(ui.body, 'mt-2')}>{info.text}</p>
            </div>
            {!info.ok && <div className="mt-6"><SubscribeForm source="website" /></div>}
          </div>
        ) : (
          <SubscribeForm source="website" />
        )}
      </div>
      <Link href="/" className={cx(ui.link, 'mt-8 inline-flex items-center gap-1.5 text-sm')}><ArrowLeft className="w-4 h-4" aria-hidden /> Back to the fuel map</Link>
    </main>
  );
}

export default function MailingPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-canvas flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-fg-subtle" aria-label="Loading" /></main>}>
      <MailingContent />
    </Suspense>
  );
}

