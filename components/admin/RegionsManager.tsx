"use client";

// =========================================================================
// ADMIN → REGIONS
// One place to run Qozob country by country:
//   • every country with its currency, extra currencies, usual price range and
//     whether prices can be added there yet (open / coming soon)
//   • activity per country (stations, prices, claims, reviews waiting)
//   • the reward programme of each country (prize, currency, quorum, vouchers)
//   • countries that already have stations but aren't set up ("waiting")
//   • local area maps (like Nigeria's LGAs) so prizes can be per area
// Master admins edit; other admins see the countries they cover.
// The database enforces all of this (supabase/migrations/20261105_multiregion.sql).
// =========================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Globe2, Plus, Pencil, Trophy, RefreshCw, Download, Loader2, AlertTriangle, CheckCircle2, X, Map as MapIcon,
  Upload, Search, Clock, Coins,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { ui, cx } from '@/lib/ui';
import { formatMoney, currencyLabel } from '@/lib/currency';
import { flagEmoji, loadRegions, loadRewardPrograms } from '@/lib/regions';
import { downloadXlsx } from '@/lib/xlsx';
import { isMissingFunction } from '@/lib/fetchAll';

const supabase = createClient();

interface Program {
  currency: string; program_active: boolean; monthly_prize: number; annual_prize: number | null; wht_percent: number;
  voucher_enabled: boolean; voucher_bonus_pct: number; min_active_days: number; annual_min_active_days: number;
  min_area_updates_quorum: number; min_area_stations_quorum: number; min_area_participants_quorum: number;
  active_payout_scope: 'all' | 'selected_areas'; active_area_ids: number[] | null; note: string | null; updated_at: string | null;
}
interface RegionRow {
  country_code: string; name: string; default_currency: string; currencies: string[]; aliases: string[];
  price_min: number | null; price_max: number | null; is_open: boolean; area_label: string; updated_at: string | null;
  stations: number; priced: number; claimed: number; fresh_7d: number; reports_30d: number; held: number; contributors_30d: number;
  areas: number; program: Program | null;
}
interface Overview {
  is_master: boolean; scope: string[] | null; regions: RegionRow[];
  waiting: { country_code: string; stations: number }[]; unknown_country: number;
}

type Filter = 'all' | 'open' | 'soon' | 'rewards';

export function RegionsManager({ isMaster, onChanged }: { isMaster: boolean; onChanged?: () => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editRegion, setEditRegion] = useState<Partial<RegionRow> | null>(null);
  const [editProgram, setEditProgram] = useState<RegionRow | null>(null);
  const [areaFor, setAreaFor] = useState<RegionRow | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const flash = (ok: boolean, text: string) => { setNotice({ ok, text }); window.setTimeout(() => setNotice(null), 7000); };

  const apply = useCallback((d: unknown, error: { message: string; code?: string } | null) => {
    if (error) {
      if (isMissingFunction(error)) setMissing(true);
      else flash(false, error.message);
    } else {
      setData(d as Overview);
      setLoadedAt(new Date());
    }
    setLoading(false);
  }, []);
  const fetchOverview = useCallback(() => supabase.rpc('admin_regions_overview').then(({ data: d, error }) => apply(d, error)), [apply]);
  useEffect(() => { fetchOverview(); }, [fetchOverview]);
  const load = useCallback(async () => { setLoading(true); await fetchOverview(); }, [fetchOverview]);
  const refresh = () => { load(); };

  const afterSave = async (text: string) => {
    flash(true, text);
    await Promise.all([loadRegions(supabase, true), loadRewardPrograms(supabase, true)]);
    await load();
    onChanged?.();
  };

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.regions || []).filter(r => {
      if (filter === 'open' && !r.is_open) return false;
      if (filter === 'soon' && r.is_open) return false;
      if (filter === 'rewards' && !r.program?.program_active) return false;
      if (!term) return true;
      return r.name.toLowerCase().includes(term) || r.country_code.toLowerCase() === term
        || r.default_currency.toLowerCase().includes(term);
    });
  }, [data, q, filter]);

  const totals = useMemo(() => {
    const list = data?.regions || [];
    return {
      open: list.filter(r => r.is_open).length,
      countries: list.length,
      withStations: list.filter(r => r.stations > 0).length,
      stations: list.reduce((a, r) => a + r.stations, 0),
      priced: list.reduce((a, r) => a + r.priced, 0),
      programmes: list.filter(r => r.program?.program_active).length,
      held: list.reduce((a, r) => a + r.held, 0),
    };
  }, [data]);

  const recheckUnknown = async () => {
    const { data: n, error } = await supabase.rpc('admin_assign_unknown_countries');
    if (error) return flash(false, error.message);
    afterSave(`${n ?? 0} station(s) got a country.`);
  };

  const exportExcel = async () => {
    if (!data) return;
    const { data: s } = await supabase.auth.getSession();
    downloadXlsx('qozob-regions', [
      {
        name: 'Countries', title: 'Qozob · Countries and currencies',
        meta: [`Scope: ${data.scope ? data.scope.join(', ') : 'All countries'}`],
        columns: [
          { header: 'Code', width: 6 }, { header: 'Country', width: 26 }, { header: 'Status', width: 12 },
          { header: 'Main currency', width: 10 }, { header: 'Extra currencies', width: 14 },
          { header: 'Usual price from', type: 'number' }, { header: 'Usual price to', type: 'number' },
          { header: 'Stations', type: 'integer' }, { header: 'With a price', type: 'integer' }, { header: 'Claimed', type: 'integer' },
          { header: 'Fresh (7 days)', type: 'integer' }, { header: 'Reports (30 days)', type: 'integer' },
          { header: 'Contributors (30 days)', type: 'integer' }, { header: 'Waiting review', type: 'integer' },
          { header: 'Area maps', type: 'integer' }, { header: 'Area name', width: 14 },
          { header: 'Rewards', width: 10 }, { header: 'Prize currency', width: 10 }, { header: 'Monthly prize', type: 'number' },
          { header: 'Annual prize', type: 'number' }, { header: 'Vouchers', width: 9 },
        ],
        rows: data.regions.map(r => [
          r.country_code, r.name, r.is_open ? 'Open' : 'Coming soon', r.default_currency, r.currencies.join(', '),
          r.price_min, r.price_max, r.stations, r.priced, r.claimed, r.fresh_7d, r.reports_30d, r.contributors_30d, r.held,
          r.areas, r.area_label,
          r.program ? (r.program.program_active ? 'Active' : 'Paused') : 'None', r.program?.currency ?? null,
          r.program?.monthly_prize ?? null, r.program?.annual_prize ?? null, r.program ? (r.program.voucher_enabled ? 'Yes' : 'No') : null,
        ]),
      },
      ...(data.waiting.length ? [{
        name: 'Waiting', title: 'Countries with stations but not set up yet',
        columns: [{ header: 'Code', width: 8 }, { header: 'Stations', type: 'integer' as const }],
        rows: data.waiting.map(w => [w.country_code, w.stations]),
      }] : []),
    ], { generatedBy: s.session?.user?.email });
  };

  if (missing) {
    return (
      <div className={cx(ui.card, 'p-6')}>
        <h2 className={ui.h2}>Regions</h2>
        <div className={cx(ui.alertWarning, 'mt-3')}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          <span>Multi-country support isn&apos;t switched on yet. Run <code>supabase/migrations/20261105_multiregion.sql</code> in the Supabase SQL editor.</span>
        </div>
      </div>
    );
  }

  const chip = (key: Filter, label: string, n?: number) => (
    <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}
      className={cx('shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold transition-colors',
        filter === key ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg hover:bg-surface-2')}>
      {label}{n !== undefined && <span className="tabular opacity-80">{n}</span>}
    </button>
  );

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className={cx(ui.h1, 'flex items-center gap-2')}><Globe2 className="w-7 h-7 text-primary" aria-hidden /> Regions</h2>
          <p className={cx(ui.body, 'mt-1')}>
            Countries, currencies and reward programmes.{data?.scope && ` You cover: ${data.scope.join(', ')}.`}
            {loadedAt && <span className="text-fg-subtle"> · Updated {loadedAt.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={refresh} disabled={loading} className={cx(ui.btn, ui.btnSm, ui.btnSecondary)}>
            <RefreshCw className={cx('w-4 h-4', loading && 'animate-spin')} aria-hidden /> Refresh
          </button>
          <button type="button" onClick={exportExcel} disabled={!data} className={cx(ui.btn, ui.btnSm, ui.btnSecondary)}>
            <Download className="w-4 h-4" aria-hidden /> Excel
          </button>
          {isMaster && (
            <button type="button" onClick={() => setEditRegion({ is_open: true, area_label: 'District', currencies: [], aliases: [] })} className={cx(ui.btn, ui.btnSm, ui.btnPrimary)}>
              <Plus className="w-4 h-4" aria-hidden /> Add country
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className={notice.ok ? ui.alertSuccess : ui.alertError} role="status">
          {notice.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Open for prices" value={`${totals.open} / ${totals.countries}`} hint="countries set up" />
        <Stat label="Stations" value={totals.stations.toLocaleString('en')} hint={`${totals.priced.toLocaleString('en')} with a price · ${totals.withStations} countries`} />
        <Stat label="Reward programmes" value={String(totals.programmes)} hint="active now" />
        <Stat label="Waiting review" value={totals.held.toLocaleString('en')} hint="held prices, all countries" tone={totals.held ? 'warn' : undefined} />
      </div>

      {/* Countries with stations but not set up */}
      {isMaster && data && (data.waiting.length > 0 || data.unknown_country > 0) && (
        <div className={cx(ui.card, 'p-4 sm:p-5 border-warning-line')}>
          <p className="text-sm font-semibold text-fg flex items-center gap-2"><Clock className="w-4 h-4 text-warning" aria-hidden /> Waiting to be set up</p>
          <p className={cx(ui.body, 'mt-1')}>People are already finding stations here. Prices can&apos;t be added until you set the country up.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.waiting.map(w => (
              <button key={w.country_code} type="button" onClick={() => setEditRegion({ country_code: w.country_code, is_open: true, area_label: 'District', currencies: [], aliases: [] })}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-full border border-line bg-surface hover:bg-surface-2 text-sm font-semibold text-fg transition-colors">
                <span aria-hidden>{flagEmoji(w.country_code)}</span> {w.country_code}
                <span className="text-xs text-fg-muted">{w.stations} station{w.stations === 1 ? '' : 's'}</span>
                <Plus className="w-3.5 h-3.5 text-primary" aria-hidden />
              </button>
            ))}
            {data.unknown_country > 0 && (
              <button type="button" onClick={recheckUnknown} className="inline-flex items-center gap-2 h-9 px-3 rounded-full border border-dashed border-line-strong text-sm font-medium text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
                title="Work out the country again from each station's map area and address">
                {data.unknown_country} station{data.unknown_country === 1 ? '' : 's'} with an unknown country · <span className="font-semibold text-primary">Re-check</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" aria-hidden />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search country, code or currency" className={cx(ui.input, 'h-10 pl-10')} aria-label="Search countries" />
        </div>
        <div role="tablist" aria-label="Filter countries" className="flex gap-1 overflow-x-auto rounded-full bg-surface border border-line p-1">
          {chip('all', 'All', data?.regions.length)}
          {chip('open', 'Open', totals.open)}
          {chip('soon', 'Coming soon', (data?.regions.length ?? 0) - totals.open)}
          {chip('rewards', 'With rewards', totals.programmes)}
        </div>
      </div>

      {/* Countries */}
      {loading && !data ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" aria-label="Loading" /></div>
      ) : rows.length === 0 ? (
        <p className={cx(ui.card, 'p-6 text-sm text-fg-muted')}>No countries match.</p>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map(r => (
            <article key={r.country_code} className={cx(ui.card, 'p-4 sm:p-5 flex flex-col gap-3 transition-shadow hover:shadow-md')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-bold text-fg truncate"><span aria-hidden className="mr-1.5">{flagEmoji(r.country_code)}</span>{r.name}</p>
                  <p className="text-xs text-fg-muted mt-0.5">
                    {r.country_code} · {currencyLabel(r.default_currency)}{r.currencies.length > 0 && ` + ${r.currencies.join(', ')}`}
                  </p>
                </div>
                <span className={cx('shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold',
                  r.is_open ? 'bg-success-soft text-on-success-soft border-success-line' : 'bg-surface-2 text-fg-muted border-line')}>
                  {r.is_open ? 'Open' : 'Coming soon'}
                </span>
              </div>

              <dl className="grid grid-cols-3 gap-2 text-center">
                <Mini label="Stations" value={r.stations} />
                <Mini label="Priced" value={r.priced} />
                <Mini label="Reports 30d" value={r.reports_30d} />
              </dl>
              <p className="text-xs text-fg-muted">
                Usual price: {r.price_min && r.price_max ? `${formatMoney(r.price_min, r.default_currency)} – ${formatMoney(r.price_max, r.default_currency)}` : <span className="text-warning font-semibold">not set (only nearby prices are compared)</span>}
                {r.held > 0 && <span className="text-warning font-semibold"> · {r.held} waiting review</span>}
              </p>

              <div className="rounded-xl border border-line bg-surface-2/60 p-3">
                {r.program ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-fg"><Trophy className="w-4 h-4 text-warning" aria-hidden /> {formatMoney(r.program.monthly_prize, r.program.currency)} / month</span>
                      <span className="block text-xs text-fg-muted mt-0.5">
                        {r.areas > 0 ? `per ${r.area_label} (${r.areas} mapped)` : 'one national winner (no area map yet)'}
                        {r.program.voucher_enabled && ' · vouchers'}
                      </span>
                    </span>
                    <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold border',
                      r.program.program_active ? 'bg-success-soft text-on-success-soft border-success-line' : 'bg-warning-soft text-on-warning-soft border-warning-line')}>
                      {r.program.program_active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-fg-muted flex items-center gap-1.5"><Coins className="w-4 h-4" aria-hidden /> No reward programme. Updates here earn no coins.</p>
                )}
              </div>

              <div className="mt-auto flex flex-wrap gap-2">
                {isMaster && <button type="button" onClick={() => setEditRegion(r)} className={cx(ui.btn, ui.btnSm, ui.btnSecondary)}><Pencil className="w-3.5 h-3.5" aria-hidden /> Country</button>}
                {isMaster && <button type="button" onClick={() => setEditProgram(r)} className={cx(ui.btn, ui.btnSm, ui.btnSecondary)}><Trophy className="w-3.5 h-3.5" aria-hidden /> {r.program ? 'Programme' : 'Set up rewards'}</button>}
                {r.country_code !== 'NG' && <button type="button" onClick={() => setAreaFor(r)} className={cx(ui.btn, ui.btnSm, ui.btnGhost)}><MapIcon className="w-3.5 h-3.5" aria-hidden /> Area map</button>}
              </div>
            </article>
          ))}
        </div>
      )}

      {editRegion && <RegionForm initial={editRegion} onClose={() => setEditRegion(null)} onSaved={(t) => { setEditRegion(null); afterSave(t); }} />}
      {editProgram && <ProgramForm region={editProgram} onClose={() => setEditProgram(null)} onSaved={(t) => { setEditProgram(null); afterSave(t); }} />}
      {areaFor && <AreaImport region={areaFor} onClose={() => setAreaFor(null)} onDone={(t) => { setAreaFor(null); afterSave(t); }} />}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: 'warn' }) {
  return (
    <div className={cx(ui.card, 'p-4')}>
      <p className={ui.eyebrow}>{label}</p>
      <p className={cx('mt-1 text-2xl font-bold tabular', tone === 'warn' ? 'text-warning' : 'text-fg')}>{value}</p>
      <p className="text-xs text-fg-muted mt-0.5">{hint}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface-2 py-2">
      <dd className="text-base font-bold tabular text-fg">{value.toLocaleString('en')}</dd>
      <dt className="text-[11px] text-fg-muted">{label}</dt>
    </div>
  );
}

// ---------------------------------------------------------------- shared modal shell
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={cx(ui.overlay, 'z-[300] overflow-y-auto')} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx(ui.modal, wide ? 'max-w-2xl' : 'max-w-lg', 'my-auto p-6 sm:p-7')}>
        <button type="button" onClick={onClose} className={ui.modalClose} aria-label="Close"><X className="w-5 h-5" aria-hidden /></button>
        <h3 className={cx(ui.h2, 'pr-8')}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

const num = (v: string) => (v.trim() === '' ? null : Number(v));

// ---------------------------------------------------------------- country form (master)
function RegionForm({ initial, onClose, onSaved }: { initial: Partial<RegionRow>; onClose: () => void; onSaved: (t: string) => void }) {
  const isNew = !initial.name;
  const [code, setCode] = useState(initial.country_code || '');
  const [name, setName] = useState(initial.name || '');
  const [cur, setCur] = useState(initial.default_currency || '');
  const [extra, setExtra] = useState((initial.currencies || []).join(', '));
  const [aliases, setAliases] = useState((initial.aliases || []).join(', '));
  const [min, setMin] = useState(initial.price_min != null ? String(initial.price_min) : '');
  const [max, setMax] = useState(initial.price_max != null ? String(initial.price_max) : '');
  const [open, setOpen] = useState(initial.is_open ?? true);
  const [area, setArea] = useState(initial.area_label || 'District');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^[A-Za-z]{2}$/.test(code.trim())) return setError('Use the 2-letter country code (for example GH).');
    if (!/^[A-Za-z]{3}$/.test(cur.trim())) return setError('Use the 3-letter currency code (for example GHS).');
    if ((min.trim() === '') !== (max.trim() === '')) return setError('Enter both the lowest and highest usual price, or leave both empty.');
    setBusy(true);
    const { data, error: err } = await supabase.rpc('admin_upsert_region', {
      p_code: code.trim(), p_name: name.trim(), p_default_currency: cur.trim(),
      p_currencies: extra.split(/[,\s]+/).map(s => s.trim()).filter(Boolean),
      p_aliases: aliases.split(',').map(s => s.trim()).filter(Boolean),
      p_price_min: num(min), p_price_max: num(max), p_is_open: open, p_area_label: area.trim() || 'District',
    });
    setBusy(false);
    if (err) return setError(err.message);
    const r = data as { new: boolean; stations_filled: number; stations_adopted: number; currency_changed: boolean };
    const bits = [`${name.trim()} ${r.new ? 'added' : 'saved'}.`];
    if (r.stations_filled) bits.push(`${r.stations_filled} station(s) now priced in ${cur.trim().toUpperCase()}.`);
    if (r.stations_adopted) bits.push(`${r.stations_adopted} station(s) recognised from their address.`);
    if (r.currency_changed) bits.push('Existing stations keep their current currency; change them in Stations if needed.');
    onSaved(bits.join(' '));
  };

  return (
    <Modal title={isNew ? 'Add a country' : `Edit ${initial.name}`} onClose={onClose}>
      <form onSubmit={save} className="mt-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="rg-code" className={ui.label}>Code</label>
            <input id="rg-code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={2} disabled={!isNew} className={cx(ui.input, 'uppercase')} placeholder="GH" required />
          </div>
          <div className="col-span-2">
            <label htmlFor="rg-name" className={ui.label}>Country name</label>
            <input id="rg-name" value={name} onChange={e => setName(e.target.value)} className={ui.input} placeholder="Ghana" required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rg-cur" className={ui.label}>Main currency</label>
            <input id="rg-cur" value={cur} onChange={e => setCur(e.target.value.toUpperCase())} maxLength={3} className={cx(ui.input, 'uppercase')} placeholder="GHS" required />
            <p className={ui.hint}>3-letter ISO code.</p>
          </div>
          <div>
            <label htmlFor="rg-extra" className={ui.label}>Extra currencies</label>
            <input id="rg-extra" value={extra} onChange={e => setExtra(e.target.value.toUpperCase())} className={cx(ui.input, 'uppercase')} placeholder="USD" />
            <p className={ui.hint}>Owners may switch to these.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rg-min" className={ui.label}>Usual price from</label>
            <input id="rg-min" type="number" step="0.01" min={0} value={min} onChange={e => setMin(e.target.value)} className={ui.input} placeholder="per litre" />
          </div>
          <div>
            <label htmlFor="rg-max" className={ui.label}>Usual price to</label>
            <input id="rg-max" type="number" step="0.01" min={0} value={max} onChange={e => setMax(e.target.value)} className={ui.input} placeholder="per litre" />
          </div>
        </div>
        <p className={cx(ui.hint, '-mt-2')}>In the main currency. Prices outside this range wait for review; far outside are refused as typos. Leave empty to only compare with nearby prices.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rg-area" className={ui.label}>Local areas are called</label>
            <input id="rg-area" value={area} onChange={e => setArea(e.target.value)} className={ui.input} placeholder="District" />
          </div>
          <div>
            <label htmlFor="rg-alias" className={ui.label}>Other spellings</label>
            <input id="rg-alias" value={aliases} onChange={e => setAliases(e.target.value)} className={ui.input} placeholder="e.g. Ivory Coast" />
          </div>
        </div>
        <label className="flex items-start gap-3 rounded-xl border border-line p-3 cursor-pointer">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={open} onChange={e => setOpen(e.target.checked)} />
          <span className="text-sm">
            <span className="font-semibold text-fg">Open for prices</span>
            <span className="block text-xs text-fg-muted">When off, stations still show on the map but nobody can add prices (&quot;coming soon&quot;).</span>
          </span>
        </label>
        {error && <div className={ui.alertError}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {error}</div>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnMd, ui.btnGhost)}>Cancel</button>
          <button type="submit" disabled={busy} className={cx(ui.btn, ui.btnMd, ui.btnPrimary)}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : 'Save country'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- reward programme form (master)
function ProgramForm({ region, onClose, onSaved }: { region: RegionRow; onClose: () => void; onSaved: (t: string) => void }) {
  const p = region.program;
  const currencies = [region.default_currency, ...region.currencies];
  const [active, setActive] = useState(p?.program_active ?? false);
  const [currency, setCurrency] = useState(p?.currency || region.default_currency);
  const [monthly, setMonthly] = useState(p ? String(p.monthly_prize) : '');
  const [annual, setAnnual] = useState(p?.annual_prize != null ? String(p.annual_prize) : '');
  const [wht, setWht] = useState(p ? String(p.wht_percent) : '0');
  const [minDays, setMinDays] = useState(p ? String(p.min_active_days) : '8');
  const [annualDays, setAnnualDays] = useState(p ? String(p.annual_min_active_days) : '60');
  const [qUpdates, setQUpdates] = useState(p ? String(p.min_area_updates_quorum) : '30');
  const [qStations, setQStations] = useState(p ? String(p.min_area_stations_quorum) : '3');
  const [qPeople, setQPeople] = useState(p ? String(p.min_area_participants_quorum) : '2');
  const [voucher, setVoucher] = useState(p?.voucher_enabled ?? false);
  const [bonus, setBonus] = useState(p ? String(p.voucher_bonus_pct) : '0');
  const [note, setNote] = useState(p?.note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isNg = region.country_code === 'NG';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const prize = Number(monthly);
    if (active && (!Number.isFinite(prize) || prize <= 0)) return setError('Enter the monthly prize before switching the programme on.');
    if (active && !p && !window.confirm(`Start a reward programme in ${region.name}? From now on, checked price updates there earn coins and a prize of ${formatMoney(prize, currency)} is paid every month (when the area quorum is met).`)) return;
    setBusy(true);
    const { error: err } = await supabase.rpc('admin_upsert_reward_program', {
      p_code: region.country_code,
      p: {
        program_active: active, currency, monthly_prize: Math.round(prize || 0),
        annual_prize: annual.trim() === '' ? '' : Math.round(Number(annual)),
        wht_percent: Number(wht) || 0, min_active_days: Number(minDays) || 8, annual_min_active_days: Number(annualDays) || 60,
        min_area_updates_quorum: Number(qUpdates) || 1, min_area_stations_quorum: Number(qStations) || 1,
        min_area_participants_quorum: Number(qPeople) || 1,
        voucher_enabled: isNg && voucher, voucher_bonus_pct: Number(bonus) || 0, note,
      },
    });
    setBusy(false);
    if (err) return setError(err.message);
    onSaved(`${region.name} reward programme ${p ? 'saved' : 'created'}${active ? ' and active' : ' (paused)'}.`);
  };

  const field = (id: string, label: string, value: string, set: (v: string) => void, hint?: string, step = '1') => (
    <div>
      <label htmlFor={id} className={ui.label}>{label}</label>
      <input id={id} type="number" min={0} step={step} value={value} onChange={e => set(e.target.value)} className={ui.input} />
      {hint && <p className={ui.hint}>{hint}</p>}
    </div>
  );

  return (
    <Modal title={`${flagEmoji(region.country_code)} ${region.name} · reward programme`} onClose={onClose} wide>
      <form onSubmit={save} className="mt-5 space-y-5">
        <label className="flex items-start gap-3 rounded-xl border border-line p-3 cursor-pointer">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={active} onChange={e => setActive(e.target.checked)} />
          <span className="text-sm">
            <span className="font-semibold text-fg">Programme active</span>
            <span className="block text-xs text-fg-muted">When paused, updates in {region.name} still go live but earn no coins.</span>
          </span>
        </label>

        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="pg-cur" className={ui.label}>Prize currency</label>
            <select id="pg-cur" value={currency} onChange={e => setCurrency(e.target.value)} className={ui.select}>
              {currencies.map(c => <option key={c} value={c}>{currencyLabel(c)}</option>)}
            </select>
          </div>
          {field('pg-monthly', 'Monthly prize', monthly, setMonthly, region.areas > 0 ? `Per ${region.area_label}` : 'One national winner')}
          {field('pg-annual', 'Annual grand prize', annual, setAnnual, 'Empty = not announced')}
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          {field('pg-days', 'Active days / month', minDays, setMinDays, 'To qualify')}
          {field('pg-adays', 'Active days / year', annualDays, setAnnualDays, 'Grand prize')}
          {field('pg-wht', 'Withholding tax %', wht, setWht, 'On cash prizes', '0.5')}
        </div>

        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-xs font-semibold text-fg-muted">Minimum activity before a prize is paid ({region.areas > 0 ? `per ${region.area_label}` : 'national'})</legend>
          <div className="grid sm:grid-cols-3 gap-3">
            {field('pg-qu', 'Updates', qUpdates, setQUpdates)}
            {field('pg-qs', 'Stations', qStations, setQStations)}
            {field('pg-qp', 'People', qPeople, setQPeople)}
          </div>
        </fieldset>

        {isNg ? (
          <div className="grid sm:grid-cols-2 gap-3 items-end">
            <label className="flex items-start gap-3 rounded-xl border border-line p-3 cursor-pointer">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={voucher} onChange={e => setVoucher(e.target.checked)} />
              <span className="text-sm"><span className="font-semibold text-fg">Offer service vouchers</span><span className="block text-xs text-fg-muted">Winners may choose an auto-services voucher instead of cash.</span></span>
            </label>
            {field('pg-bonus', 'Voucher bonus %', bonus, setBonus, 'Extra value vs cash')}
          </div>
        ) : (
          <p className="text-xs text-fg-muted">Prizes in {region.name} are paid in cash (bank or mobile money). Service vouchers are only available in Nigeria for now.</p>
        )}

        <div>
          <label htmlFor="pg-note" className={ui.label}>Internal note</label>
          <input id="pg-note" value={note} onChange={e => setNote(e.target.value)} maxLength={500} className={ui.input} placeholder="e.g. Pilot approved by finance on …" />
        </div>

        <p className="text-xs text-fg-muted">Anti-fraud rules (distance, cooldown, daily cap, coins per update) are shared by every country and live in Rewards → Settings.</p>

        {error && <div className={ui.alertError}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {error}</div>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnMd, ui.btnGhost)}>Cancel</button>
          <button type="submit" disabled={busy} className={cx(ui.btn, ui.btnMd, ui.btnPrimary)}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : 'Save programme'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- area map import
interface GeoFeature { type: string; properties?: Record<string, unknown>; geometry?: { type: string } | null }

function AreaImport({ region, onClose, onDone }: { region: RegionRow; onClose: () => void; onDone: (t: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [nameKey, setNameKey] = useState('shapeName');
  const [stateKey, setStateKey] = useState('');
  const [features, setFeatures] = useState<GeoFeature[]>([]);
  const [keys, setKeys] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');

  const read = async (f: File | null) => {
    setFile(f); setError(''); setFeatures([]); setKeys([]);
    if (!f) return;
    if (f.size > 60 * 1024 * 1024) return setError('That file is very large. Use the "simplified" boundary file (usually under 20 MB).');
    try {
      const json = JSON.parse(await f.text());
      const list: GeoFeature[] = (json?.features || []).filter((x: GeoFeature) => x?.geometry && /Polygon/.test(x.geometry.type));
      if (!list.length) return setError('No area shapes found. Upload a GeoJSON file (FeatureCollection with polygons).');
      setFeatures(list);
      const k = Object.keys(list[0].properties || {});
      setKeys(k);
      setNameKey(k.includes('shapeName') ? 'shapeName' : k.find(x => /name/i.test(x)) || k[0] || '');
    } catch {
      setError('Could not read that file. It must be GeoJSON.');
    }
  };

  const run = async () => {
    setError('');
    if (!features.length || !nameKey) return;
    const rows = features.map((f, i) => {
      const props = f.properties || {};
      const id = String(props.shapeID ?? props.shape_id ?? props.id ?? `${region.country_code}-${i + 1}`);
      return { shape_id: id.startsWith(region.country_code) ? id : `${region.country_code}-${id}`, name: String(props[nameKey] ?? '').trim(), state: stateKey ? String(props[stateKey] ?? '').trim() : '', geometry: f.geometry };
    }).filter(r => r.name);
    setProgress({ done: 0, total: rows.length });
    try {
      for (let i = 0; i < rows.length; i += 20) {
        const { error: err } = await supabase.rpc('admin_import_areas', { p_rows: rows.slice(i, i + 20), p_country: region.country_code });
        if (err) throw err;
        setProgress({ done: Math.min(i + 20, rows.length), total: rows.length });
      }
      const { data: n, error: e2 } = await supabase.rpc('admin_assign_station_areas', { p_country: region.country_code });
      if (e2) throw e2;
      onDone(`${rows.length} ${region.area_label.toLowerCase()} area(s) imported for ${region.name}; ${n ?? 0} station(s) placed in their area. Prizes there are now per ${region.area_label}.`);
    } catch (e) {
      setError(e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Import failed.');
      setProgress(null);
    }
  };

  return (
    <Modal title={`${flagEmoji(region.country_code)} ${region.name} · area map`} onClose={onClose}>
      <div className="mt-4 space-y-4">
        <p className={ui.body}>
          With an area map, each {region.area_label} gets its own monthly winner (like Nigeria&apos;s LGAs). Without one, {region.name} has one national winner.
          {region.areas > 0 && <strong className="text-fg"> {region.areas} areas are loaded now; importing again updates them.</strong>}
        </p>
        <p className="text-xs text-fg-muted">
          Free boundary files: <a className={ui.link} href={`https://www.geoboundaries.org/countryDownloads.html`} target="_blank" rel="noreferrer">geoBoundaries</a> (pick {region.name}, level ADM2, &quot;simplified&quot; GeoJSON). Credit: geoBoundaries, CC BY 4.0.
        </p>
        <div>
          <label htmlFor="ar-file" className={ui.label}>GeoJSON file</label>
          <input id="ar-file" type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={e => read(e.target.files?.[0] ?? null)} className={ui.file} />
        </div>
        {features.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ar-name" className={ui.label}>Area name field</label>
              <select id="ar-name" value={nameKey} onChange={e => setNameKey(e.target.value)} className={ui.select}>{keys.map(k => <option key={k} value={k}>{k}</option>)}</select>
            </div>
            <div>
              <label htmlFor="ar-state" className={ui.label}>Region / state field</label>
              <select id="ar-state" value={stateKey} onChange={e => setStateKey(e.target.value)} className={ui.select}>
                <option value="">None (use {region.name})</option>
                {keys.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <p className="col-span-2 text-xs text-fg-muted">{features.length} areas found, e.g. &quot;{String(features[0].properties?.[nameKey] ?? '')}&quot;.</p>
          </div>
        )}
        {progress && (
          <div className="h-2.5 rounded-full bg-surface-3 overflow-hidden" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total} aria-label="Import progress">
            <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
          </div>
        )}
        {error && <div className={ui.alertError}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {error}</div>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnMd, ui.btnGhost)}>Close</button>
          <button type="button" onClick={run} disabled={!file || !features.length || !!progress} className={cx(ui.btn, ui.btnMd, ui.btnPrimary)}>
            {progress ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> {progress.done}/{progress.total}</> : <><Upload className="w-4 h-4" aria-hidden /> Import areas</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}

