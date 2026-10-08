import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Clock3, Gauge, ArrowLeft } from 'lucide-react';
import { Wordmark } from '@/components/Wordmark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SITE } from '@/lib/site';

const BENEFITS = [
  { icon: Gauge, emoji: '⛽', title: 'Live pump prices', text: 'Real prices from drivers, station owners and the Qozob team.' },
  { icon: Clock3, emoji: '⏱️', title: 'Skip the queue', text: 'See if there is a queue, or no fuel, before you set off.' },
  { icon: ShieldCheck, emoji: '✅', title: 'Stations you can trust', text: 'Verified owners and community pump-accuracy ratings.' },
];

/**
 * Split-screen layout shared by Sign in and Create account.
 * Left: grape brand panel (headline, benefits, sample price card). Right: the form.
 * On mobile the brand panel collapses into a compact header.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  wide = false,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] bg-canvas">
      {/* ===================== BRAND PANEL (desktop) ===================== */}
      <aside className="hidden lg:flex relative flex-col justify-between overflow-hidden bg-brand-grad text-on-brand p-10 xl:p-14">
        {/* Soft mint + lilac glow blobs for a fresh, friendly feel */}
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-brand-accent opacity-25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute bottom-10 -left-28 h-72 w-72 rounded-full bg-[#C084FC] opacity-25 blur-3xl" />

        <Link href="/" className="relative w-fit rounded-md" aria-label="Qozob home">
          <Wordmark tone="brand" size="lg" />
        </Link>

        <div className="relative max-w-md">
          <p className="inline-flex items-center gap-2 rounded-full bg-on-brand/10 border border-on-brand/15 px-3 py-1 text-xs font-semibold text-brand-accent mb-5">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-accent animate-pulse" aria-hidden /> Made for Nigerian drivers
          </p>
          <h2 className="text-4xl xl:text-[46px] font-extrabold tracking-tight leading-[1.08] text-on-brand">
            Find cheaper fuel near you <span aria-hidden>👋</span>
          </h2>
          <p className="mt-4 text-base leading-relaxed text-on-brand-muted">
            Live PMS prices, queue updates and trusted stations, all shared by people like you.
          </p>

          <ul className="mt-10 space-y-4">
            {BENEFITS.map(({ emoji, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-on-brand/10 border border-on-brand/15 text-lg" aria-hidden>
                  {emoji}
                </span>
                <span>
                  <span className="block text-sm font-bold text-on-brand">{title}</span>
                  <span className="block text-sm text-on-brand-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>

          {/* Sample price card: shows the product, not just tells */}
          <div className="mt-10 rounded-3xl border border-on-brand/15 bg-on-brand/10 p-4 backdrop-blur-md shadow-xl rotate-[-1.5deg]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-on-brand">Mobil, Admiralty Way</p>
                <p className="text-xs text-on-brand-muted mt-0.5">1.2 km · No queue · 5m ago</p>
              </div>
              <p className="text-2xl font-extrabold tabular text-on-brand">₦905</p>
            </div>
            <span className="mt-3 inline-flex items-center rounded-full bg-brand-accent px-2.5 py-1 text-xs font-bold text-brand">
              🔥 ₦45 below area average
            </span>
          </div>
        </div>

        <p className="relative text-xs text-on-brand-muted">
          © {new Date().getFullYear()} {SITE.name}. Prices are community-reported and may vary at the pump.
        </p>
      </aside>

      {/* ===================== FORM PANEL ===================== */}
      <main className="flex flex-col min-h-screen">
        <div className="flex items-center justify-between gap-4 px-5 sm:px-8 py-3 lg:py-4 bg-brand-grad lg:bg-none lg:bg-transparent">
          <Link href="/" className="lg:hidden rounded-md" aria-label="Qozob home">
            <Wordmark tone="brand" size="md" />
          </Link>
          <Link href="/" className="hidden lg:inline-flex items-center gap-1.5 h-9 px-3 -ml-3 rounded-full text-sm font-semibold text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors">
            <ArrowLeft className="w-4 h-4" aria-hidden /> Back to map
          </Link>
          <span className="lg:hidden"><ThemeToggle tone="brand" /></span>
          <span className="hidden lg:inline-flex"><ThemeToggle /></span>
        </div>

        <div className="flex-1 flex items-start sm:items-center justify-center px-5 sm:px-8 py-8 sm:py-10">
          <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-[420px]'}`}>
            <div className="mb-7">
              <h1 className="text-[26px] sm:text-[32px] font-extrabold tracking-tight leading-tight text-fg">{title}</h1>
              <p className="mt-2 text-sm text-fg-muted">{subtitle}</p>
            </div>
            {children}
          </div>
        </div>

        <footer className="px-5 sm:px-8 py-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-fg-subtle">
          <Link href="/terms" className="hover:text-fg transition-colors">Terms</Link>
          <Link href="/privacy" className="hover:text-fg transition-colors">Privacy</Link>
          <a href={`mailto:${SITE.contactEmail}`} className="hover:text-fg transition-colors">{SITE.contactEmail}</a>
        </footer>
      </main>
    </div>
  );
}

/** Official multi-colour Google "G" (brand guidelines require the original colours). */
export function GoogleGlyph({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

