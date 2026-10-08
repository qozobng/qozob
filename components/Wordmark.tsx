import React from 'react';

/**
 * The original Qozob logo: the stroked "qozob" ambigram with the pulsating dot inside the "b".
 * Shapes are exactly the original artwork; only the colour adapts to where it sits.
 * tone="brand"   → mint strokes for grape brand surfaces (header, footer, sidebars)
 * tone="surface" → grape strokes for card / page surfaces (lavender in dark mode)
 * The dot is always mint and pulses (paused for users who prefer reduced motion).
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
  const sizes = { sm: 'h-5', md: 'h-6', lg: 'h-8 sm:h-10', xl: 'h-12' };
  const stroke = tone === 'brand' ? 'text-brand-accent' : 'text-primary';
  return (
    <span
      role="img"
      aria-label="Qozob"
      title="Qozob"
      className={`inline-flex items-center select-none transition-colors ${sizes[size]} ${stroke} ${className}`}
    >
      <svg
        viewBox="0 0 400 100"
        className="h-full w-auto"
        fill="none"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {/* q */}
        <circle cx="40" cy="50" r="26" />
        <path d="M66,50 V95" />
        {/* o */}
        <circle cx="120" cy="50" r="26" />
        {/* z */}
        <path d="M170,24 H230 L170,76 H230" />
        {/* o */}
        <circle cx="280" cy="50" r="26" />
        {/* b */}
        <path d="M334,5 V50" />
        <circle cx="360" cy="50" r="26" />
        {/* Pulsating dot perfectly centred inside the 'b' */}
        <circle cx="360" cy="50" r="8" stroke="none" className="animate-pulse" style={{ fill: 'var(--accent-solid)' }} />
      </svg>
    </span>
  );
}
