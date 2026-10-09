"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Horizontally scrolling tab row that also works with a mouse:
 *  - left / right arrow buttons appear only when there is more to see on that side
 *  - the mouse wheel scrolls sideways while the pointer is over the row
 *  - the selected tab (aria-selected="true") is scrolled into view when it changes
 * Touch screens keep normal swipe scrolling. The scrollbar itself stays hidden.
 */
export function ScrollTabs({
  children,
  activeKey,
  tone = 'brand',
  className = '',
  innerClassName = '',
  label,
}: {
  children: React.ReactNode;
  /** Changes whenever the selected tab changes, so it can be brought into view. */
  activeKey?: string;
  tone?: 'brand' | 'surface';
  className?: string;
  innerClassName?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft < max - 2;
    setEdges(prev => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);

    // Vertical mouse wheel → sideways scroll (only when the row can actually scroll)
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = el.scrollLeft >= max - 1 && e.deltaY > 0;
      if (atStart || atEnd) return; // let the page scroll normally at the ends
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('scroll', measure);
      el.removeEventListener('wheel', onWheel);
      ro?.disconnect();
    };
  }, [measure]);

  // Keep the selected tab visible
  useEffect(() => {
    const el = ref.current;
    const active = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el || !active) return;
    const a = active.offsetLeft, b = a + active.offsetWidth;
    if (a < el.scrollLeft + 40) el.scrollTo({ left: Math.max(0, a - 40), behavior: 'smooth' });
    else if (b > el.scrollLeft + el.clientWidth - 40) el.scrollTo({ left: b - el.clientWidth + 40, behavior: 'smooth' });
  }, [activeKey]);

  const nudge = (dir: -1 | 1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.6), behavior: 'smooth' });
  };

  const fade = tone === 'brand' ? 'from-brand' : 'from-surface';
  const btn = tone === 'brand'
    ? 'bg-brand-2 text-on-brand border-brand-line hover:bg-on-brand/15'
    : 'bg-surface text-fg border-line hover:bg-surface-2';

  return (
    <div className={`relative ${className}`}>
      <div
        ref={ref}
        role="tablist"
        aria-label={label}
        className={`flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden scroll-smooth ${innerClassName}`}
      >
        {children}
      </div>

      {edges.left && (
        <div className={`pointer-events-none absolute inset-y-0 left-0 w-14 flex items-center bg-gradient-to-r ${fade} to-transparent animate-in fade-in duration-150`}>
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label="Scroll tabs left"
            className={`pointer-events-auto ml-0.5 h-8 w-8 rounded-full border shadow-md flex items-center justify-center transition-colors ${btn}`}
          >
            <ChevronLeft className="w-4 h-4" aria-hidden />
          </button>
        </div>
      )}
      {edges.right && (
        <div className={`pointer-events-none absolute inset-y-0 right-0 w-14 flex items-center justify-end bg-gradient-to-l ${fade} to-transparent animate-in fade-in duration-150`}>
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label="Scroll tabs right"
            className={`pointer-events-auto mr-0.5 h-8 w-8 rounded-full border shadow-md flex items-center justify-center transition-colors ${btn}`}
          >
            <ChevronRight className="w-4 h-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

