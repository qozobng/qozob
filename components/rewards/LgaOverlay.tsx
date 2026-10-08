"use client";

// =========================================================================
// LGA boundaries on the main map + the "Win ₦10k" rewards chip.
// Sits inside the map box (top-right), so it never adds height on mobile.
// Outlines come from the `lga_shapes` RPC (only the LGAs in view, simplified
// for the current zoom), drawn with google.maps.Data.
// =========================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMap } from '@vis.gl/react-google-maps';
import { Layers, Trophy } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { cx } from '@/lib/ui';

const STORAGE_KEY = 'qozob-lga-overlay';
const MIN_ZOOM = 9;
const LINE = '#4F46E5';   // indigo-600 (reads well on the light map style)

function toleranceFor(zoom: number) {
  if (zoom >= 13) return 0.0004;
  if (zoom >= 11) return 0.001;
  return 0.003;
}
const bucketFor = (zoom: number) => (zoom >= 13 ? 3 : zoom >= 11 ? 2 : 1);

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function LgaOverlay({ prizeLabel = '\u20A610k' }: { prizeLabel?: string }) {
  const map = useMap('main-map');
  const [supabase] = useState(() => createClient());
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'zoom' | 'unavailable'>('idle');

  const dataRef = useRef<google.maps.Data | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const bucketRef = useRef<number>(0);
  const reqRef = useRef(0);

  // Remember the person's choice
  useEffect(() => {
    try { setOn(localStorage.getItem(STORAGE_KEY) === '1'); } catch { /* private mode */ }
  }, []);
  const toggle = () => {
    setOn(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  // Create the Data layer once the map exists
  useEffect(() => {
    if (!map) return;
    const data = new google.maps.Data();
    data.setStyle(f => ({
      strokeColor: LINE,
      strokeOpacity: 0.85,
      strokeWeight: f.getProperty('hover') ? 2.5 : 1.5,
      fillColor: LINE,
      fillOpacity: f.getProperty('hover') ? 0.12 : 0.03,
      clickable: true,
      zIndex: 1,
    }));
    const info = new google.maps.InfoWindow();
    const l1 = data.addListener('mouseover', (e: google.maps.Data.MouseEvent) => e.feature.setProperty('hover', true));
    const l2 = data.addListener('mouseout', (e: google.maps.Data.MouseEvent) => e.feature.setProperty('hover', false));
    const l3 = data.addListener('click', (e: google.maps.Data.MouseEvent) => {
      const id = e.feature.getId();
      const name = escapeHtml(String(e.feature.getProperty('name') || 'LGA'));
      const state = escapeHtml(String(e.feature.getProperty('state') || ''));
      info.setContent(
        `<div style="font-family:inherit;color:#0F172A;min-width:180px;padding:2px 2px 4px">` +
        `<div style="font-weight:700;font-size:14px">${name}</div>` +
        `<div style="font-size:12px;color:#475569;margin-top:2px">${state}</div>` +
        `<a href="/rewards?lga=${encodeURIComponent(String(id))}" style="display:inline-block;margin-top:8px;font-size:13px;font-weight:600;color:#4338CA;text-decoration:underline">` +
        `See this LGA's leaderboard</a></div>`
      );
      info.setPosition(e.latLng);
      info.open({ map });
    });
    dataRef.current = data;
    infoRef.current = info;
    return () => {
      [l1, l2, l3].forEach(l => l.remove());
      info.close();
      data.setMap(null);
      dataRef.current = null;
      infoRef.current = null;
    };
  }, [map]);

  const load = useCallback(async () => {
    const data = dataRef.current;
    if (!map || !data) return;
    const zoom = map.getZoom() ?? 0;
    const bounds = map.getBounds();
    if (zoom < MIN_ZOOM || !bounds) { setStatus('zoom'); data.setMap(null); return; }
    data.setMap(map);

    const bucket = bucketFor(zoom);
    if (bucket !== bucketRef.current) {          // different detail level: start fresh
      data.forEach(f => data.remove(f));
      bucketRef.current = bucket;
    }
    const sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
    const req = ++reqRef.current;
    setStatus('loading');
    const { data: rows, error } = await supabase.rpc('lga_shapes', {
      p_min_lng: sw.lng(), p_min_lat: sw.lat(), p_max_lng: ne.lng(), p_max_lat: ne.lat(),
      p_tolerance: toleranceFor(zoom),
    });
    if (req !== reqRef.current) return;           // a newer request is on its way
    if (error) { setStatus('unavailable'); return; }
    const list = (rows || []) as { id: number; name: string; state: string; geojson: string }[];
    if (list.length === 0) { setStatus('unavailable'); return; }
    const features = list
      .filter(r => !data.getFeatureById(r.id))
      .map(r => ({ type: 'Feature', id: r.id, properties: { name: r.name, state: r.state }, geometry: JSON.parse(r.geojson) }));
    if (features.length) data.addGeoJson({ type: 'FeatureCollection', features });
    setStatus('idle');
  }, [map, supabase]);

  // Follow the map while the overlay is on
  useEffect(() => {
    const data = dataRef.current;
    if (!map || !data) return;
    if (!on) { data.setMap(null); infoRef.current?.close(); setStatus('idle'); return; }
    load();
    const l = map.addListener('idle', load);
    return () => l.remove();
  }, [map, on, load]);

  const hint =
    status === 'zoom' ? 'Zoom in to see LGAs' :
    status === 'unavailable' ? 'LGA boundaries not available here yet' :
    status === 'loading' ? 'Loading LGAs\u2026' : null;

  return (
    <div className="theme-light absolute top-4 right-4 z-40 flex flex-col items-end gap-1.5">
      <Link
        href="/rewards"
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-900 text-xs font-bold px-3 py-1.5 shadow-md border border-amber-500/40 transition-colors"
        title="Top price updater in each LGA wins every month"
      >
        <Trophy className="w-3.5 h-3.5" aria-hidden /> Win {prizeLabel}
      </Link>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        className={cx(
          'inline-flex items-center gap-1.5 rounded-full text-xs font-semibold px-3 py-1.5 shadow-md border transition-colors',
          on ? 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700' : 'bg-white/95 text-slate-900 border-slate-200 hover:bg-slate-50',
        )}
        title="Show local government area boundaries"
      >
        <Layers className="w-3.5 h-3.5" aria-hidden /> LGAs
      </button>
      {on && hint && (
        <span className="rounded-md bg-white/95 border border-slate-200 text-slate-700 text-xs font-medium px-2 py-1 shadow-sm" role="status">
          {hint}
        </span>
      )}
      {on && (
        <a
          href="https://www.geoboundaries.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded bg-white/90 text-slate-700 text-xs px-1.5 py-0.5 underline-offset-2 hover:underline"
        >
          Boundaries: GRID3 / geoBoundaries (CC BY 4.0)
        </a>
      )}
    </div>
  );
}

