"use client";

import React, { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { applyThemePreference, readThemePreference, type ThemePreference } from '@/lib/theme';

const ORDER: ThemePreference[] = ['light', 'dark', 'system'];
const LABEL: Record<ThemePreference, string> = { light: 'Light', dark: 'Dark', system: 'Auto' };
const ICON = { light: Sun, dark: Moon, system: Monitor };

/**
 * Light / Dark / Auto switch.
 * - `tone="brand"`  for indigo brand surfaces (header, sidebars)
 * - `tone="surface"` for light/dark card surfaces
 * - `variant="segmented"` shows all three options (used in settings); default is a compact cycling button.
 */
export function ThemeToggle({
  tone = 'surface',
  variant = 'compact',
  className = '',
}: {
  tone?: 'brand' | 'surface';
  variant?: 'compact' | 'segmented';
  className?: string;
}) {
  const [pref, setPref] = useState<ThemePreference>('system');

  useEffect(() => {
    setPref(readThemePreference());
    // Keep "Auto" in sync if the device switches between light and dark
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (readThemePreference() === 'system') applyThemePreference('system'); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const choose = (p: ThemePreference) => { setPref(p); applyThemePreference(p); };

  if (variant === 'segmented') {
    return (
      <div role="radiogroup" aria-label="Appearance" className={`inline-flex p-1 rounded-lg border border-line bg-surface-2 ${className}`}>
        {ORDER.map(p => {
          const Icon = ICON[p];
          const active = pref === p;
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(p)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                active ? 'bg-surface text-fg shadow-sm border border-line' : 'text-fg-muted hover:text-fg'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden /> {LABEL[p]}
            </button>
          );
        })}
      </div>
    );
  }

  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
  const Icon = ICON[pref];
  const toneClass = tone === 'brand'
    ? 'text-on-brand border-on-brand/20 bg-on-brand/5 hover:bg-on-brand/10'
    : 'text-fg border-line bg-surface hover:bg-surface-2';

  return (
    <button
      type="button"
      onClick={() => choose(next)}
      aria-label={`Appearance: ${LABEL[pref]}. Switch to ${LABEL[next]}`}
      title={`Appearance: ${LABEL[pref]} (click for ${LABEL[next]})`}
      className={`inline-flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-lg border text-xs font-medium transition-colors ${toneClass} ${className}`}
    >
      <Icon className="w-4 h-4" aria-hidden />
      <span className="hidden sm:inline">{LABEL[pref]}</span>
    </button>
  );
}

