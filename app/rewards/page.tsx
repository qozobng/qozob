"use client";

// /rewards — the public campaign page: how it works, coins, rules summary and live leaderboards.
import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Trophy, MapPin, Fuel, Coins, ShieldCheck, CalendarCheck, BadgeCheck, Smartphone, Landmark, Clock, Ban, Sparkles,
} from 'lucide-react';
import { Wordmark } from '@/components/Wordmark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Leaderboard } from '@/components/rewards/Leaderboard';
import { useRewardSettings } from '@/components/rewards/hooks';
import { createClient } from '@/utils/supabase/client';
import { naira } from '@/lib/rewards';
import { ui, cx } from '@/lib/ui';
import { SITE } from '@/lib/site';

function RewardsContent() {
  const params = useSearchParams();
  const lgaParam = Number(params.get('lga'));
  const initialLgaId = Number.isInteger(lgaParam) && lgaParam > 0 ? lgaParam : null;
  const { settings } = useRewardSettings();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, []);

  const prize = naira(settings.monthly_prize_ngn);
  const annual = settings.annual_prize_ngn ? naira(settings.annual_prize_ngn) : 'To be announced';
  const joinHref = signedIn ? '/user-dashboard?tab=rewards' : '/login?redirect=rewards';

  const steps = [
    { icon: MapPin, title: 'Go to a station', text: 'Visit any filling station near you, with your phone\u2019s location turned on.' },
    { icon: Fuel, title: 'Update the price', text: 'Tap the station on the Qozob map and enter the pump price and queue you see.' },
    { icon: Coins, title: 'Earn coins', text: `Each checked update earns ${settings.coins_per_update} coins (+${settings.coins_fresh_bonus} bonus if no one has earned coins at that station in the last 24 hours).` },
    { icon: Trophy, title: 'Top your LGA', text: `The person with the most coins in each LGA at month end wins ${prize}.` },
  ];

  const rules = [
    { icon: BadgeCheck, text: 'Be 18 or older and live in Nigeria' },
    { icon: Smartphone, text: 'Verify your phone number' },
    { icon: ShieldCheck, text: 'Verify your identity (NIN, voter\u2019s card, driver\u2019s licence or passport)' },
    { icon: Landmark, text: 'Add the Nigerian bank account we should pay into (in your own name)' },
    { icon: CalendarCheck, text: `Update prices on at least ${settings.min_active_days} different days in the month` },
  ];

  const fairPlay = [
    { icon: MapPin, text: `You must be at the station (within about ${(settings.max_distance_m / 1000).toLocaleString('en-NG')} km) to earn coins` },
    { icon: Clock, text: `One rewarded update per station every ${settings.cooldown_hours} hours, and up to ${settings.daily_cap} a day` },
    { icon: ShieldCheck, text: 'Prices far from nearby prices are checked by a reviewer before coins count' },
    { icon: Ban, text: 'Fake prices, fake locations or multiple accounts lead to strikes and a ban' },
  ];

  return (
    <div className="min-h-screen bg-canvas text-fg font-sans">
      {/* HEADER */}
      <header className="bg-brand-grad border-b border-brand-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-5 py-3 sm:py-4 flex items-center justify-between gap-4">
          <Link href="/" aria-label={`${SITE.name} home`} className="rounded-md"><Wordmark tone="brand" size="md" /></Link>
          <div className="flex items-center gap-2">
            <Link href="/" className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium text-on-brand-muted hover:text-on-brand hover:bg-on-brand/5 transition-colors">
              <ArrowLeft className="w-4 h-4" aria-hidden /> Back to map
            </Link>
            <ThemeToggle tone="brand" />
          </div>
        </div>

        {/* CAMPAIGN HERO */}
        <div className="max-w-6xl mx-auto px-4 sm:px-5 pt-6 pb-10 sm:pt-10 sm:pb-14 grid lg:grid-cols-[1.3fr_1fr] gap-8 items-center">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-300 text-slate-900 text-xs font-bold px-3 py-1">
              <Sparkles className="w-3.5 h-3.5" aria-hidden /> Qozob Rewards
            </p>
            <h1 className="mt-4 text-3xl sm:text-5xl font-extrabold tracking-tight text-on-brand leading-[1.1]">
              Win {prize} every month in your LGA
            </h1>
            <p className="mt-4 text-base sm:text-lg text-on-brand-muted max-w-xl">
              Help fellow Nigerians find fair fuel prices. Update prices at stations near you, collect coins, and the top updater in each of Nigeria&apos;s 774 local government areas wins.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={joinHref} className={cx(ui.btn, ui.btnLg, 'bg-amber-300 text-slate-900 hover:bg-amber-200 font-bold')}>
                <Trophy className="w-5 h-5" aria-hidden /> {signedIn ? 'Go to my rewards' : 'Join and start earning'}
              </Link>
              <Link href="/" className={cx(ui.btn, ui.btnLg, 'border border-on-brand/30 text-on-brand hover:bg-on-brand/10')}>
                <MapPin className="w-5 h-5" aria-hidden /> Open the map
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { k: prize, v: 'Monthly prize per LGA' },
              { k: '774', v: 'LGAs, each with its own winner' },
              { k: annual, v: 'National grand prize (Jan\u2013Dec)' },
              { k: '7th', v: 'Monthly prizes paid by the 7th' },
            ].map(s => (
              <div key={s.v} className="rounded-2xl bg-on-brand/10 border border-on-brand/15 p-4">
                <p className="text-xl sm:text-2xl font-extrabold text-on-brand tabular break-words">{s.k}</p>
                <p className="text-xs sm:text-sm text-on-brand-muted mt-1">{s.v}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-5 py-8 sm:py-12 space-y-10 sm:space-y-14">
        {!settings.program_active && (
          <div className={ui.alertWarning}>The rewards programme is paused right now. Price updates still help everyone, and coins will start again when it resumes.</div>
        )}

        {/* HOW IT WORKS */}
        <section aria-labelledby="how-title">
          <p className={ui.eyebrow}>How it works</p>
          <h2 id="how-title" className={cx(ui.h1, 'mt-1')}>Four simple steps</h2>
          <ol className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((s, i) => (
              <li key={s.title} className={cx(ui.card, 'p-5')}>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-on-primary"><s.icon className="w-5 h-5" aria-hidden /></span>
                  <span className="text-xs font-bold text-fg-subtle">STEP {i + 1}</span>
                </div>
                <h3 className="mt-3 font-bold text-fg">{s.title}</h3>
                <p className="mt-1 text-sm text-fg-muted leading-relaxed">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* LEADERBOARD */}
        <section aria-label="Leaderboard">
          <Leaderboard settings={settings} initialLgaId={initialLgaId} />
        </section>

        {/* QUALIFY + FAIR PLAY */}
        <section className="grid lg:grid-cols-2 gap-4">
          <div className={cx(ui.card, 'p-5 sm:p-6')}>
            <h2 className={ui.h2}>To claim a prize you need to</h2>
            <ul className="mt-4 space-y-3">
              {rules.map(r => (
                <li key={r.text} className="flex items-start gap-3 text-sm text-fg">
                  <r.icon className="w-5 h-5 text-success flex-shrink-0" aria-hidden /> {r.text}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-fg-subtle">You can start collecting coins straight away and finish verification any time before the month closes.</p>
          </div>
          <div className={cx(ui.card, 'p-5 sm:p-6')}>
            <h2 className={ui.h2}>Fair play</h2>
            <ul className="mt-4 space-y-3">
              {fairPlay.map(r => (
                <li key={r.text} className="flex items-start gap-3 text-sm text-fg">
                  <r.icon className="w-5 h-5 text-primary flex-shrink-0" aria-hidden /> {r.text}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-fg-subtle">{SITE.name} staff, representatives and station owners or managers cannot win.</p>
          </div>
        </section>

        {/* PAYOUTS */}
        <section className={cx(ui.card, 'p-5 sm:p-6')}>
          <h2 className={ui.h2}>When are prizes paid?</h2>
          <div className="mt-4 grid sm:grid-cols-2 gap-4 text-sm text-fg-muted leading-relaxed">
            <p><strong className="text-fg">Monthly:</strong> winners for each LGA are confirmed after the month ends and paid by bank transfer by the <strong className="text-fg">7th of the next month</strong>.</p>
            <p><strong className="text-fg">Annual:</strong> one national grand prize ({annual}) for January to December, paid by <strong className="text-fg">31 January</strong>. You need at least {settings.annual_min_active_days} active days in the year.</p>
          </div>
          <p className="mt-4 text-sm text-fg-muted">
            Full details are in the <Link href="/rewards/rules" className={ui.link}>Rewards Official Rules</Link>. Questions? Email <a href={`mailto:${SITE.contactEmail}`} className={ui.link}>{SITE.contactEmail}</a>.
          </p>
        </section>

        {/* CTA */}
        <section className="rounded-3xl bg-brand-grad border border-brand-line p-6 sm:p-10 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-on-brand tracking-tight">Your next fuel stop could pay you</h2>
          <p className="mt-2 text-on-brand-muted">It takes 10 seconds to update a price. Every update helps someone save money.</p>
          <Link href={joinHref} className={cx(ui.btn, ui.btnLg, 'mt-6 bg-amber-300 text-slate-900 hover:bg-amber-200 font-bold')}>
            <Trophy className="w-5 h-5" aria-hidden /> {signedIn ? 'Go to my rewards' : 'Join Qozob Rewards'}
          </Link>
        </section>
      </main>

      <footer className="border-t border-line py-8 text-center text-xs text-fg-subtle px-4">
        <div className="flex justify-center flex-wrap gap-x-6 gap-y-2 mb-3 text-sm font-medium text-fg-muted">
          <Link href="/" className="hover:text-fg transition-colors">Map</Link>
          <Link href="/rewards/rules" className="hover:text-fg transition-colors">Rewards rules</Link>
          <Link href="/privacy" className="hover:text-fg transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-fg transition-colors">Terms</Link>
        </div>
        <p>LGA boundaries: GRID3 / geoBoundaries, licensed CC BY 4.0.</p>
        <p className="mt-1">&copy; {new Date().getFullYear()} {SITE.name}. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default function RewardsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <RewardsContent />
    </Suspense>
  );
}
