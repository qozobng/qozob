"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Megaphone, Plus, Pencil, Trash2, Eye, MousePointerClick, Percent, Loader2, X, Image as ImageIcon,
  PauseCircle, PlayCircle, ExternalLink, CalendarClock, AlertTriangle,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { ui, cx } from '@/lib/ui';
import { StatCard } from '@/components/analytics/StatCard';
import { AreaChart, AreaDataPoint } from '@/components/analytics/AreaChart';
import { BarChart, BarItem } from '@/components/analytics/BarChart';

// =========================================================================
// ADMIN → ADVERTS
// Create, schedule, pause and measure the adverts shown in the map's
// desktop header slot (728×90) and the mobile bottom bar (640×100).
// Database rules (see supabase/migrations/20261009_ads.sql) make sure only admins can change ads.
// =========================================================================

const supabase = createClient();

type Placement = 'both' | 'mobile_bottom' | 'desktop_header';

interface AdRow {
  id: string;
  title: string;
  advertiser: string | null;
  link_url: string | null;
  desktop_image_url: string | null;
  desktop_image_path: string | null;
  mobile_image_url: string | null;
  mobile_image_path: string | null;
  placement: Placement;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  weight: number;
  sort_order: number;
  impressions: number;
  clicks: number;
  created_at: string;
  arcon_ref?: string | null;
  advertiser_confirmed?: boolean;
}

const ARCON_MISSING_WARNING =
  'This advert has no ARCON approval number. Under the ARCON Act 2022, adverts shown in Nigeria must be vetted by the Advertising Standards Panel before they appear. Show it anyway?';

interface StatRow { ad_id: string; day: string; impressions: number; clicks: number }

const PLACEMENT_LABEL: Record<Placement, string> = {
  both: 'Desktop header + mobile bar',
  desktop_header: 'Desktop header only',
  mobile_bottom: 'Mobile bottom bar only',
};

const SPEC = {
  desktop: { w: 728, h: 90, label: 'Desktop banner', hint: '728 × 90 px (or 1456 × 180 for sharp screens)' },
  mobile: { w: 640, h: 100, label: 'Mobile banner', hint: '640 × 100 px (shown 320 × 50 on phones)' },
} as const;
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

type Status = 'Live' | 'Scheduled' | 'Ended' | 'Paused';
function statusOf(ad: AdRow, now = Date.now()): Status {
  if (!ad.is_active) return 'Paused';
  if (new Date(ad.starts_at).getTime() > now) return 'Scheduled';
  if (ad.ends_at && new Date(ad.ends_at).getTime() <= now) return 'Ended';
  return 'Live';
}
const STATUS_CLASS: Record<Status, string> = {
  Live: 'bg-success-soft text-on-success-soft border-success-line',
  Scheduled: 'bg-info-soft text-on-info-soft border-info-line',
  Ended: 'bg-surface-2 text-fg-muted border-line',
  Paused: 'bg-warning-soft text-on-warning-soft border-warning-line',
};

// <input type="datetime-local"> works in local time
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const ctr = (clicks: number, views: number) => (views > 0 ? `${((clicks / views) * 100).toFixed(1)}%` : '—');

function readImageSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { reject(new Error('Could not read image')); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

// ---------------------------------------------------------------------------------------
export function AdsManager() {
  const [ads, setAds] = useState<AdRow[]>([]);
  const [stats, setStats] = useState<StatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdRow | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    const [{ data: adData, error: adErr }, { data: statData }] = await Promise.all([
      supabase.from('ads').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
      supabase.from('ad_stats_daily').select('*').gte('day', since),
    ]);
    if (adErr) {
      setError(adErr.message.includes('relation') || adErr.code === '42P01'
        ? 'The adverts tables are not set up yet. Run supabase/migrations/20261009_ads.sql in the Supabase SQL editor.'
        : adErr.message);
    }
    setAds((adData as AdRow[]) || []);
    setStats((statData as StatRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ---- Analytics ----
  const now = Date.now();
  const counts = useMemo(() => {
    const c = { Live: 0, Scheduled: 0, Ended: 0, Paused: 0 } as Record<Status, number>;
    ads.forEach(a => c[statusOf(a, now)]++);
    return c;
  }, [ads, now]);

  const totals30 = useMemo(() => stats.reduce((t, s) => ({ v: t.v + s.impressions, c: t.c + s.clicks }), { v: 0, c: 0 }), [stats]);

  const daily: AreaDataPoint[] = useMemo(() => {
    const byDay = new Map<string, number>();
    stats.forEach(s => byDay.set(s.day, (byDay.get(s.day) || 0) + s.impressions));
    const out: AreaDataPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      out.push({ label: d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }), value: byDay.get(key) || 0 });
    }
    return out;
  }, [stats, now]);

  const clicksByAd: BarItem[] = useMemo(() => {
    const m = new Map<string, number>();
    stats.forEach(s => m.set(s.ad_id, (m.get(s.ad_id) || 0) + s.clicks));
    return ads
      .map(a => ({ id: a.id, label: a.title, value: m.get(a.id) || 0, color: 'var(--chart-2)' }))
      .filter(b => b.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [ads, stats]);

  // ---- Actions ----
  const toggleActive = async (ad: AdRow) => {
    if (!ad.is_active && !ad.arcon_ref && !window.confirm(ARCON_MISSING_WARNING)) return;
    setBusyId(ad.id);
    const { error } = await supabase.from('ads').update({ is_active: !ad.is_active }).eq('id', ad.id);
    setBusyId(null);
    if (error) return alert('Could not update: ' + error.message);
    setAds(prev => prev.map(a => (a.id === ad.id ? { ...a, is_active: !a.is_active } : a)));
  };

  const remove = async (ad: AdRow) => {
    if (!window.confirm(`Delete "${ad.title}"? Its images and statistics will be removed too.`)) return;
    setBusyId(ad.id);
    const { error } = await supabase.from('ads').delete().eq('id', ad.id);
    if (!error) {
      const paths = [ad.desktop_image_path, ad.mobile_image_path].filter(Boolean) as string[];
      if (paths.length) await supabase.storage.from('ad_creatives').remove(paths);
      setAds(prev => prev.filter(a => a.id !== ad.id));
    }
    setBusyId(null);
    if (error) alert('Could not delete: ' + error.message);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl sm:text-[28px] font-bold tracking-tight text-fg">Adverts</h2>
          <p className="text-fg-muted text-sm mt-1">Banners in the map&apos;s desktop header and mobile bottom bar. They rotate automatically.</p>
        </div>
        <button onClick={() => setEditing('new')} className={cx(ui.btn, ui.btnMd, ui.btnPrimary)}>
          <Plus className="w-4 h-4" aria-hidden /> New advert
        </button>
      </div>

      {error && <div className={ui.alertError}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Live now" value={counts.Live} subtitle={`${counts.Scheduled} scheduled · ${counts.Paused} paused`} icon={Megaphone} colorTheme="emerald" />
        <StatCard title="Views (30 days)" value={totals30.v.toLocaleString()} subtitle="Counted when an ad is on screen for 1s" icon={Eye} colorTheme="indigo" />
        <StatCard title="Clicks (30 days)" value={totals30.c.toLocaleString()} subtitle="Taps that opened the advertiser link" icon={MousePointerClick} colorTheme="blue" />
        <StatCard title="Click-through rate" value={ctr(totals30.c, totals30.v)} subtitle="Clicks ÷ views, last 30 days" icon={Percent} colorTheme="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={cx(ui.card, 'p-5 lg:col-span-2')}>
          <AreaChart title="Daily views" subtitle="All adverts, last 30 days" data={daily} color="var(--chart-1)" emptyMessage="No views recorded yet" />
        </div>
        <div className={cx(ui.card, 'p-5')}>
          <BarChart title="Clicks by advert" subtitle="Last 30 days" data={clicksByAd} layout="horizontal" emptyMessage="No clicks yet" />
        </div>
      </div>

      {/* ---- List ---- */}
      <section className={cx(ui.card, 'overflow-hidden')}>
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <h3 className={ui.h2}>All adverts</h3>
          <span className="text-xs text-fg-subtle">Lower &quot;order&quot; shows first · higher weight stays on screen longer</span>
        </div>
        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-fg-subtle" aria-label="Loading" /></div>
        ) : ads.length === 0 ? (
          <div className="p-10 text-center">
            <Megaphone className="w-8 h-8 mx-auto text-fg-subtle mb-2" aria-hidden />
            <p className="text-sm font-semibold text-fg">No adverts yet</p>
            <p className="text-sm text-fg-muted mt-1">Until you add one, the slots show an &quot;Advertise on Qozob&quot; message.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {ads.map(ad => {
              const st = statusOf(ad, now);
              const preview = ad.desktop_image_url || ad.mobile_image_url;
              return (
                <li key={ad.id} className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center gap-4">
                  <div className="w-full md:w-56 shrink-0 aspect-[728/90] rounded-xl bg-brand-2 overflow-hidden border border-line flex items-center justify-center">
                    {preview ? <img src={preview} alt="" className="h-full w-full object-contain" /> : <ImageIcon className="w-5 h-5 text-on-brand-muted" aria-hidden />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-fg truncate">{ad.title}</p>
                      <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold', STATUS_CLASS[st])}>{st}</span>
                      {ad.arcon_ref
                        ? <span className="inline-flex items-center rounded-full border border-success-line bg-success-soft text-on-success-soft px-2 py-0.5 text-xs font-semibold" title="ARCON approval number">ARCON {ad.arcon_ref}</span>
                        : <span className="inline-flex items-center rounded-full border border-warning-line bg-warning-soft text-on-warning-soft px-2 py-0.5 text-xs font-semibold">No ARCON ref</span>}
                    </div>
                    <p className="text-xs text-fg-muted mt-1">
                      {ad.advertiser ? `${ad.advertiser} · ` : ''}{PLACEMENT_LABEL[ad.placement]} · weight {ad.weight} · order {ad.sort_order}
                    </p>
                    <p className="text-xs text-fg-subtle mt-0.5 inline-flex items-center gap-1">
                      <CalendarClock className="w-3.5 h-3.5" aria-hidden /> {fmtDate(ad.starts_at)} → {ad.ends_at ? fmtDate(ad.ends_at) : 'no end date'}
                    </p>
                    {ad.link_url && (
                      <a href={ad.link_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 max-w-full truncate">
                        <ExternalLink className="w-3 h-3 shrink-0" aria-hidden /> <span className="truncate">{ad.link_url}</span>
                      </a>
                    )}
                  </div>
                  <div className="flex md:flex-col gap-4 md:gap-1 text-sm tabular md:text-right shrink-0">
                    <span><span className="font-semibold text-fg">{Number(ad.impressions).toLocaleString()}</span> <span className="text-fg-subtle text-xs">views</span></span>
                    <span><span className="font-semibold text-fg">{Number(ad.clicks).toLocaleString()}</span> <span className="text-fg-subtle text-xs">clicks</span></span>
                    <span><span className="font-semibold text-fg">{ctr(Number(ad.clicks), Number(ad.impressions))}</span> <span className="text-fg-subtle text-xs">CTR</span></span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => toggleActive(ad)} disabled={busyId === ad.id} className={cx(ui.btn, ui.btnSm, ui.btnSoft)} title={ad.is_active ? 'Pause' : 'Resume'}>
                      {ad.is_active ? <PauseCircle className="w-4 h-4" aria-hidden /> : <PlayCircle className="w-4 h-4" aria-hidden />}
                      {ad.is_active ? 'Pause' : 'Resume'}
                    </button>
                    <button onClick={() => setEditing(ad)} className={cx(ui.btn, ui.btnSm, ui.btnSecondary)}><Pencil className="w-4 h-4" aria-hidden /> Edit</button>
                    <button onClick={() => remove(ad)} disabled={busyId === ad.id} className={cx(ui.btn, ui.btnSm, ui.btnDanger)} aria-label={`Delete ${ad.title}`}><Trash2 className="w-4 h-4" aria-hidden /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {editing && <AdEditor ad={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
function AdEditor({ ad, onClose, onSaved }: { ad: AdRow | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(ad?.title || '');
  const [advertiser, setAdvertiser] = useState(ad?.advertiser || '');
  const [linkUrl, setLinkUrl] = useState(ad?.link_url || '');
  const [placement, setPlacement] = useState<Placement>(ad?.placement || 'both');
  const [startsAt, setStartsAt] = useState(toLocalInput(ad?.starts_at || new Date().toISOString()));
  const [endsAt, setEndsAt] = useState(toLocalInput(ad?.ends_at || null));
  const [weight, setWeight] = useState(ad?.weight || 5);
  const [sortOrder, setSortOrder] = useState(ad?.sort_order || 0);
  const [isActive, setIsActive] = useState(ad?.is_active ?? true);
  const [arconRef, setArconRef] = useState(ad?.arcon_ref || '');
  const [advertiserConfirmed, setAdvertiserConfirmed] = useState(ad?.advertiser_confirmed ?? false);
  const [files, setFiles] = useState<{ desktop?: File; mobile?: File }>({});
  const [previews, setPreviews] = useState<{ desktop?: string; mobile?: string }>({ desktop: ad?.desktop_image_url || undefined, mobile: ad?.mobile_image_url || undefined });
  const [warnings, setWarnings] = useState<{ desktop?: string; mobile?: string }>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = async (kind: 'desktop' | 'mobile', file: File | undefined) => {
    if (!file) return;
    if (!TYPES.includes(file.type)) return setErr('Please use a PNG, JPG, WebP or GIF image.');
    if (file.size > MAX_BYTES) return setErr('Images must be 2 MB or smaller.');
    setErr(null);
    setFiles(f => ({ ...f, [kind]: file }));
    setPreviews(p => ({ ...p, [kind]: URL.createObjectURL(file) }));
    try {
      const { w, h } = await readImageSize(file);
      const want = SPEC[kind].w / SPEC[kind].h;
      const off = Math.abs(w / h - want) / want;
      setWarnings(x => ({ ...x, [kind]: off > 0.12 ? `This image is ${w} × ${h}. ${SPEC[kind].hint} fits best; other shapes get letter-boxed.` : undefined }));
    } catch { /* preview still works */ }
  };

  const needsDesktop = placement !== 'mobile_bottom';
  const needsMobile = placement !== 'desktop_header';

  const save = async () => {
    setErr(null);
    if (!title.trim()) return setErr('Give the advert a title (used for screen readers and reports).');
    if (linkUrl && !/^https?:\/\/\S+$/i.test(linkUrl.trim())) return setErr('The link must start with https:// (or http://).');
    const hasDesktop = !!(files.desktop || ad?.desktop_image_url);
    const hasMobile = !!(files.mobile || ad?.mobile_image_url);
    if (!hasDesktop && !hasMobile) return setErr('Upload at least one banner image.');
    if (needsDesktop && !hasDesktop && placement === 'desktop_header') return setErr('Upload a desktop banner for the desktop header slot.');
    if (needsMobile && !hasMobile && placement === 'mobile_bottom') return setErr('Upload a mobile banner for the mobile bar.');
    const s = fromLocalInput(startsAt);
    const e = fromLocalInput(endsAt);
    if (!s) return setErr('Choose a start date.');
    if (e && new Date(e) <= new Date(s)) return setErr('The end date must be after the start date.');
    const ref = arconRef.trim();
    if (ref && (ref.length < 3 || ref.length > 80)) return setErr('The ARCON approval number should be 3 to 80 characters.');
    if (isActive && !ref && !window.confirm(ARCON_MISSING_WARNING)) return;

    setSaving(true);
    try {
      const folder = ad?.id || crypto.randomUUID();
      const uploaded: Record<string, { url: string; path: string }> = {};
      for (const kind of ['desktop', 'mobile'] as const) {
        const f = files[kind];
        if (!f) continue;
        const ext = (f.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        const path = `${folder}/${kind}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('ad_creatives').upload(path, f, { contentType: f.type, cacheControl: '31536000', upsert: false });
        if (upErr) throw new Error(`Image upload failed: ${upErr.message}`);
        uploaded[kind] = { url: supabase.storage.from('ad_creatives').getPublicUrl(path).data.publicUrl, path };
      }

      const row = {
        title: title.trim(),
        advertiser: advertiser.trim() || null,
        link_url: linkUrl.trim() || null,
        placement,
        starts_at: s,
        ends_at: e,
        weight,
        sort_order: sortOrder,
        is_active: isActive,
        arcon_ref: arconRef.trim() || null,
        advertiser_confirmed: advertiserConfirmed,
        ...(uploaded.desktop ? { desktop_image_url: uploaded.desktop.url, desktop_image_path: uploaded.desktop.path } : {}),
        ...(uploaded.mobile ? { mobile_image_url: uploaded.mobile.url, mobile_image_path: uploaded.mobile.path } : {}),
      };

      const { error: dbErr } = ad
        ? await supabase.from('ads').update(row).eq('id', ad.id)
        : await supabase.from('ads').insert({ id: folder, ...row });
      if (dbErr) {
        const paths = Object.values(uploaded).map(u => u.path);
        if (paths.length) await supabase.storage.from('ad_creatives').remove(paths);
        throw new Error(dbErr.message);
      }

      // Replaced images: tidy up the old files
      const old = [uploaded.desktop && ad?.desktop_image_path, uploaded.mobile && ad?.mobile_image_path].filter(Boolean) as string[];
      if (old.length) await supabase.storage.from('ad_creatives').remove(old);
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const imageField = (kind: 'desktop' | 'mobile') => (
    <div>
      <label className={ui.label} htmlFor={`ad-${kind}`}>{SPEC[kind].label}</label>
      <div className={cx('rounded-xl bg-brand-2 border border-line overflow-hidden flex items-center justify-center', kind === 'desktop' ? 'aspect-[728/90]' : 'aspect-[640/100]')}>
        {previews[kind] ? <img src={previews[kind]} alt="" className="h-full w-full object-contain" /> : <span className="text-xs text-on-brand-muted">{SPEC[kind].hint}</span>}
      </div>
      <input id={`ad-${kind}`} type="file" accept={TYPES.join(',')} onChange={e => pick(kind, e.target.files?.[0])} className={cx(ui.file, 'mt-2')} />
      <p className={ui.hint}>{SPEC[kind].hint}. PNG, JPG, WebP or GIF, up to 2 MB.</p>
      {warnings[kind] && <p className="mt-1 text-xs font-medium text-warning">{warnings[kind]}</p>}
    </div>
  );

  return (
    <div className={ui.overlay} role="dialog" aria-modal="true" aria-labelledby="ad-editor-title">
      <div className={cx(ui.modal, 'max-w-2xl max-h-[92vh] overflow-y-auto p-6 sm:p-7')}>
        <button onClick={onClose} className={ui.modalClose} aria-label="Close"><X className="w-5 h-5" /></button>
        <h2 id="ad-editor-title" className={cx(ui.h2, 'text-xl pr-8')}>{ad ? 'Edit advert' : 'New advert'}</h2>
        <p className="text-sm text-fg-muted mt-1 mb-6">Adverts appear in rotation. Make sure you have the advertiser&apos;s approval and that the advert complies with ARCON rules.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={ui.label} htmlFor="ad-title">Title</label>
            <input id="ad-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} className={ui.input} placeholder="e.g. Mobil weekend discount" />
          </div>
          <div>
            <label className={ui.label} htmlFor="ad-advertiser">Advertiser (optional)</label>
            <input id="ad-advertiser" value={advertiser} onChange={e => setAdvertiser(e.target.value)} maxLength={120} className={ui.input} placeholder="Company name" />
          </div>
          <div>
            <label className={ui.label} htmlFor="ad-link">Link when tapped (optional)</label>
            <input id="ad-link" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} className={ui.input} placeholder="https://" inputMode="url" />
          </div>
          <div>
            <label className={ui.label} htmlFor="ad-arcon">ARCON approval number</label>
            <input id="ad-arcon" value={arconRef} onChange={e => setArconRef(e.target.value)} maxLength={80} className={ui.input} placeholder="From the advertiser's ASP vetting certificate" autoComplete="off" />
            <p className={ui.hint}>Ask the advertiser for their Advertising Standards Panel (ARCON) approval and keep a copy on file.</p>
          </div>
          <label className="sm:self-center flex items-start gap-3 text-sm text-fg rounded-xl border border-line p-3">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={advertiserConfirmed} onChange={e => setAdvertiserConfirmed(e.target.checked)} />
            <span>The advertiser has confirmed in writing that this advert is truthful, lawful and approved where required, and that they are responsible for its content.</span>
          </label>
          <div className="sm:col-span-2">
            <label className={ui.label} htmlFor="ad-placement">Where to show it</label>
            <select id="ad-placement" value={placement} onChange={e => setPlacement(e.target.value as Placement)} className={ui.select}>
              {(Object.keys(PLACEMENT_LABEL) as Placement[]).map(p => <option key={p} value={p}>{PLACEMENT_LABEL[p]}</option>)}
            </select>
          </div>

          {needsDesktop && <div className="sm:col-span-2">{imageField('desktop')}</div>}
          {needsMobile && <div className="sm:col-span-2">{imageField('mobile')}</div>}

          <div>
            <label className={ui.label} htmlFor="ad-start">Starts</label>
            <input id="ad-start" type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} className={ui.input} />
          </div>
          <div>
            <label className={ui.label} htmlFor="ad-end">Ends (optional)</label>
            <input id="ad-end" type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} className={ui.input} />
          </div>
          <div>
            <label className={ui.label} htmlFor="ad-weight">Weight: {weight} <span className="font-normal text-fg-subtle">({4 + weight - 1}s on screen)</span></label>
            <input id="ad-weight" type="range" min={1} max={10} value={weight} onChange={e => setWeight(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
          </div>
          <div>
            <label className={ui.label} htmlFor="ad-order">Order</label>
            <input id="ad-order" type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value) || 0)} className={ui.input} />
          </div>
          <label className="sm:col-span-2 flex items-center gap-3 text-sm font-medium text-fg cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="h-5 w-5 rounded accent-[var(--primary)]" />
            Active (uncheck to save as paused)
          </label>
        </div>

        {err && <div className={cx(ui.alertError, 'mt-5')}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {err}</div>}

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className={cx(ui.btn, ui.btnMd, ui.btnSecondary)}>Cancel</button>
          <button onClick={save} disabled={saving} className={cx(ui.btn, ui.btnMd, ui.btnPrimary)}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} {ad ? 'Save changes' : 'Create advert'}
          </button>
        </div>
      </div>
    </div>
  );
}

