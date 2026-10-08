"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { SITE } from '@/lib/site';

// =========================================================================
// SMART ADVERT CAROUSEL
// • Shows live adverts managed in Admin → Adverts (only live ones are readable, enforced by RLS).
// • Smooth slide with easing and a seamless loop; swipe on phones; dots to jump.
// • "Smart" rotation: higher-weight adverts stay on screen longer (4s + 1s per weight point),
//   rotation pauses on hover / touch / keyboard focus, when the tab is hidden, or when the
//   banner is scrolled out of view, and broken images are skipped automatically.
// • A view is counted once per advert per page visit, only when it is really on screen.
// =========================================================================

export type AdPlacement = 'mobile_bottom' | 'desktop_header';

interface Ad {
  id: string;
  title: string;
  advertiser: string | null;
  link_url: string | null;
  desktop_image_url: string | null;
  mobile_image_url: string | null;
  weight: number;
}

const REFRESH_MS = 10 * 60 * 1000; // pick up newly scheduled / expired adverts
const SLIDE_MS = 650;
const AD_FIELDS = 'id,title,advertiser,link_url,desktop_image_url,mobile_image_url,weight,placement,sort_order,created_at';

function dwellMs(weight: number) {
  return 4000 + (Math.min(10, Math.max(1, weight || 1)) - 1) * 1000;
}

const sameIds = (a: Ad[], b: Ad[]) => a.length === b.length && a.every((ad, i) => ad.id === b[i].id);

export function AdCarousel({ placement, className = '', lat, lng, viewerState }: {
  placement: AdPlacement;
  className?: string;
  /** Viewer's position, used only to pick local adverts (rounded to ~1 km, never stored). */
  lat?: number | null;
  lng?: number | null;
  /** State from the viewer's profile, used when their position isn't known. */
  viewerState?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [ads, setAds] = useState<Ad[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);          // position in the track (0..n, n = clone of first)
  const [animate, setAnimate] = useState(true);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string>>(new Set());
  const touchX = useRef<number | null>(null);

  // ~1 km grid: adverts only reload when the viewer moves to a different area
  const locKey = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
    ? `${lat.toFixed(2)},${lng.toFixed(2)}`
    : '';

  // ---- Load live adverts for this placement and area (LGA → state → nationwide) ----
  const load = useCallback(async () => {
    const [pLat, pLng] = locKey ? locKey.split(',').map(Number) : [null, null];
    let list: Ad[] | null = null;
    const { data, error } = await supabase.rpc('ads_for_viewer', {
      p_placement: placement,
      p_lat: pLat,
      p_lng: pLng,
      p_state: viewerState || null,
    });
    if (!error && data && Array.isArray((data as { ads?: unknown }).ads)) {
      list = (data as { ads: Ad[] }).ads;
    } else if (error && (error.code === 'PGRST202' || /ads_for_viewer/i.test(error.message || ''))) {
      // Targeting not installed yet (20261012_ad_targeting.sql): show every live advert as before
      const res = await supabase
        .from('ads')
        .select(AD_FIELDS)
        .in('placement', [placement, 'both'])
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(20);
      if (!res.error && res.data) list = res.data as Ad[];
    }
    if (list) {
      const next = list;
      setAds((prev) => (sameIds(prev, next) ? prev : next)); // keep the current slide if nothing changed
    }
    setLoaded(true);
  }, [supabase, placement, locKey, viewerState]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // Image for this slot (mobile falls back to the desktop banner and vice versa)
  const imageFor = useCallback((ad: Ad) =>
    placement === 'mobile_bottom' ? (ad.mobile_image_url || ad.desktop_image_url) : (ad.desktop_image_url || ad.mobile_image_url),
  [placement]);

  const slides = useMemo(() => ads.filter(a => imageFor(a) && !failed.has(a.id)), [ads, failed, imageFor]);
  const n = slides.length;
  const realIndex = n ? index % n : 0;

  // Keep the index valid if the list changes
  useEffect(() => { if (index > n) { setAnimate(false); setIndex(0); } }, [n, index]);

  // ---- Environment: reduced motion, tab visibility, on-screen ----
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMq = () => setReducedMotion(mq.matches);
    onMq();
    mq.addEventListener('change', onMq);
    const onVis = () => setPageVisible(document.visibilityState === 'visible');
    onVis();
    document.addEventListener('visibilitychange', onVis);
    return () => { mq.removeEventListener('change', onMq); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.5), { threshold: [0, 0.5, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, [n]);

  const active = inView && pageVisible;

  // ---- Count a view once per advert per visit, only while it is actually on screen ----
  useEffect(() => {
    if (!n || !active) return;
    const ad = slides[realIndex];
    if (!ad || seen.current.has(ad.id)) return;
    const t = setTimeout(() => {           // must stay visible for 1s to count
      seen.current.add(ad.id);
      supabase.rpc('track_ad_event', { p_ad_id: ad.id, p_event: 'impression' }).then(() => {}, () => {});
    }, 1000);
    return () => clearTimeout(t);
  }, [realIndex, active, n, slides, supabase]);

  // ---- Auto-advance ----
  const go = useCallback((next: number, withAnimation = true) => {
    setAnimate(withAnimation && !reducedMotion);
    setIndex(next);
  }, [reducedMotion]);

  useEffect(() => {
    if (n < 2 || paused || !active) return;
    const t = setTimeout(() => go(index + 1), dwellMs(slides[realIndex]?.weight));
    return () => clearTimeout(t);
  }, [index, n, paused, active, go, slides, realIndex]);

  // Seamless loop: after sliding onto the clone of slide 1, jump back to the real slide 1 without animation
  useEffect(() => {
    if (index !== n || n < 2) return;
    const t = setTimeout(() => { setAnimate(false); setIndex(0); }, animate ? SLIDE_MS : 0);
    return () => clearTimeout(t);
  }, [index, n, animate]);

  // Re-enable animation on the frame after an instant jump
  useEffect(() => {
    if (animate) return;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(!reducedMotion)));
    return () => cancelAnimationFrame(r);
  }, [animate, reducedMotion]);

  const next = () => n > 1 && go(index >= n ? 1 : index + 1);
  const prev = () => n > 1 && go(realIndex === 0 ? n - 1 : realIndex - 1, realIndex !== 0);

  const onClick = (ad: Ad) => {
    supabase.rpc('track_ad_event', { p_ad_id: ad.id, p_event: 'click' }).then(() => {}, () => {});
  };

  const isMobile = placement === 'mobile_bottom';
  const frame = isMobile ? 'h-[60px] w-full' : 'h-[90px] w-full max-w-[728px]';

  // ---- Nothing booked: a tasteful "advertise with us" house ad ----
  if (loaded && n === 0) {
    return (
      <a
        href={`mailto:${SITE.contactEmail}?subject=${encodeURIComponent('Advertising on Qozob')}`}
        className={`group relative flex ${frame} items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-brand-line text-on-brand-muted hover:text-on-brand hover:border-brand-accent/60 transition-colors ${className}`}
      >
        <span className="text-xs font-semibold uppercase tracking-[0.08em]">Advertise on Qozob</span>
        <span className="hidden sm:inline text-xs">· reach fuel buyers near your business</span>
      </a>
    );
  }
  if (!loaded) return <div className={`${frame} rounded-2xl bg-on-brand/5 animate-pulse ${className}`} aria-hidden />;

  const track = n > 1 ? [...slides, slides[0]] : slides;

  return (
    <div
      ref={rootRef}
      className={`relative ${frame} overflow-hidden rounded-2xl bg-brand-2 select-none ${className}`}
      role="region"
      aria-roledescription="carousel"
      aria-label="Sponsored"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; setPaused(true); }}
      onTouchEnd={(e) => {
        const start = touchX.current; touchX.current = null; setPaused(false);
        if (start === null) return;
        const dx = e.changedTouches[0].clientX - start;
        if (Math.abs(dx) > 40) (dx < 0 ? next() : prev());
      }}
    >
      <div
        className="flex h-full"
        style={{
          transform: `translate3d(-${index * 100}%, 0, 0)`,
          transition: animate ? `transform ${SLIDE_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)` : 'none',
        }}
      >
        {track.map((ad, i) => {
          const img = imageFor(ad)!;
          const body = (
            <img
              src={img}
              alt={ad.advertiser ? `${ad.title} by ${ad.advertiser}` : ad.title}
              className="h-full w-full object-contain"
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              draggable={false}
              onError={() => setFailed(prev => new Set(prev).add(ad.id))}
            />
          );
          return (
            <div key={`${ad.id}-${i}`} className="h-full w-full shrink-0" aria-hidden={i % (n || 1) !== realIndex || i === n}>
              {ad.link_url ? (
                <a href={ad.link_url} target="_blank" rel="noopener noreferrer sponsored" onClick={() => onClick(ad)} className="block h-full w-full" tabIndex={i === realIndex ? 0 : -1}>
                  {body}
                </a>
              ) : body}
            </div>
          );
        })}
      </div>

      {/* Transparency label */}
      <span className="pointer-events-none absolute top-1 left-1.5 rounded-full bg-black/55 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white">Ad</span>

      {/* Dots */}
      {n > 1 && (
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1.5">
          {slides.map((ad, i) => (
            <button
              key={ad.id}
              type="button"
              aria-label={`Show advert ${i + 1} of ${n}`}
              aria-current={i === realIndex}
              onClick={() => go(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === realIndex ? 'w-4 bg-brand-accent' : 'w-1.5 bg-white/50 hover:bg-white/80'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

