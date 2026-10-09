"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, Clock, Palette, Trophy, Check } from 'lucide-react';
import { ui, cx } from '@/lib/ui';

// =========================================================================
// COMMUNITY NOTICE
// One-time welcome card on the landing page: explains that prices are
// community-shared (not guaranteed), how to judge freshness/source, and
// invites people to help keep the data accurate. Shown again only when
// NOTICE_VERSION changes (e.g. after a wording or policy update).
// =========================================================================

const NOTICE_KEY = 'qz-community-notice';
const NOTICE_VERSION = 'v1';

function alreadyAccepted(): boolean {
  try { return localStorage.getItem(NOTICE_KEY) === NOTICE_VERSION; } catch { return false; }
}

const SOURCES = [
  { label: 'Community', color: 'var(--src-community)' },
  { label: 'Station owner', color: 'var(--src-owner)' },
  { label: 'Qozob rep', color: 'var(--src-rep)' },
];

export function CommunityNotice() {
  const [open, setOpen] = useState(false);

  // Appear shortly after the map starts loading, so it doesn't feel like a wall
  useEffect(() => {
    if (alreadyAccepted()) return;
    const id = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(id);
  }, []);

  // Lock page scroll while the card is up
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const accept = () => {
    try { localStorage.setItem(NOTICE_KEY, NOTICE_VERSION); } catch { /* private mode: show again next visit */ }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-[var(--overlay)] backdrop-blur-[2px] animate-in fade-in duration-300">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="qz-notice-title"
        aria-describedby="qz-notice-points"
        className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto bg-surface text-fg border border-line rounded-3xl shadow-2xl animate-in fade-in slide-in-from-bottom-6 sm:slide-in-from-bottom-2 sm:zoom-in-95 duration-300"
      >
        {/* Header */}
        <div className="relative overflow-hidden bg-brand-grad text-on-brand px-5 pt-5 pb-4 sm:px-6">
          <span aria-hidden className="pointer-events-none absolute -top-10 -right-8 h-32 w-32 rounded-full bg-brand-accent opacity-25 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <span className="relative shrink-0 h-11 w-11 rounded-2xl bg-on-brand/10 border border-on-brand/15 flex items-center justify-center">
              <Users className="w-5 h-5 text-brand-accent" aria-hidden />
              <span aria-hidden className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[var(--logo-dot)] animate-pulse" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-on-brand-muted">Welcome to Qozob</p>
              <h2 id="qz-notice-title" className="text-lg font-bold leading-snug">Live prices, powered by people like you</h2>
            </div>
          </div>
        </div>

        {/* Key points */}
        <ul id="qz-notice-points" className="px-5 sm:px-6 py-4 flex flex-col gap-3.5">
          <Point icon={Users} tone="bg-primary/10 text-primary" title="Shared by the community">
            Drivers, station owners and Qozob reps post these prices. Qozob doesn&apos;t set them and can&apos;t guarantee every one.
          </Point>
          <Point icon={Clock} tone="bg-warning-soft text-on-warning-soft" title="Check before you pay">
            Each price shows when it was last updated. Prices can change quickly, so confirm at the pump.
          </Point>
          <Point icon={Palette} tone="bg-surface-2 text-fg-muted" title="Know the source">
            <span className="flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
              {SOURCES.map(s => (
                <span key={s.label} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.label}
                </span>
              ))}
            </span>
          </Point>
          <Point icon={Trophy} tone="bg-success-soft text-on-success-soft" title="Help keep it accurate">
            Update prices you see and rate pumps. Honest updates help everyone and can earn monthly rewards.{' '}
            <Link href="/rewards/rules" className={ui.link}>How rewards work</Link>
          </Point>
        </ul>

        {/* Action */}
        <div className="px-5 sm:px-6 pb-5">
          <button type="button" autoFocus onClick={accept} className={cx(ui.btn, ui.btnLg, ui.btnPrimary, 'w-full')}>
            <Check className="w-4 h-4" aria-hidden /> I understand
          </button>
          <p className="mt-3 text-center text-xs text-fg-subtle leading-relaxed">
            Stay safe: never update prices while driving. By continuing you agree to our{' '}
            <Link href="/terms" className="underline underline-offset-2 hover:text-fg">Terms</Link> and{' '}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-fg">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}

function Point({ icon: Icon, tone, title, children }: {
  icon: React.ElementType;
  tone: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className={cx('mt-0.5 shrink-0 h-8 w-8 rounded-xl flex items-center justify-center', tone)}>
        <Icon className="w-4 h-4" aria-hidden />
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-fg leading-snug">{title}</p>
        <div className="text-fg-muted leading-relaxed mt-0.5">{children}</div>
      </div>
    </li>
  );
}

