"use client";

// =========================================================================
// ADMIN → AUTO SERVICES → PRICES · PARTNERS · PROPOSALS · HISTORY
//   • Prices: national price for private + commercial vehicles, and optional
//     different prices per state. Admin changes go live straight away.
//   • Partners: companies that deliver services (insurers, papers agents,
//     tracker installers) and the people who sign in for them (/partner).
//   • Proposals: prices suggested by partners; live only after approval.
//   • History: every price change (who, when, old → new, why).
// All checks run in the database (supabase/migrations/20261106_service_pricing.sql).
// =========================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Tag, Plus, Pencil, Trash2, Check, X, Loader2, Building2, UserPlus, Download, MapPin, Inbox, Clock,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { cx, ui } from '@/lib/ui';
import { formatMoney } from '@/lib/currency';
import { NIGERIAN_STATES } from '@/lib/nigeria';
import { downloadXlsx } from '@/lib/xlsx';
import { isMissingFunction } from '@/lib/fetchAll';
import { loadServiceCatalog, SERVICE_CATEGORY_LABEL } from '@/lib/servicePricing';
import { VEHICLE_TIERS, vehicleTierLabel, type VehicleTier } from '@/lib/vehicles';
import type { ServiceCategory, TierPriceMap } from '@/types/services';
import { ReportTable, type ReportColumn } from './ReportTable';

const supabase = createClient();

// ---------- data from admin_service_overview() ----------
export interface OvStatePrice {
  state: string;
  private_price: number;
  commercial_price: number | null;
  tier_prices?: TierPriceMap;
  updated_at: string;
}
export interface OvService {
  id: string; title: string; category: ServiceCategory; description: string | null; statutory: boolean; turnaround: string | null;
  private_price: number; commercial_price: number | null;
  tier_prices?: TierPriceMap; rate_percent?: number | null; min_price?: number | null;
  currency: string; is_active: boolean; sort_order: number;
  updated_at: string; updated_by_email: string | null; state_prices: OvStatePrice[]; pending: number;
}
export interface OvMember { user_id: string; role: 'lead' | 'agent'; email: string; name: string | null; last_sign_in_at: string | null }
export interface OvPartner {
  id: string; name: string; contact_email: string | null; contact_phone: string | null; categories: ServiceCategory[]; states: string[];
  is_active: boolean; note: string | null; created_at: string; members: OvMember[]; open_requests: number; done_requests: number;
}
export interface OvProposal {
  id: number; service_id: string; service_title: string; state: string | null; private_price: number; commercial_price: number | null;
  tier_prices?: TierPriceMap | null; rate_percent?: number | null;
  current_private: number | null; current_commercial: number | null; partner_id: string; partner_name: string;
  proposed_by_email: string | null; note: string | null; status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  review_note: string | null; reviewed_at: string | null; reviewer_email: string | null; created_at: string;
}
export interface OvHistory {
  id: number; service_id: string; service_title: string; state: string | null; old_private: number | null; old_commercial: number | null;
  new_private: number | null; new_commercial: number | null; source: 'admin' | 'proposal' | 'cleared'; partner_name: string | null;
  changed_by_email: string | null; note: string | null; created_at: string;
}
export interface ServiceOverview { services: OvService[]; partners: OvPartner[]; proposals: OvProposal[]; history: OvHistory[] }

type Flash = (ok: boolean, text: string) => void;

export const CATEGORIES = Object.keys(SERVICE_CATEGORY_LABEL) as ServiceCategory[];
export const money = (n: number | null | undefined) => (n === null || n === undefined ? '—' : formatMoney(n, 'NGN'));
export const errText = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Something went wrong.');
const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));
const badNumber = (n: number | null) => n !== null && (!Number.isFinite(n) || n < 0);

/** Loads admin_service_overview() once; `reload` refreshes it (and the public price cache). */
export function useServiceOverview() {
  const [data, setData] = useState<ServiceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const apply = useCallback((d: unknown, err: { message: string; code?: string } | null) => {
    if (err) {
      if (isMissingFunction(err)) setMissing(true);
      else setError(err.message);
    } else {
      setData(d as ServiceOverview);
      setError('');
      setLoadedAt(new Date());
    }
    setLoading(false);
  }, []);
  const fetchOverview = useCallback(
    () => supabase.rpc('admin_service_overview').then(({ data: d, error: e }) => apply(d, e)),
    [apply],
  );
  useEffect(() => { fetchOverview(); }, [fetchOverview]);
  const reload = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchOverview(), loadServiceCatalog(supabase, true)]);
  }, [fetchOverview]);
  return { data, loading, missing, error, loadedAt, reload };
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

function Modal({ title, subtitle, onClose, children, wide }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  useEscape(onClose);
  return (
    <div className={cx(ui.overlay, 'z-50')} onClick={onClose}>
      <div className={cx(ui.modal, wide ? 'max-w-2xl' : 'max-w-lg', 'p-0 overflow-hidden')} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-start justify-between gap-3 p-5 border-b border-line">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-fg">{title}</h3>
            {subtitle && <p className="text-xs text-fg-muted truncate">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className={ui.modalClose} aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 max-h-[75vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

const pill = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap';
const pillMuted = cx(pill, 'bg-surface-2 text-fg-muted border-line');
const pillWarn = cx(pill, 'bg-warning-soft text-on-warning-soft border-warning-line');
const pillOk = cx(pill, 'bg-success-soft text-on-success-soft border-success-line');

// =========================================================================
// PRICES
// =========================================================================
export function PricesView({ data, onChanged, flash }: { data: ServiceOverview; onChanged: () => void; flash: Flash }) {
  const [edit, setEdit] = useState<{ service: OvService; state: string } | null>(null);
  const [details, setDetails] = useState<OvService | 'new' | null>(null);
  const [q, setQ] = useState('');

  const services = useMemo(() => {
    const t = q.trim().toLowerCase();
    return data.services.filter(s => !t || s.title.toLowerCase().includes(t) || s.id.includes(t)
      || SERVICE_CATEGORY_LABEL[s.category]?.toLowerCase().includes(t)
      || s.state_prices.some(sp => sp.state.toLowerCase().includes(t)));
  }, [data.services, q]);

  const exportExcel = async () => {
    const { data: s } = await supabase.auth.getSession();
    const rows: (string | number | boolean | null)[][] = [];
    for (const sv of data.services) {
      rows.push([sv.id, sv.title, SERVICE_CATEGORY_LABEL[sv.category] ?? sv.category, 'National (all states)', sv.private_price,
        sv.commercial_price ?? sv.private_price, sv.is_active ? 'Active' : 'Hidden', sv.updated_at ? new Date(sv.updated_at).toISOString() : null]);
      for (const sp of sv.state_prices) {
        rows.push([sv.id, sv.title, SERVICE_CATEGORY_LABEL[sv.category] ?? sv.category, sp.state, sp.private_price,
          sp.commercial_price ?? sp.private_price, sv.is_active ? 'Active' : 'Hidden', sp.updated_at ? new Date(sp.updated_at).toISOString() : null]);
      }
    }
    downloadXlsx('qozob-service-prices', [{
      name: 'Prices', title: 'Qozob · Auto-service prices (NGN)',
      meta: ['State rows override the national price in that state.'],
      columns: [
        { header: 'Code', width: 20 }, { header: 'Service', width: 44 }, { header: 'Category', width: 18 }, { header: 'Applies to', width: 22 },
        { header: 'Private (NGN)', type: 'money' }, { header: 'Commercial (NGN)', type: 'money' }, { header: 'Status', width: 9 },
        { header: 'Last changed', type: 'datetime' },
      ],
      rows,
    }], { generatedBy: s.session?.user?.email });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search service, category or state…" className={cx(ui.input, 'h-10 w-full sm:w-72')} aria-label="Search prices" />
        <div className="flex gap-2 ml-auto">
          <button type="button" onClick={exportExcel} className={cx(ui.btn, ui.btnSm, ui.btnSoft, 'h-10 px-4')}><Download className="w-4 h-4" aria-hidden /> Excel</button>
          <button type="button" onClick={() => setDetails('new')} className={cx(ui.btn, ui.btnSm, ui.btnPrimary, 'h-10 px-4')}><Plus className="w-4 h-4" aria-hidden /> Add service</button>
        </div>
      </div>
      <p className="text-xs text-fg-muted">
        Changes here go live on <span className="font-semibold text-fg">/services</span> straight away and are logged in History.
        A state price replaces the national price for customers in that state.
      </p>

      <div className="grid gap-3">
        {services.map(sv => (
          <div key={sv.id} className={cx(ui.card, 'p-4', !sv.is_active && 'opacity-70')}>
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-sm font-bold text-fg">{sv.title}</h3>
                  <span className={pillMuted}>{SERVICE_CATEGORY_LABEL[sv.category] ?? sv.category}</span>
                  {sv.rate_percent != null && sv.rate_percent > 0 && (
                    <span className={pillOk}>{sv.rate_percent}% of vehicle value · min {money(sv.private_price)}</span>
                  )}
                  {sv.tier_prices && Object.keys(sv.tier_prices).length > 0 && (
                    <span className={pillMuted}>{Object.keys(sv.tier_prices).length} engine/body tiers</span>
                  )}
                  {!sv.is_active && <span className={pillWarn}>Hidden from customers</span>}
                  {sv.pending > 0 && <span className={pillWarn}><Inbox className="w-3 h-3" aria-hidden />{sv.pending} proposal{sv.pending === 1 ? '' : 's'} waiting</span>}
                </div>
                <p className="text-[11px] text-fg-subtle mt-0.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" aria-hidden /> Changed {when(sv.updated_at)}{sv.updated_by_email ? ` by ${sv.updated_by_email}` : ''}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:w-72 shrink-0">
                <div className="rounded-xl bg-surface-2 border border-line px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Private</p>
                  <p className="text-sm font-bold text-fg tabular">{money(sv.private_price)}</p>
                </div>
                <div className="rounded-xl bg-surface-2 border border-line px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Commercial</p>
                  <p className="text-sm font-bold text-fg tabular">{sv.commercial_price === null ? <span className="text-fg-muted font-medium">Same</span> : money(sv.commercial_price)}</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button type="button" onClick={() => setEdit({ service: sv, state: '' })} className={cx(ui.btn, ui.btnSm, ui.btnPrimary)}><Tag className="w-3.5 h-3.5" aria-hidden /> Change price</button>
                <button type="button" onClick={() => setDetails(sv)} className={cx(ui.btn, ui.btnSm, ui.btnSecondary)} aria-label={`Edit details of ${sv.title}`}><Pencil className="w-3.5 h-3.5" aria-hidden /> Details</button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-fg-subtle mr-1 inline-flex items-center gap-1"><MapPin className="w-3 h-3" aria-hidden /> State prices:</span>
              {sv.state_prices.length === 0 && <span className="text-[11px] text-fg-muted">none (national price everywhere)</span>}
              {sv.state_prices.map(sp => (
                <button key={sp.state} type="button" onClick={() => setEdit({ service: sv, state: sp.state })}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-fg hover:border-primary hover:text-primary transition-colors">
                  {sp.state} · <span className="tabular">{money(sp.private_price)}{sp.commercial_price !== null && sp.commercial_price !== sp.private_price ? ` / ${money(sp.commercial_price)}` : ''}</span>
                </button>
              ))}
              <button type="button" onClick={() => setEdit({ service: sv, state: NIGERIAN_STATES.find(st => !sv.state_prices.some(sp => sp.state === st)) || NIGERIAN_STATES[0] })}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-[11px] font-semibold text-fg-muted hover:text-primary hover:border-primary transition-colors">
                <Plus className="w-3 h-3" aria-hidden /> State price
              </button>
            </div>
          </div>
        ))}
        {services.length === 0 && <div className={cx(ui.card, 'p-6 text-sm text-fg-muted text-center')}>No services match.</div>}
      </div>

      {edit && (
        <PriceEditor service={edit.service} initialState={edit.state} onClose={() => setEdit(null)}
          onSaved={msg => { flash(true, msg); setEdit(null); onChanged(); }} onError={msg => flash(false, msg)} />
      )}
      {details && (
        <ServiceEditor service={details === 'new' ? null : details} onClose={() => setDetails(null)}
          onSaved={msg => { flash(true, msg); setDetails(null); onChanged(); }} onError={msg => flash(false, msg)} />
      )}
    </div>
  );
}

function PriceEditor({ service, initialState, onClose, onSaved, onError }: {
  service: OvService; initialState: string; onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const currentFor = (scope: string) => {
    if (!scope) return { priv: service.private_price, comm: service.commercial_price, tiers: service.tier_prices ?? {}, own: true };
    const sp = service.state_prices.find(s => s.state === scope);
    return sp
      ? { priv: sp.private_price, comm: sp.commercial_price, tiers: sp.tier_prices ?? {}, own: true }
      : { priv: service.private_price, comm: service.commercial_price, tiers: service.tier_prices ?? {}, own: false };
  };
  const initTiersState = (tiers: TierPriceMap | undefined) => {
    const out: Record<VehicleTier, { priv: string; comm: string }> = {
      saloon_small: { priv: '', comm: '' },
      saloon_large: { priv: '', comm: '' },
      suv_pickup: { priv: '', comm: '' },
      bus: { priv: '', comm: '' },
      truck: { priv: '', comm: '' },
      motorcycle: { priv: '', comm: '' },
    };
    if (!tiers) return out;
    for (const t of VEHICLE_TIERS) {
      const e = tiers[t.key];
      if (e) {
        out[t.key] = {
          priv: e.private !== null && e.private !== undefined ? String(e.private) : '',
          comm: e.commercial !== null && e.commercial !== undefined ? String(e.commercial) : '',
        };
      }
    }
    return out;
  };

  const start = currentFor(initialState);
  const [scope, setScope] = useState(initialState);
  const [priv, setPriv] = useState(String(start.priv));
  const [comm, setComm] = useState(start.comm === null ? '' : String(start.comm));
  const [ratePct, setRatePct] = useState(service.rate_percent != null ? String(service.rate_percent) : '');
  const [tierInputs, setTierInputs] = useState(() => initTiersState(start.tiers));
  const [showTiers, setShowTiers] = useState(() => Object.keys(start.tiers || {}).length > 0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const cur = currentFor(scope);
  const supportsRate = service.rate_percent != null || service.id === 'comprehensive_insurance';

  const changeScope = (s: string) => {
    setScope(s);
    const c = currentFor(s);
    setPriv(String(c.priv));
    setComm(c.comm === null ? '' : String(c.comm));
    setTierInputs(initTiersState(c.tiers));
    setShowTiers(Object.keys(c.tiers || {}).length > 0);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = numOrNull(priv); const c = numOrNull(comm);
    const r = !scope && supportsRate ? numOrNull(ratePct) : null;
    if (p === null || badNumber(p) || badNumber(c)) return onError('Prices must be numbers of 0 or more. The private price is required.');
    if (r !== null && (badNumber(r) || r > 100)) return onError('Rate % must be between 0 and 100.');

    const tierPayload: TierPriceMap = {};
    if (showTiers) {
      for (const t of VEHICLE_TIERS) {
        const tp = numOrNull(tierInputs[t.key].priv);
        const tc = numOrNull(tierInputs[t.key].comm);
        if (badNumber(tp) || badNumber(tc)) return onError(`Tier price for ${t.short} must be 0 or more.`);
        if (tp !== null || tc !== null) {
          tierPayload[t.key] = { private: tp, commercial: tc };
        }
      }
    }

    setBusy(true);
    let { error } = await supabase.rpc('admin_set_service_price', {
      p_service_id: service.id,
      p_state: scope || null,
      p_private: p,
      p_commercial: c,
      p_note: note.trim() || null,
      p_tier_prices: showTiers ? tierPayload : {},
      p_rate_percent: r,
    });
    if (error && /function|p_tier_prices/i.test(error.message)) {
      ({ error } = await supabase.rpc('admin_set_service_price', {
        p_service_id: service.id, p_state: scope || null, p_private: p, p_commercial: c, p_note: note.trim() || null,
      }));
    }
    setBusy(false);
    if (error) return onError(errText(error));
    onSaved(`${service.title}: ${scope ? `${scope} price` : 'national price'} is now ${money(p)}${c !== null && c !== p ? ` / ${money(c)} commercial` : ''}.`);
  };

  const clear = async () => {
    if (!window.confirm(`Remove the separate ${scope} price? Customers in ${scope} will pay the national price (${money(service.private_price)}).`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_clear_state_price', { p_service_id: service.id, p_state: scope, p_note: note.trim() || null });
    setBusy(false);
    if (error) return onError(errText(error));
    onSaved(`${service.title}: ${scope} now uses the national price.`);
  };

  return (
    <Modal title="Change price" subtitle={service.title} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className={ui.label} htmlFor="pe-scope">Applies to</label>
          <select id="pe-scope" value={scope} onChange={e => changeScope(e.target.value)} className={ui.select}>
            <option value="">National price (all states)</option>
            {NIGERIAN_STATES.map(st => (
              <option key={st} value={st}>{st}{service.state_prices.some(s => s.state === st) ? ' · has own price' : ''}</option>
            ))}
          </select>
          <p className={ui.hint}>
            Now: {money(cur.priv)} private · {cur.comm === null ? 'same for commercial' : `${money(cur.comm)} commercial`}
            {scope && !cur.own ? ' (national price — no separate price for this state yet)' : ''}
          </p>
        </div>
        <div className={cx('grid gap-3', !scope && supportsRate ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
          <div>
            <label className={ui.label} htmlFor="pe-priv">{supportsRate ? 'Minimum private premium (₦) *' : 'Base private price (₦) *'}</label>
            <input id="pe-priv" type="number" min={0} step="any" inputMode="decimal" required value={priv} onChange={e => setPriv(e.target.value)} className={ui.input} />
          </div>
          <div>
            <label className={ui.label} htmlFor="pe-comm">{supportsRate ? 'Minimum commercial premium (₦)' : 'Base commercial price (₦)'}</label>
            <input id="pe-comm" type="number" min={0} step="any" inputMode="decimal" value={comm} onChange={e => setComm(e.target.value)} className={ui.input} placeholder="Same as private" />
          </div>
          {!scope && supportsRate && (
            <div>
              <label className={ui.label} htmlFor="pe-rate">Value Rate (% of car value)</label>
              <input id="pe-rate" type="number" min={0} max={100} step="0.1" inputMode="decimal" value={ratePct} onChange={e => setRatePct(e.target.value)} className={ui.input} placeholder="e.g. 3.5" />
            </div>
          )}
        </div>

        {/* Engine-capacity / body-type tiered pricing */}
        {!supportsRate && (
          <div className="rounded-2xl border border-line bg-surface-2 p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-fg">Engine-Capacity / Body-Type Tier Prices</p>
                <p className="text-[11px] text-fg-muted">Optional per-vehicle-tier overrides (Saloon ≤1.8L, Saloon 2.0L+, SUV/Pickup, Bus, Truck, Motorcycle).</p>
              </div>
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg cursor-pointer shrink-0">
                <input type="checkbox" checked={showTiers} onChange={e => setShowTiers(e.target.checked)} className="h-4 w-4 accent-primary" />
                <span>Enable tiers</span>
              </label>
            </div>
            {showTiers && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-12 gap-2 text-[10px] font-bold uppercase tracking-wider text-fg-subtle px-1">
                  <span className="col-span-6">Vehicle Tier</span>
                  <span className="col-span-3">Private (₦)</span>
                  <span className="col-span-3">Commercial (₦)</span>
                </div>
                {VEHICLE_TIERS.map(t => (
                  <div key={t.key} className="grid grid-cols-12 gap-2 items-center">
                    <span className="col-span-6 text-xs font-semibold text-fg truncate" title={t.label}>{t.short}</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      placeholder={priv || 'Base'}
                      value={tierInputs[t.key].priv}
                      onChange={e => setTierInputs(prev => ({ ...prev, [t.key]: { ...prev[t.key], priv: e.target.value } }))}
                      className={cx(ui.input, 'col-span-3 h-9 text-xs px-2.5')}
                      aria-label={`${t.short} private price`}
                    />
                    <input
                      type="number"
                      min={0}
                      step="any"
                      placeholder={comm || priv || 'Same'}
                      value={tierInputs[t.key].comm}
                      onChange={e => setTierInputs(prev => ({ ...prev, [t.key]: { ...prev[t.key], comm: e.target.value } }))}
                      className={cx(ui.input, 'col-span-3 h-9 text-xs px-2.5')}
                      aria-label={`${t.short} commercial price`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <label className={ui.label} htmlFor="pe-note">Reason (kept in History)</label>
          <input id="pe-note" value={note} onChange={e => setNote(e.target.value)} className={ui.input} maxLength={300} placeholder="e.g. New NIID tariff from 1 Dec" />
        </div>
        {service.pending > 0 && (
          <p className={cx(ui.alertWarning, 'text-xs')}>Saving replaces any partner proposal still waiting for this price.</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {scope && cur.own && (
            <button type="button" disabled={busy} onClick={clear} className={cx(ui.btn, ui.btnMd, ui.btnDanger)}><Trash2 className="w-4 h-4" aria-hidden /> Use national price</button>
          )}
          <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnMd, ui.btnSecondary, 'ml-auto')}>Cancel</button>
          <button type="submit" disabled={busy} className={cx(ui.btn, ui.btnMd, ui.btnPrimary)}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : 'Save price'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ServiceEditor({ service, onClose, onSaved, onError }: {
  service: OvService | null; onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const isNew = !service;
  const [id, setId] = useState(service?.id ?? '');
  const [title, setTitle] = useState(service?.title ?? '');
  const [category, setCategory] = useState<ServiceCategory>(service?.category ?? 'papers_renewal');
  const [description, setDescription] = useState(service?.description ?? '');
  const [turnaround, setTurnaround] = useState(service?.turnaround ?? '');
  const [statutory, setStatutory] = useState(service?.statutory ?? false);
  const [active, setActive] = useState(service?.is_active ?? true);
  const [sort, setSort] = useState(String(service?.sort_order ?? 100));
  const [priv, setPriv] = useState('');
  const [comm, setComm] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = id.trim().toLowerCase();
    if (!/^[a-z0-9_]{2,60}$/.test(code)) return onError('Use a short code with lower-case letters, numbers and _ (for example comprehensive_insurance).');
    if (title.trim().length < 3) return onError('Enter a title (3 characters or more).');
    const p: Record<string, unknown> = {
      title: title.trim(), category, description: description.trim(), turnaround: turnaround.trim(),
      statutory, is_active: active, sort_order: Math.round(Number(sort) || 100),
    };
    if (isNew) {
      const pp = numOrNull(priv); const cc = numOrNull(comm);
      if (pp === null || badNumber(pp) || badNumber(cc)) return onError('Enter the private price (0 or more).');
      p.private_price = pp;
      if (cc !== null) p.commercial_price = cc;
    }
    setBusy(true);
    const { error } = await supabase.rpc('admin_upsert_service', { p_id: code, p });
    setBusy(false);
    if (error) return onError(errText(error));
    onSaved(isNew ? `Added ${title.trim()}.` : `Saved ${title.trim()}.`);
  };

  return (
    <Modal title={isNew ? 'Add a service' : 'Service details'} subtitle={service?.title} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={ui.label} htmlFor="se-id">Code *</label>
            <input id="se-id" value={id} disabled={!isNew} onChange={e => setId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} className={cx(ui.input, 'font-mono')} placeholder="comprehensive_insurance" />
            {isNew && <p className={ui.hint}>Cannot be changed later.</p>}
          </div>
          <div>
            <label className={ui.label} htmlFor="se-cat">Category *</label>
            <select id="se-cat" value={category} onChange={e => setCategory(e.target.value as ServiceCategory)} className={ui.select}>
              {CATEGORIES.map(c => <option key={c} value={c}>{SERVICE_CATEGORY_LABEL[c]}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={ui.label} htmlFor="se-title">Title shown to customers *</label>
          <input id="se-title" value={title} onChange={e => setTitle(e.target.value)} className={ui.input} maxLength={160} />
        </div>
        <div>
          <label className={ui.label} htmlFor="se-desc">Description</label>
          <textarea id="se-desc" rows={3} value={description} onChange={e => setDescription(e.target.value)} className={cx(ui.input, 'h-auto py-2')} maxLength={1000} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={ui.label} htmlFor="se-turn">Turnaround</label>
            <input id="se-turn" value={turnaround} onChange={e => setTurnaround(e.target.value)} className={ui.input} maxLength={80} placeholder="e.g. 24–48 hours" />
          </div>
          <div>
            <label className={ui.label} htmlFor="se-sort">Order on the page</label>
            <input id="se-sort" type="number" value={sort} onChange={e => setSort(e.target.value)} className={ui.input} />
            <p className={ui.hint}>Smaller numbers show first.</p>
          </div>
        </div>
        {isNew ? (
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={ui.label} htmlFor="se-priv">Private price (₦) *</label>
              <input id="se-priv" type="number" min={0} step="any" value={priv} onChange={e => setPriv(e.target.value)} className={ui.input} />
            </div>
            <div>
              <label className={ui.label} htmlFor="se-comm">Commercial price (₦)</label>
              <input id="se-comm" type="number" min={0} step="any" value={comm} onChange={e => setComm(e.target.value)} className={ui.input} placeholder="Same as private" />
            </div>
          </div>
        ) : (
          <p className="text-xs text-fg-muted">To change the price, use <span className="font-semibold text-fg">Change price</span> so the change is logged.</p>
        )}
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={statutory} onChange={e => setStatutory(e.target.checked)} className="h-4 w-4 accent-primary" /> Required by law</label>
          <label className="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="h-4 w-4 accent-primary" /> Show to customers</label>
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnMd, ui.btnSecondary, 'flex-1')}>Cancel</button>
          <button type="submit" disabled={busy} className={cx(ui.btn, ui.btnMd, ui.btnPrimary, 'flex-1')}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : isNew ? 'Add service' : 'Save details'}</button>
        </div>
      </form>
    </Modal>
  );
}

// =========================================================================
// PROPOSALS (prices suggested by partners)
// =========================================================================
const PROPOSAL_STATUS: Record<OvProposal['status'], { label: string; cls: string }> = {
  pending: { label: 'Waiting', cls: pillWarn },
  approved: { label: 'Approved', cls: pillOk },
  rejected: { label: 'Rejected', cls: cx(pill, 'bg-danger-soft text-on-danger-soft border-danger-line') },
  withdrawn: { label: 'Withdrawn', cls: pillMuted },
};

function Change({ from, to }: { from: number | null; to: number | null }) {
  const up = from !== null && to !== null && to > from;
  const down = from !== null && to !== null && to < from;
  const pct = from && to !== null ? Math.round(((to - from) / from) * 100) : null;
  return (
    <span className="tabular">
      <span className="text-fg-muted line-through decoration-1">{money(from)}</span>{' → '}
      <span className={cx('font-bold', up ? 'text-danger' : down ? 'text-success' : 'text-fg')}>{money(to)}</span>
      {pct !== null && pct !== 0 && <span className={cx('ml-1 text-[11px] font-semibold', up ? 'text-danger' : 'text-success')}>{pct > 0 ? '+' : ''}{pct}%</span>}
    </span>
  );
}

export function ProposalsView({ data, onChanged, flash, loading, loadedAt }: {
  data: ServiceOverview; onChanged: () => void; flash: Flash; loading: boolean; loadedAt: Date | null;
}) {
  const pending = data.proposals.filter(p => p.status === 'pending');
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  const review = async (p: OvProposal, approve: boolean) => {
    const note = (notes[p.id] || '').trim();
    if (!approve && note.length < 3 && !window.confirm('Reject without a reason? The partner will see the reason if you give one.')) return;
    setBusy(p.id);
    const { error } = await supabase.rpc('admin_review_price_proposal', { p_id: p.id, p_approve: approve, p_note: note || null });
    setBusy(null);
    if (error) return flash(false, errText(error));
    flash(true, approve
      ? `Approved: ${p.service_title}${p.state ? ` (${p.state})` : ''} is now ${money(p.private_price)}.`
      : `Rejected the ${p.partner_name} proposal.`);
    onChanged();
  };

  const columns = useMemo<ReportColumn<OvProposal>[]>(() => [
    { key: 'created', header: 'Proposed', get: p => p.created_at, type: 'datetime' },
    { key: 'service', header: 'Service', get: p => p.service_title, width: 36 },
    { key: 'state', header: 'Applies to', get: p => p.state ?? 'National' },
    { key: 'partner', header: 'Partner', get: p => p.partner_name, width: 24 },
    { key: 'by', header: 'Proposed by', get: p => p.proposed_by_email, defaultVisible: false, width: 28 },
    { key: 'cur_p', header: 'Was (private)', get: p => p.current_private, type: 'money', align: 'right' },
    { key: 'new_p', header: 'Proposed (private)', get: p => p.private_price, type: 'money', align: 'right' },
    { key: 'cur_c', header: 'Was (commercial)', get: p => p.current_commercial ?? p.current_private, type: 'money', align: 'right', defaultVisible: false },
    { key: 'new_c', header: 'Proposed (commercial)', get: p => p.commercial_price ?? p.private_price, type: 'money', align: 'right', defaultVisible: false },
    { key: 'note', header: 'Partner note', get: p => p.note, width: 36, defaultVisible: false },
    {
      key: 'status', header: 'Status', get: p => PROPOSAL_STATUS[p.status]?.label ?? p.status,
      render: p => <span className={PROPOSAL_STATUS[p.status]?.cls}>{PROPOSAL_STATUS[p.status]?.label ?? p.status}</span>,
    },
    { key: 'reviewed', header: 'Reviewed', get: p => p.reviewed_at, type: 'datetime', defaultVisible: false },
    { key: 'reviewer', header: 'Reviewed by', get: p => p.reviewer_email, defaultVisible: false, width: 28 },
    { key: 'review_note', header: 'Review note', get: p => p.review_note, width: 36 },
  ], []);

  return (
    <div className="flex flex-col gap-4">
      {pending.length === 0 ? (
        <div className={cx(ui.card, 'p-6 text-center')}>
          <Inbox className="w-8 h-8 text-fg-subtle mx-auto" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-fg">No proposals waiting</p>
          <p className="text-xs text-fg-muted">When a partner suggests a new price it appears here. Nothing changes for customers until you approve it.</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {pending.map(p => (
            <div key={p.id} className={cx(ui.card, 'p-4 flex flex-col gap-3')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-fg">{p.service_title}</p>
                  <p className="text-xs text-fg-muted">
                    <span className="font-semibold text-fg">{p.partner_name}</span> · {p.state ?? 'National (all states)'} · {when(p.created_at)}
                  </p>
                </div>
                <span className={pillWarn}>Waiting</span>
              </div>
              <div className="rounded-xl bg-surface-2 border border-line p-3 text-xs space-y-1">
                <div className="flex justify-between gap-2"><span className="text-fg-muted">Private</span><Change from={p.current_private} to={p.private_price} /></div>
                <div className="flex justify-between gap-2"><span className="text-fg-muted">Commercial</span>
                  <Change from={p.current_commercial ?? p.current_private} to={p.commercial_price ?? p.private_price} />
                </div>
                {p.rate_percent != null && (
                  <div className="flex justify-between gap-2 pt-1 border-t border-line">
                    <span className="text-fg-muted">Proposed rate (% of value)</span>
                    <span className="font-bold text-fg tabular">{p.rate_percent}%</span>
                  </div>
                )}
                {p.tier_prices && Object.keys(p.tier_prices).length > 0 && (
                  <div className="pt-1.5 border-t border-line space-y-0.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">Proposed engine/body tier prices</p>
                    {Object.entries(p.tier_prices).map(([tk, tv]) => tv && (
                      <div key={tk} className="flex justify-between gap-2 text-[11px]">
                        <span className="text-fg-muted">{vehicleTierLabel(tk, true) || tk}</span>
                        <span className="font-semibold text-fg tabular">
                          {tv.private != null ? money(tv.private) : 'Base'}
                          {tv.commercial != null && tv.commercial !== tv.private ? ` / ${money(tv.commercial)} comm.` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {p.note && <p className="text-xs text-fg"><span className="text-fg-muted">Partner says:</span> {p.note}</p>}
              <input value={notes[p.id] ?? ''} onChange={e => setNotes(n => ({ ...n, [p.id]: e.target.value }))} className={cx(ui.input, 'h-10')}
                placeholder="Note to the partner (optional)" maxLength={300} aria-label="Review note" />
              <div className="flex gap-2">
                <button type="button" disabled={busy === p.id} onClick={() => review(p, false)} className={cx(ui.btn, ui.btnSm, ui.btnDanger, 'flex-1 h-9')}><X className="w-4 h-4" aria-hidden /> Reject</button>
                <button type="button" disabled={busy === p.id} onClick={() => review(p, true)} className={cx(ui.btn, ui.btnSm, ui.btnPrimary, 'flex-1 h-9')}>
                  {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <><Check className="w-4 h-4" aria-hidden /> Approve &amp; go live</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ReportTable
        id="admin-service-proposals"
        title="Partner price proposals"
        rows={data.proposals}
        columns={columns}
        rowKey={p => String(p.id)}
        loading={loading}
        loadedAt={loadedAt}
        onRefresh={onChanged}
        initialSort={{ key: 'created', dir: 'desc' }}
        searchPlaceholder="Search service, partner, state…"
        emptyText="No proposals yet."
      />
    </div>
  );
}

// =========================================================================
// PARTNERS (companies + the people who sign in for them)
// =========================================================================
export function PartnersView({ data, onChanged, flash }: { data: ServiceOverview; onChanged: () => void; flash: Flash }) {
  const [edit, setEdit] = useState<OvPartner | 'new' | null>(null);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [roles, setRoles] = useState<Record<string, 'agent' | 'lead'>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const addMember = async (pt: OvPartner) => {
    const email = (emails[pt.id] || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return flash(false, 'Enter the email address they use to sign in to Qozob.');
    setBusy(pt.id);
    const { error } = await supabase.rpc('admin_add_partner_member', { p_partner_id: pt.id, p_email: email, p_role: roles[pt.id] || 'agent' });
    setBusy(null);
    if (error) return flash(false, errText(error));
    setEmails(m => ({ ...m, [pt.id]: '' }));
    flash(true, `${email} can now open the partner portal for ${pt.name} (qozob.com/partner).`);
    onChanged();
  };

  const removeMember = async (pt: OvPartner, m: OvMember) => {
    if (!window.confirm(`Remove ${m.email} from ${pt.name}? They lose access to the partner portal.`)) return;
    setBusy(pt.id);
    const { error } = await supabase.rpc('admin_remove_partner_member', { p_partner_id: pt.id, p_user: m.user_id });
    setBusy(null);
    if (error) return flash(false, errText(error));
    flash(true, `Removed ${m.email} from ${pt.name}.`);
    onChanged();
  };

  const exportExcel = async () => {
    const { data: s } = await supabase.auth.getSession();
    downloadXlsx('qozob-service-partners', [
      {
        name: 'Partners', title: 'Qozob · Service partner companies',
        columns: [
          { header: 'Company', width: 28 }, { header: 'Status', width: 9 }, { header: 'Services', width: 40 }, { header: 'States', width: 40 },
          { header: 'Contact email', width: 28 }, { header: 'Contact phone', width: 16 }, { header: 'People', type: 'integer' },
          { header: 'Open requests', type: 'integer' }, { header: 'Completed requests', type: 'integer' }, { header: 'Note', width: 36 },
          { header: 'Added', type: 'datetime' },
        ],
        rows: data.partners.map(p => [
          p.name, p.is_active ? 'Active' : 'Paused', p.categories.map(c => SERVICE_CATEGORY_LABEL[c] ?? c).join(', '),
          p.states.length ? p.states.join(', ') : 'All states', p.contact_email, p.contact_phone, p.members.length,
          p.open_requests, p.done_requests, p.note, p.created_at ? new Date(p.created_at) : null,
        ]),
      },
      {
        name: 'People', title: 'Qozob · People who sign in for partners',
        columns: [{ header: 'Company', width: 28 }, { header: 'Email', width: 32 }, { header: 'Name', width: 24 }, { header: 'Role', width: 8 }, { header: 'Last sign-in', type: 'datetime' }],
        rows: data.partners.flatMap(p => p.members.map(m => [p.name, m.email, m.name, m.role === 'lead' ? 'Lead' : 'Agent', m.last_sign_in_at ? new Date(m.last_sign_in_at) : null])),
      },
    ], { generatedBy: s.session?.user?.email });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-fg-muted flex-1 min-w-[240px]">
          Partner companies deliver services. Their people sign in at <span className="font-semibold text-fg">qozob.com/partner</span> to propose prices
          (live only after approval) and work on the requests you assign to them. They do not get admin access.
        </p>
        <button type="button" onClick={exportExcel} className={cx(ui.btn, ui.btnSm, ui.btnSoft, 'h-10 px-4')}><Download className="w-4 h-4" aria-hidden /> Excel</button>
        <button type="button" onClick={() => setEdit('new')} className={cx(ui.btn, ui.btnSm, ui.btnPrimary, 'h-10 px-4')}><Plus className="w-4 h-4" aria-hidden /> Add partner</button>
      </div>

      {data.partners.length === 0 && (
        <div className={cx(ui.card, 'p-6 text-center')}>
          <Building2 className="w-8 h-8 text-fg-subtle mx-auto" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-fg">No partner companies yet</p>
          <p className="text-xs text-fg-muted">Add an insurer, papers agent or tracker installer, then add the people who work for them.</p>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {data.partners.map(pt => (
          <div key={pt.id} className={cx(ui.card, 'p-4 flex flex-col gap-3', !pt.is_active && 'opacity-75')}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-sm font-bold text-fg">{pt.name}</h3>
                  {pt.is_active ? <span className={pillOk}>Active</span> : <span className={pillWarn}>Paused</span>}
                </div>
                <p className="text-xs text-fg-muted mt-0.5">{[pt.contact_email, pt.contact_phone].filter(Boolean).join(' · ') || 'No contact details'}</p>
              </div>
              <button type="button" onClick={() => setEdit(pt)} className={cx(ui.btn, ui.btnSm, ui.btnSecondary)} aria-label={`Edit ${pt.name}`}><Pencil className="w-3.5 h-3.5" aria-hidden /> Edit</button>
            </div>
            <div className="flex flex-wrap gap-1">
              {pt.categories.length === 0 && <span className={pillWarn}>No services chosen</span>}
              {pt.categories.map(c => <span key={c} className={pillMuted}>{SERVICE_CATEGORY_LABEL[c] ?? c}</span>)}
            </div>
            <p className="text-xs text-fg-muted flex items-start gap-1">
              <MapPin className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden />
              <span>{pt.states.length ? pt.states.join(', ') : 'All states'}</span>
            </p>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-surface-2 border border-line py-2"><p className="text-base font-bold text-fg tabular">{pt.open_requests}</p><p className="text-[11px] text-fg-muted">Open requests</p></div>
              <div className="rounded-xl bg-surface-2 border border-line py-2"><p className="text-base font-bold text-fg tabular">{pt.done_requests}</p><p className="text-[11px] text-fg-muted">Completed</p></div>
            </div>
            <div>
              <p className="text-xs font-semibold text-fg mb-1.5">People ({pt.members.length})</p>
              <ul className="space-y-1">
                {pt.members.map(m => (
                  <li key={m.user_id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs">
                    <span className="min-w-0">
                      <span className="font-semibold text-fg block truncate">{m.name || m.email}</span>
                      <span className="text-fg-muted block truncate">{m.name ? `${m.email} · ` : ''}{m.role === 'lead' ? 'Lead' : 'Agent'} · {m.last_sign_in_at ? `last seen ${when(m.last_sign_in_at)}` : 'never signed in'}</span>
                    </span>
                    <button type="button" disabled={busy === pt.id} onClick={() => removeMember(pt, m)} className="p-1.5 rounded-lg text-danger hover:bg-danger-soft shrink-0" aria-label={`Remove ${m.email}`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
                {pt.members.length === 0 && <li className="text-xs text-fg-muted">Nobody yet. Add the email they use on Qozob.</li>}
              </ul>
              <div className="mt-2 flex gap-2">
                <input type="email" value={emails[pt.id] ?? ''} onChange={e => setEmails(m => ({ ...m, [pt.id]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMember(pt); } }}
                  className={cx(ui.input, 'h-9 text-xs')} placeholder="agent@company.com" aria-label={`Add a person to ${pt.name}`} />
                <select value={roles[pt.id] ?? 'agent'} onChange={e => setRoles(r => ({ ...r, [pt.id]: e.target.value as 'agent' | 'lead' }))} className={cx(ui.select, 'h-9 w-24 text-xs px-2')} aria-label="Role">
                  <option value="agent">Agent</option>
                  <option value="lead">Lead</option>
                </select>
                <button type="button" disabled={busy === pt.id} onClick={() => addMember(pt)} className={cx(ui.btn, ui.btnSm, ui.btnPrimary, 'h-9 shrink-0')} aria-label="Add person">
                  {busy === pt.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <UserPlus className="w-4 h-4" aria-hidden />}
                </button>
              </div>
              <p className="text-[11px] text-fg-subtle mt-1">They must have a Qozob account first (free sign-up).</p>
            </div>
            {pt.note && <p className="text-xs text-fg-muted border-t border-line pt-2">{pt.note}</p>}
          </div>
        ))}
      </div>

      {edit && (
        <PartnerEditor partner={edit === 'new' ? null : edit} onClose={() => setEdit(null)}
          onSaved={msg => { flash(true, msg); setEdit(null); onChanged(); }} onError={msg => flash(false, msg)} />
      )}
    </div>
  );
}

function PartnerEditor({ partner, onClose, onSaved, onError }: {
  partner: OvPartner | null; onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const [name, setName] = useState(partner?.name ?? '');
  const [email, setEmail] = useState(partner?.contact_email ?? '');
  const [phone, setPhone] = useState(partner?.contact_phone ?? '');
  const [cats, setCats] = useState<Set<ServiceCategory>>(new Set(partner?.categories ?? []));
  const [allStates, setAllStates] = useState(!partner || partner.states.length === 0);
  const [states, setStates] = useState<Set<string>>(new Set(partner?.states ?? []));
  const [active, setActive] = useState(partner?.is_active ?? true);
  const [note, setNote] = useState(partner?.note ?? '');
  const [busy, setBusy] = useState(false);

  const toggle = <T,>(set: Set<T>, v: T) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return onError('Enter the company name.');
    if (cats.size === 0) return onError('Choose at least one service the company delivers.');
    if (!allStates && states.size === 0) return onError('Choose the states they work in, or tick "All states".');
    setBusy(true);
    const { error } = await supabase.rpc('admin_upsert_partner', {
      p_id: partner?.id ?? null,
      p: {
        name: name.trim(), contact_email: email.trim(), contact_phone: phone.trim(), categories: [...cats],
        states: allStates ? [] : [...states], is_active: active, note: note.trim(),
      },
    });
    setBusy(false);
    if (error) return onError(errText(error));
    onSaved(partner ? `Saved ${name.trim()}.` : `Added ${name.trim()}. Now add the people who work for them.`);
  };

  return (
    <Modal title={partner ? 'Edit partner' : 'Add a partner company'} subtitle={partner?.name} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className={ui.label} htmlFor="pt-name">Company name *</label>
          <input id="pt-name" value={name} onChange={e => setName(e.target.value)} className={ui.input} maxLength={120} placeholder="e.g. Leadway Assurance" />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={ui.label} htmlFor="pt-email">Contact email</label>
            <input id="pt-email" type="email" value={email} onChange={e => setEmail(e.target.value)} className={ui.input} />
          </div>
          <div>
            <label className={ui.label} htmlFor="pt-phone">Contact phone</label>
            <input id="pt-phone" value={phone} onChange={e => setPhone(e.target.value)} className={ui.input} />
          </div>
        </div>
        <fieldset>
          <legend className={ui.label}>Services they deliver *</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <label key={c} className={cx('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors',
                cats.has(c) ? 'border-primary bg-primary/10 text-primary' : 'border-line text-fg-muted hover:text-fg')}>
                <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={cats.has(c)} onChange={() => setCats(s => toggle(s, c))} />
                {SERVICE_CATEGORY_LABEL[c]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className={ui.label}>Where they work *</legend>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer mb-2">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={allStates} onChange={e => setAllStates(e.target.checked)} /> All states
          </label>
          {!allStates && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-48 overflow-y-auto rounded-xl border border-line p-2">
              {NIGERIAN_STATES.map(st => (
                <label key={st} className="inline-flex items-center gap-2 text-xs px-1.5 py-1 rounded hover:bg-surface-2 cursor-pointer">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={states.has(st)} onChange={() => setStates(s => toggle(s, st))} /> {st}
                </label>
              ))}
            </div>
          )}
          <p className={ui.hint}>Partners limited to some states can only price and receive requests for those states.</p>
        </fieldset>
        <div>
          <label className={ui.label} htmlFor="pt-note">Internal note</label>
          <input id="pt-note" value={note} onChange={e => setNote(e.target.value)} className={ui.input} maxLength={300} placeholder="e.g. Contract signed Nov 2026, 10% commission" />
        </div>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={active} onChange={e => setActive(e.target.checked)} /> Active (paused partners lose portal access)
        </label>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnMd, ui.btnSecondary, 'flex-1')}>Cancel</button>
          <button type="submit" disabled={busy} className={cx(ui.btn, ui.btnMd, ui.btnPrimary, 'flex-1')}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : partner ? 'Save partner' : 'Add partner'}</button>
        </div>
      </form>
    </Modal>
  );
}

// =========================================================================
// HISTORY (every price change)
// =========================================================================
const SOURCE: Record<OvHistory['source'], string> = { admin: 'Admin change', proposal: 'Partner proposal', cleared: 'State price removed' };

export function HistoryView({ data, onChanged, loading, loadedAt }: {
  data: ServiceOverview; onChanged: () => void; loading: boolean; loadedAt: Date | null;
}) {
  const columns = useMemo<ReportColumn<OvHistory>[]>(() => [
    { key: 'when', header: 'When', get: h => h.created_at, type: 'datetime' },
    { key: 'service', header: 'Service', get: h => h.service_title, width: 36 },
    { key: 'state', header: 'Applies to', get: h => h.state ?? 'National' },
    {
      key: 'private', header: 'Private', get: h => h.new_private, type: 'money', align: 'right',
      render: h => (h.source === 'cleared' ? <span className="text-fg-muted">uses national</span> : <Change from={h.old_private} to={h.new_private} />),
    },
    {
      key: 'commercial', header: 'Commercial', get: h => h.new_commercial ?? h.new_private, type: 'money', align: 'right',
      render: h => (h.source === 'cleared' ? <span className="text-fg-muted">uses national</span>
        : <Change from={h.old_commercial ?? h.old_private} to={h.new_commercial ?? h.new_private} />),
    },
    { key: 'old_private', header: 'Old private', get: h => h.old_private, type: 'money', align: 'right', defaultVisible: false },
    { key: 'old_commercial', header: 'Old commercial', get: h => h.old_commercial ?? h.old_private, type: 'money', align: 'right', defaultVisible: false },
    { key: 'source', header: 'How', get: h => SOURCE[h.source] ?? h.source },
    { key: 'partner', header: 'Partner', get: h => h.partner_name, defaultVisible: false },
    { key: 'by', header: 'By', get: h => h.changed_by_email, width: 28 },
    { key: 'note', header: 'Reason', get: h => h.note, width: 40 },
  ], []);

  return (
    <ReportTable
      id="admin-service-price-history"
      title="Auto-service price history"
      rows={data.history}
      columns={columns}
      rowKey={h => String(h.id)}
      loading={loading}
      loadedAt={loadedAt}
      onRefresh={onChanged}
      meta={['Latest 500 changes', 'Amounts in NGN']}
      initialSort={{ key: 'when', dir: 'desc' }}
      searchPlaceholder="Search service, state, person…"
      emptyText="No price changes yet."
    />
  );
}
