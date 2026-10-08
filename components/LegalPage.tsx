import Link from 'next/link';
import { Droplet } from 'lucide-react';
import { SITE } from '@/lib/site';

// Shared, readable layout for the Privacy Policy and Terms of Service pages.
export function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-700">
      <header className="bg-indigo-900">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-2xl font-black tracking-tighter text-white hover:opacity-90">
            <Droplet className="w-6 h-6 text-emerald-400 fill-emerald-400" /> {SITE.name}.
          </Link>
          <Link href="/" className="text-sm font-bold text-indigo-200 hover:text-white">Back to map</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10">
        <h1 className="text-3xl sm:text-4xl font-black text-indigo-950 mb-2">{title}</h1>
        <p className="text-sm text-slate-400 font-bold mb-6">Last updated: {SITE.legalLastUpdated}</p>
        <p className="text-lg text-slate-600 mb-10 leading-relaxed">{intro}</p>
        <div className="space-y-8 leading-relaxed [&_h2]:text-xl [&_h2]:font-black [&_h2]:text-indigo-950 [&_h2]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_p]:mb-3 [&_a]:text-emerald-700 [&_a]:font-bold [&_a:hover]:underline">
          {children}
        </div>
      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-xs text-slate-400 font-bold">
        <div className="flex justify-center gap-6 mb-2">
          <Link href="/privacy" className="hover:text-emerald-600">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-emerald-600">Terms of Service</Link>
          <a href={`mailto:${SITE.contactEmail}`} className="hover:text-emerald-600">Contact</a>
        </div>
        © {new Date().getFullYear()} {SITE.name}. All rights reserved.
      </footer>
    </div>
  );
}

