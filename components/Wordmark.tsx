import React from 'react';

/**
 * The refined "Qozob." wordmark: Inter, tight tracking, champagne full stop.
 * tone="brand"   → light text for navy surfaces
 * tone="surface" → ink text for card / page surfaces (adapts to dark mode)
 */
export function Wordmark({
  tone = 'surface',
  size = 'md',
  className = '',
}: {
  tone?: 'brand' | 'surface';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const sizes = { sm: 'text-lg', md: 'text-[22px]', lg: 'text-[28px]', xl: 'text-4xl' };
  const text = tone === 'brand' ? 'text-on-brand' : 'text-fg';
  const dot = tone === 'brand' ? 'text-brand-accent' : 'text-accent';
  return (
    <span className={`inline-flex items-baseline font-bold tracking-[-0.035em] leading-none select-none ${sizes[size]} ${text} ${className}`}>
      Qozob<span className={dot} aria-hidden>.</span>
    </span>
  );
}

