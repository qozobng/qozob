"use client";

// =========================================================================
// ADMIN · STATIONS DIRECTORY
// Every station with all its fields. Pick the columns to show, filter by
// brand / state / status, search, sort, quick-edit and download to Excel.
// =========================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, Pencil, X } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { brandName } from '@/lib/brands';
import { QUEUE_OPTIONS, normaliseQueue, queueLabel } from '@/lib/queue';
import { fetchAllRows, isMissingFunction } from '@/lib/fetchAll';
import { cx, ui } from '@/lib/ui';
import { ReportTable, type ReportColumn } from './ReportTable';

const supabase = createClient();

export interface DirectoryRow {
  station_id: string;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  lga_id: number | null;
  lga: string | null;
  state: string | null;
  price_pms: number | null;
  queue_status: string | null;
  verified: boolean;
  updated_by_role: string | null;
  last_updated: string | null;
  claim_status: string | null;
  manager_id: string | null;
  manager_email: string | null;
  manager_name: string | null;
  custom_logo_url: string | null;
  pump_accuracy: number | null;
  accuracy_votes: number | null;
  reports_30d: number | null;
  held_reports: number | null;
  last_report_at: string | null;
  created_at: string | null;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function ownership(r: DirectoryRow): 'Claimed' | 'Verified' | 'Community' {
  if (r.manager_id || r.claim_status === 'Claimed') return 'Claimed';
  return r.verified ? 'Verified' : 'Community';
}

const QUEUE_TONE: Record<string, string> = {
  'No Queue': 'bg-success-soft text-on-success-soft',
  Moderate: 'bg-warning-soft text-on-warning-soft',
  Heavy: 'bg-danger-soft text-on-danger-soft',
  'No Fuel': 'bg-danger-soft text-on-danger-soft',
};

type StatusFilter = 'all' | 'has_price' | 'no_price' | 'verified' | 'unverified' | 'claimed' | 'queue' | 'held';
const STATUS_LABEL: Record<StatusFilter, string> = {
  all: 'All stations',
  has_price: 'Has a live price',
  no_price: 'No price yet',
  verified: 'Verified',
  unverified: 'Not verified',
  claimed: 'Claimed by owner',
  queue: 'Queue / no fuel alert',
  held: 'Has prices waiting for review',
};

export function StationsDirectory({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false); // older database: fewer columns

  const [brand, setBrand] = useState('all');
  const [state, setState] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [editing, setEditing] = useState<DirectoryRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchAllRows<DirectoryRow>((from, to) =>
      supabase.rpc('admin_station_directory').range(from, to),
    );

    if (!res.error) {
      setRows(res.rows.map((r) => ({
        ...r,
        lat: num(r.lat), lng: num(r.lng), price_pms: num(r.price_pms), pump_accuracy: num(r.pump_accuracy),
        accuracy_votes: num(r.accuracy_votes), reports_30d: num(r.reports_30d), held_reports: num(r.held_reports),
      })));
      setLimited(false);
    } else if (isMissingFunction(res.error)) {
      // Database update not run yet: read the table directly (no owner email / report counts)
      const [st, lg] = await Promise.all([
        fetchAllRows<Record<string, unknown>>((from, to) => supabase.from('stations').select('*').order('station_id').range(from, to)),
        fetchAllRows<{ id: number; name: string; state: string }>((from, to) => supabase.from('lgas').select('id, name, state').order('id').range(from, to)),
      ]);
      if (st.error) {
        setError(st.error.message);
      } else {
        const lgaById = new Map(lg.rows.map((l) => [l.id, l]));
        setRows(st.rows.map((s) => {
          const l = lgaById.get(Number(s.lga_id));
          return {
            station_id: String(s.station_id), name: (s.name as string) ?? null, address: (s.address as string) ?? null,
            lat: num(s.lat), lng: num(s.lng), lga_id: num(s.lga_id), lga: l?.name ?? null, state: l?.state ?? null,
            price_pms: num(s.price_pms), queue_status: (s.queue_status as string) ?? null, verified: !!s.verified,
            updated_by_role: (s.updated_by_role as string) ?? null, last_updated: (s.last_updated as string) ?? null,
            claim_status: (s.claim_status as string) ?? null, manager_id: (s.manager_id as string) ?? null,
            manager_email: null, manager_name: null, custom_logo_url: (s.custom_logo_url as string) ?? null,
            pump_accuracy: num(s.pump_accuracy), accuracy_votes: num(s.accuracy_votes),
            reports_30d: null, held_reports: null, last_report_at: null, created_at: (s.created_at as string) ?? null,
          };
        }));
        setLimited(true);
      }
    } else {
      setError(res.error.message);
    }
    setLoadedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const brands = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => { const b = brandName(r.name); m.set(b, (m.get(b) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const states = useMemo(
    () => [...new Set(rows.map((r) => r.state).filter((s): s is string => !!s))].sort(),
    [rows],
  );

  const filtered = useMemo(() => rows.filter((r) => {
    if (brand !== 'all' && brandName(r.name) !== brand) return false;
    if (state === '__none' ? !!r.state : state !== 'all' && r.state !== state) return false;
    switch (status) {
      case 'has_price': return r.price_pms !== null && r.price_pms > 0;
      case 'no_price': return r.price_pms === null || r.price_pms <= 0;
      case 'verified': return r.verified;
      case 'unverified': return !r.verified;
      case 'claimed': return ownership(r) === 'Claimed';
      case 'queue': { const q = normaliseQueue(r.queue_status); return q === 'Moderate' || q === 'Heavy' || q === 'No Fuel'; }
      case 'held': return (r.held_reports || 0) > 0;
      default: return true;
    }
  }), [rows, brand, state, status]);

  const columns = useMemo<ReportColumn<DirectoryRow>[]>(() => [
    {
      key: 'name', header: 'Station', get: (r) => r.name, width: 32,
      render: (r) => (
        <div className="min-w-[180px] max-w-xs">
          <p className="font-semibold text-fg leading-snug">{r.name || 'Unnamed station'}</p>
          {r.address && <p className="text-fg-muted truncate">{r.address}</p>}
        </div>
      ),
    },
    { key: 'brand', header: 'Brand', get: (r) => brandName(r.name), width: 16 },
    { key: 'address', header: 'Address', get: (r) => r.address, defaultVisible: false, width: 40 },
    { key: 'lga', header: 'LGA', get: (r) => r.lga, width: 18 },
    { key: 'state', header: 'State', get: (r) => r.state, width: 14 },
    {
      key: 'price', header: 'PMS price (₦/L)', get: (r) => r.price_pms, type: 'money', align: 'right',
      render: (r) => r.price_pms
        ? <span className="font-semibold font-mono text-sm">₦{r.price_pms.toLocaleString('en-NG')}</span>
        : <span className="text-fg-subtle italic">No price yet</span>,
    },
    {
      key: 'queue', header: 'Queue', get: (r) => queueLabel(r.queue_status),
      render: (r) => (
        <span className={cx('inline-flex px-2 py-0.5 rounded-full font-semibold whitespace-nowrap', QUEUE_TONE[normaliseQueue(r.queue_status)] || 'bg-surface-2 text-fg-muted')}>
          {queueLabel(r.queue_status)}
        </span>
      ),
    },
    {
      key: 'ownership', header: 'Status', get: (r) => ownership(r),
      render: (r) => {
        const o = ownership(r);
        return (
          <span className={cx('inline-flex items-center gap-1 font-semibold whitespace-nowrap', o === 'Community' ? 'text-fg-muted' : 'text-success')}>
            {o !== 'Community' && <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />}{o}
          </span>
        );
      },
    },
    { key: 'updated_by', header: 'Last updated by', get: (r) => r.updated_by_role },
    { key: 'last_updated', header: 'Last price update', get: (r) => r.last_updated, type: 'datetime' },
    {
      key: 'accuracy', header: 'Pump rating', get: (r) => r.pump_accuracy, type: 'number', align: 'right',
      render: (r) => r.accuracy_votes
        ? <span className="whitespace-nowrap">{Number(r.pump_accuracy || 0).toFixed(1)} ★ <span className="text-fg-subtle">({r.accuracy_votes})</span></span>
        : <span className="text-fg-subtle">—</span>,
    },
    { key: 'votes', header: 'Rating votes', get: (r) => r.accuracy_votes, type: 'integer', align: 'right', defaultVisible: false },
    { key: 'verified', header: 'Verified', get: (r) => r.verified, type: 'boolean', defaultVisible: false },
    { key: 'claim_status', header: 'Claim status', get: (r) => r.claim_status || 'None', defaultVisible: false },
    { key: 'manager_name', header: 'Owner name', get: (r) => r.manager_name, defaultVisible: false },
    { key: 'manager_email', header: 'Owner email', get: (r) => r.manager_email, defaultVisible: false, width: 28 },
    { key: 'reports_30d', header: 'Price reports (30 days)', get: (r) => r.reports_30d, type: 'integer', align: 'right', defaultVisible: false },
    { key: 'held', header: 'Waiting for review', get: (r) => r.held_reports, type: 'integer', align: 'right', defaultVisible: false },
    { key: 'last_report', header: 'Last community report', get: (r) => r.last_report_at, type: 'datetime', defaultVisible: false },
    { key: 'lat', header: 'Latitude', get: (r) => r.lat, type: 'number', defaultVisible: false },
    { key: 'lng', header: 'Longitude', get: (r) => r.lng, type: 'number', defaultVisible: false },
    { key: 'logo', header: 'Custom logo URL', get: (r) => r.custom_logo_url, defaultVisible: false, width: 40 },
    { key: 'created', header: 'Added to Qozob', get: (r) => r.created_at, type: 'datetime', defaultVisible: false },
    { key: 'station_id', header: 'Station ID', get: (r) => r.station_id, defaultVisible: false, width: 30 },
  ], []);

  const meta = [
    brand !== 'all' ? `Brand: ${brand}` : '',
    state !== 'all' ? `State: ${state === '__none' ? 'Not assigned' : state}` : '',
    status !== 'all' ? `Status: ${STATUS_LABEL[status]}` : '',
  ].filter(Boolean);

  const selectCls = 'h-10 px-3 rounded-full bg-surface-2 border border-line text-xs font-semibold text-fg outline-none focus:border-primary cursor-pointer max-w-[11rem]';

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl sm:text-3xl font-semibold text-fg mb-1">Station directory</h2>
        <p className="text-fg-muted text-xs sm:text-sm">
          All stations with every recorded field. Choose columns, filter, and download exactly what you see to Excel.
        </p>
      </div>

      {error && <div className={ui.alertError}>Could not load stations: {error}</div>}
      {limited && (
        <div className={ui.alertWarning}>
          Showing basic columns only. Run the latest database update (20261014) to add owner details and price-report counts.
        </div>
      )}

      <ReportTable
        id="admin-stations"
        title="Stations"
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.station_id}
        loading={loading}
        loadedAt={loadedAt}
        onRefresh={load}
        meta={meta}
        searchPlaceholder="Search name, address, LGA, owner…"
        initialSort={{ key: 'last_updated', dir: 'desc' }}
        emptyText="No stations match these filters."
        toolbar={
          <>
            <select value={brand} onChange={(e) => setBrand(e.target.value)} className={selectCls} aria-label="Brand">
              <option value="all">All brands</option>
              {brands.map(([b, n]) => <option key={b} value={b}>{b} ({n})</option>)}
            </select>
            <select value={state} onChange={(e) => setState(e.target.value)} className={selectCls} aria-label="State">
              <option value="all">All states</option>
              {states.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value="__none">LGA not assigned</option>
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className={selectCls} aria-label="Status">
              {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
            </select>
          </>
        }
        rowActions={(r) => (
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setEditing(r)}
              className={cx(ui.btn, ui.btnSoft, ui.btnSm)}
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden /> Edit
            </button>
            {r.lat !== null && r.lng !== null && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-fg-subtle hover:text-fg hover:bg-surface-3 rounded-lg transition-colors"
                title="Open in Google Maps"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}
      />

      {editing && (
        <QuickEdit
          station={editing}
          onClose={() => setEditing(null)}
          onSaved={(patch) => {
            setRows((prev) => prev.map((r) => (r.station_id === editing.station_id ? { ...r, ...patch } : r)));
            setEditing(null);
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function QuickEdit({
  station, onClose, onSaved,
}: { station: DirectoryRow; onClose: () => void; onSaved: (patch: Partial<DirectoryRow>) => void }) {
  const [name, setName] = useState(station.name || '');
  const [address, setAddress] = useState(station.address || '');
  const [price, setPrice] = useState(station.price_pms ? String(station.price_pms) : '');
  const [queue, setQueue] = useState<string>(normaliseQueue(station.queue_status));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setErr(null);
    const patch: Partial<DirectoryRow> & Record<string, unknown> = {};
    if (name.trim() && name.trim() !== (station.name || '')) patch.name = name.trim();
    if (address.trim() !== (station.address || '')) patch.address = address.trim() || null;

    const priceChanged = price.trim() !== '' && Number(price) !== station.price_pms;
    if (priceChanged) {
      const p = Number(price);
      if (!Number.isFinite(p) || p < 100 || p > 100000) return setErr('Enter a price between ₦100 and ₦100,000.');
      patch.price_pms = Math.round(p * 100) / 100;
    }
    const queueChanged = queue !== normaliseQueue(station.queue_status) && queue !== 'Unknown';
    if (queueChanged) patch.queue_status = queue;
    if (priceChanged || queueChanged) {
      patch.verified = true;
      patch.updated_by_role = 'Qozob rep';
      patch.last_updated = new Date().toISOString();
    }
    if (Object.keys(patch).length === 0) return onClose();

    setSaving(true);
    const { error } = await supabase.from('stations').update(patch).eq('station_id', station.station_id);
    setSaving(false);
    if (error) return setErr(error.message);
    onSaved(patch);
  };

  return (
    <div className={ui.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Edit station" className={cx(ui.modal, 'max-w-md p-6')}>
        <button type="button" onClick={onClose} className={ui.modalClose} aria-label="Close"><X className="w-5 h-5" /></button>
        <p className={ui.eyebrow}>Admin quick edit</p>
        <h3 className="text-lg font-bold text-fg mt-0.5 pr-8 leading-snug">{station.name}</h3>
        <p className="text-xs text-fg-muted mb-4">{[station.lga, station.state].filter(Boolean).join(', ') || 'LGA not assigned'}</p>

        <div className="flex flex-col gap-3">
          <div>
            <label className={ui.label} htmlFor="qe-name">Station name</label>
            <input id="qe-name" className={cx(ui.input, 'h-11')} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <div>
            <label className={ui.label} htmlFor="qe-address">Address</label>
            <input id="qe-address" className={cx(ui.input, 'h-11')} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={240} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={ui.label} htmlFor="qe-price">PMS price (₦/L)</label>
              <input id="qe-price" type="number" inputMode="decimal" className={cx(ui.input, 'h-11 font-mono')} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 950" />
            </div>
            <div>
              <label className={ui.label} htmlFor="qe-queue">Queue</label>
              <select id="qe-queue" className={cx(ui.select, 'h-11')} value={queue} onChange={(e) => setQueue(e.target.value)}>
                {queue === 'Unknown' && <option value="Unknown">Not reported</option>}
                {QUEUE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <p className={ui.hint}>A new price or queue goes live on the map straight away as &ldquo;Qozob rep&rdquo; (verified). Leave the price blank to keep the current one.</p>
          {err && <div className={ui.alertError}>{err}</div>}
        </div>

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnSecondary, ui.btnMd, 'flex-1')}>Cancel</button>
          <button type="button" onClick={save} disabled={saving} className={cx(ui.btn, ui.btnPrimary, ui.btnMd, 'flex-1')}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

