import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { SITE } from '@/lib/site';
import { Wordmark } from '@/components/Wordmark';
import { ThemeToggle } from '@/components/ThemeToggle';

// Shared, readable layout for the Privacy Policy and Terms of Service pages.
export function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas font-sans text-fg">
      <header className="bg-brand-grad border-b border-brand-line">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
          <Link href="/" aria-label={`${SITE.name} home`} className="rounded-md">
            <Wordmark tone="brand" size="md" />
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/" className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium text-on-brand-muted hover:text-on-brand hover:bg-on-brand/5 transition-colors">
              <ArrowLeft className="w-4 h-4" aria-hidden /> Back to map
            </Link>
            <ThemeToggle tone="brand" />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10 sm:py-14">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-fg mb-2">{title}</h1>
        <p className="text-sm text-fg-subtle mb-6">Last updated: {SITE.legalLastUpdated}</p>
        <p className="text-lg text-fg-muted mb-10 leading-relaxed">{intro}</p>
        <div className="space-y-8 leading-relaxed text-fg [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-fg [&_h2]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_p]:mb-3 [&_li]:text-fg-muted [&_p]:text-fg-muted [&_strong]:text-fg [&_strong]:font-semibold [&_a]:text-accent [&_a]:font-semibold [&_a]:underline-offset-4 [&_a:hover]:underline">
          {children}
        </div>
      </main>

      <footer className="border-t border-line py-8 text-center text-xs text-fg-subtle">
        <div className="flex justify-center flex-wrap gap-x-6 gap-y-2 mb-2 text-sm font-medium text-fg-muted">
          <Link href="/privacy" className="hover:text-fg transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-fg transition-colors">Terms</Link>
          <Link href="/rewards/rules" className="hover:text-fg transition-colors">Rewards rules</Link>
          <a href={`mailto:${SITE.contactEmail}`} className="hover:text-fg transition-colors">Contact</a>
        </div>
        © {new Date().getFullYear()} {SITE.name}. All rights reserved.
      </footer>
    </div>
  );
}
