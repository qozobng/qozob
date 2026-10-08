"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Trophy, Coins, Users, MapPin, Hourglass, ShieldCheck, Loader2, AlertTriangle, CheckCircle2, X, Download, Eye, Search,
  Ban, RotateCcw, Smartphone, Landmark, Settings as SettingsIcon, Map as MapIcon, RefreshCw, UserX, Plus, Trash2, ExternalLink,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { ui, cx } from '@/lib/ui';
import { StatCard } from '@/components/analytics/StatCard';
import { AreaChart } from '@/components/analytics/AreaChart';
import { BarChart } from '@/components/analytics/BarChart';
import { DonutChart } from '@/components/analytics/DonutChart';
import { DEFAULT_REWARD_SETTINGS, REASON_TEXT, ID_TYPES, naira, monthRange, yearRange, type RewardSettings } from '@/lib/rewards';

// =========================================================================
// ADMIN → REWARDS
// Overview & setup (LGA boundaries), held price reports, participants (ID,
// phone, bank), monthly/annual winners & payouts, programme settings and
// staff exclusions. All checks run in the database
// (supabase/migrations/20261011_rewards.sql); every sensitive action is logged.
// =========================================================================

const supabase = createClient();

type SubTab = 'overview' | 'review' | 'people' | 'payouts' | 'settings';

interface Stats {
  daily: { day: string; accepted: number; held: number; no_reward: number; rejected: number }[];
  reports_month: number; coins_month: number; contributors_month: number; lgas_active_month: number;
  held_pending: number; kyc_pending: number; verified_people: number;
  lgas_loaded: number; stations_with_lga: number; stations_total: number;
  top_lgas: { name: string; state: string; coins: number; contributors: number }[];
  reasons: { reason: string; n: number }[];
}
interface Person {
  user_id: string; email: string; display_name: string; legal_name: string | null; status: string; id_type: string | null; id_last4: string | null;
  dob: string | null; id_doc_path: string | null; phone: string | null; phone_ok: boolean; bank_name: string | null; account_name: string | null;
  account_last4: string | null; strikes: number; excluded: boolean; coins_month: number; submitted_at: string | null; review_note: string | null;
}
interface Winner {
  id: number; period_id: number; kind: 'monthly' | 'annual'; period_start: string; pay_by: string; lga_name: string | null; state: string | null;
  user_id: string | null; email: string | null; display_name: string | null; legal_name: string | null; coins: number; active_days: number; stations: number;
  gross_ngn: number; wht_ngn: number; net_ngn: number; status: 'pending' | 'approved' | 'paid' | 'forfeited'; payment_reference: string | null;
  paid_at: string | null; note: string | null; bank_name: string | null; account_name: string | null; account_last4: string | null;
}
interface HeldReport {
  id: number; user_id: string; station_id: string; lga_id: number | null; price: number; reporter_lat: number | null; reporter_lng: number | null;
  gps_accuracy_m: number | null; distance_m: number | null; coins: number; reasons: string[]; created_at: string;
}

const errText = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Something went wrong.');
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const periodLabel = (w: Pick<Winner, 'kind' | 'period_start'>) =>
  w.kind === 'annual' ? `Year ${w.period_start.slice(0, 4)}` : new Date(w.period_start + 'T00:00:00Z').toLocaleDateString('en-NG', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function csvEscape(v: unknown) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;        // stop spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(name: string, head: string[], rows: unknown[][]) {
  const csv = [head.join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const STATUS_PILL: Record<string, string> = {
  verified: 'bg-success-soft text-on-success-soft border-success-line',
  pending_review: 'bg-warning-soft text-on-warning-soft border-warning-line',
  rejected: 'bg-danger-soft text-on-danger-soft border-danger-line',
  suspended: 'bg-danger-soft text-on-danger-soft border-danger-line',
  incomplete: 'bg-surface-2 text-fg-muted border-line',
  pending: 'bg-info-soft text-on-info-soft border-info-line',
  approved: 'bg-warning-soft text-on-warning-soft border-warning-line',
  paid: 'bg-success-soft text-on-success-soft border-success-line',
  forfeited: 'bg-surface-2 text-fg-muted border-line',
};
const STATUS_TEXT: Record<string, string> = {
  verified: 'Verified', pending_review: 'Needs review', rejected: 'Rejected', suspended: 'Suspended', incomplete: 'Not submitted',
  pending: 'Pending', approved: 'Approved', paid: 'Paid', forfeited: 'Forfeited',
};
const Pill = ({ s }: { s: string }) => (
  <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap', STATUS_PILL[s] ?? STATUS_PILL.incomplete)}>{STATUS_TEXT[s] ?? s}</span>
);

export function RewardsManager() {
  const [tab, setTab] = useState<SubTab>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const loadStats = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_reward_stats', { p_days: 30 });
    if (error) { setStatsError(error.message); return; }
    setStatsError('');
    setStats(data as Stats);
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  const flash = useCallback((ok: boolean, text: string) => {
    setNotice({ ok, text });
    setTimeout(() => setNotice(null), 6000);
  }, []);

  const subTab = (key: SubTab, label: string, Icon: React.ElementType, count?: number) => (
    <button
      key={key}
      type="button"
      role="tab"
      aria-selected={tab === key}
      onClick={() => setTab(key)}
      className={cx('inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors',
        tab === key ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg hover:bg-surface-2')}
    >
      <Icon className="w-4 h-4" aria-hidden /> {label}
      {!!count && <span className={cx('min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full text-xs font-bold', tab === key ? 'bg-on-primary/20' : 'bg-warning-soft text-on-warning-soft')}>{count}</span>}
    </button>
  );

  if (statsError) {
    return (
      <div className={cx(ui.card, 'p-6')}>
        <h2 className={ui.h2}>Rewards</h2>
        <div className={cx(ui.alertWarning, 'mt-3')}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          <span>The rewards database is not set up yet. In Supabase, enable the <strong>postgis</strong> extension (schema <code>extensions</code>), then run <code>supabase/migrations/20261011_rewards.sql</code> in the SQL editor. Details: {statsError}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className={cx(ui.h1, 'flex items-center gap-2')}><Trophy className="w-7 h-7 text-warning" aria-hidden /> Rewards</h2>
          <p className={cx(ui.body, 'mt-1')}>Monthly LGA prizes, annual grand prize, checks and payouts.</p>
        </div>
        <button type="button" onClick={loadStats} className={cx(ui.btn, ui.btnSm, ui.btnSecondary)}><RefreshCw className="w-4 h-4" aria-hidden /> Refresh</button>
      </div>

      <div role="tablist" aria-label="Rewards sections" className="flex gap-1 overflow-x-auto rounded-full bg-surface border border-line p-1 w-fit max-w-full">
        {subTab('overview', 'Overview', Trophy)}
        {subTab('review', 'Held reports', Hourglass, stats?.held_pending)}
        {subTab('people', 'People', Users, stats?.kyc_pending)}
        {subTab('payouts', 'Winners & payouts', Landmark)}
        {subTab('settings', 'Settings', SettingsIcon)}
      </div>

      {notice && (
        <div className={notice.ok ? ui.alertSuccess : ui.alertError} role="status">
          {notice.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />} {notice.text}
        </div>
      )}

      {!stats ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" aria-label="Loading" /></div>
      ) : tab === 'overview' ? (
        <Overview stats={stats} reload={loadStats} flash={flash} />
      ) : tab === 'review' ? (
        <HeldReports flash={flash} reload={loadStats} />
      ) : tab === 'people' ? (
        <People flash={flash} reload={loadStats} />
      ) : tab === 'payouts' ? (
        <Payouts flash={flash} />
      ) : (
        <SettingsPanel flash={flash} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- OVERVIEW
function Overview({ stats, reload, flash }: { stats: Stats; reload: () => void; flash: (ok: boolean, t: string) => void }) {
  const totals = useMemo(() => stats.daily.reduce((a, d) => ({
    accepted: a.accepted + d.accepted, held: a.held + d.held, no_reward: a.no_reward + d.no_reward, rejected: a.rejected + d.rejected,
  }), { accepted: 0, held: 0, no_reward: 0, rejected: 0 }), [stats.daily]);

  return (
    <div className="flex flex-col gap-5">
      <LgaSetup stats={stats} reload={reload} flash={flash} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Rewarded updates (month)" value={stats.reports_month.toLocaleString('en-NG')} subtitle="All checked reports this month" icon={MapPin} colorTheme="indigo" />
        <StatCard title="Coins earned (month)" value={Number(stats.coins_month).toLocaleString('en-NG')} icon={Coins} colorTheme="amber" />
        <StatCard title="Contributors (month)" value={stats.contributors_month.toLocaleString('en-NG')} subtitle={`${stats.verified_people} fully verified people`} icon={Users} colorTheme="emerald" />
        <StatCard title="Active LGAs (month)" value={`${stats.lgas_active_month}/774`} subtitle={`Prize pool up to ${naira(stats.lgas_active_month * 10000)}`} icon={Trophy} colorTheme="purple" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard title="Held for review" value={stats.held_pending} subtitle="Price reports waiting" icon={Hourglass} colorTheme="blue" badge={stats.held_pending ? { text: 'Action', variant: 'warning' } : undefined} />
        <StatCard title="ID checks waiting" value={stats.kyc_pending} subtitle="People to verify" icon={ShieldCheck} colorTheme="rose" badge={stats.kyc_pending ? { text: 'Action', variant: 'warning' } : undefined} />
      </div>

      <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
        <AreaChart title="Coin-earning updates per day" subtitle="Last 30 days (Lagos time)" data={stats.daily.map(d => ({ label: d.day.slice(5), value: d.accepted }))} color="var(--chart-1)" emptyMessage="No updates yet." />
        <DonutChart
          title="Check results"
          subtitle="Last 30 days"
          centerLabel={(totals.accepted + totals.held + totals.no_reward + totals.rejected).toLocaleString('en-NG')}
          centerSub="reports"
          data={[
            { label: 'Coins earned', value: totals.accepted, color: 'var(--chart-2)' },
            { label: 'Held', value: totals.held, color: 'var(--warning)' },
            { label: 'No coins', value: totals.no_reward, color: 'var(--info)' },
            { label: 'Rejected', value: totals.rejected, color: 'var(--danger)' },
          ].filter(s => s.value > 0)}
          emptyMessage="No reports yet."
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <BarChart
          title="Top LGAs this month"
          subtitle="By coins earned"
          layout="horizontal"
          data={stats.top_lgas.map((l, i) => ({ id: `${l.name}-${i}`, label: `${l.name}, ${l.state}`, value: Number(l.coins), formattedValue: `${Number(l.coins).toLocaleString('en-NG')} coins`, secondaryLabel: `${l.contributors} contributor(s)`, color: 'var(--chart-1)' }))}
          emptyMessage="No coins earned yet this month."
        />
        <BarChart
          title="Why updates did not earn coins"
          subtitle="Last 30 days"
          layout="horizontal"
          data={stats.reasons.map(r => ({ id: r.reason, label: REASON_TEXT[r.reason]?.split(/[,.(]/)[0] ?? r.reason, value: Number(r.n), color: 'var(--warning)' }))}
          emptyMessage="Nothing to show yet."
        />
      </div>
    </div>
  );
}

function LgaSetup({ stats, reload, flash }: { stats: Stats; reload: () => void; flash: (ok: boolean, t: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const ready = stats.lgas_loaded >= 774;

  const importLgas = async () => {
    if (!window.confirm('Import the official boundaries for all 774 LGAs? This takes about a minute. Keep this tab open.')) return;
    setBusy(true);
    try {
      const res = await fetch('/data/nga-lga-boundaries.json');
      if (!res.ok) throw new Error('Could not load the boundary file.');
      const file = await res.json() as { lgas: unknown[] };
      const rows = file.lgas;
      setProgress({ done: 0, total: rows.length });
      for (let i = 0; i < rows.length; i += 25) {
        const { error } = await supabase.rpc('admin_import_lgas', { p_rows: rows.slice(i, i + 25) });
        if (error) throw error;
        setProgress({ done: Math.min(i + 25, rows.length), total: rows.length });
      }
      const { data: n, error } = await supabase.rpc('admin_assign_station_lgas');
      if (error) throw error;
      flash(true, `Imported ${rows.length} LGAs and matched ${n ?? 0} stations to their LGA.`);
      reload();
    } catch (e) {
      flash(false, `Import stopped: ${errText(e)}. You can run it again safely.`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const assign = async () => {
    setBusy(true);
    const { data: n, error } = await supabase.rpc('admin_assign_station_lgas');
    setBusy(false);
    if (error) return flash(false, error.message);
    flash(true, `Matched ${n ?? 0} stations to their LGA.`);
    reload();
  };

  return (
    <div className={cx(ui.card, 'p-5 flex flex-col gap-3', !ready && 'border-warning-line')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <MapIcon className={cx('w-6 h-6 shrink-0', ready ? 'text-success' : 'text-warning')} aria-hidden />
          <div>
            <p className="font-semibold text-fg">LGA boundaries: {stats.lgas_loaded}/774 loaded</p>
            <p className="text-sm text-fg-muted">Stations matched to an LGA: {stats.stations_with_lga.toLocaleString('en-NG')} of {stats.stations_total.toLocaleString('en-NG')}. New stations are matched automatically.</p>
            <p className={ui.hint}>Source: geoBoundaries / GRID3 (CC BY 4.0). Credit is shown on the map and Rewards page.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={importLgas} disabled={busy} className={cx(ui.btn, ui.btnSm, ready ? ui.btnSecondary : ui.btnPrimary)}>
            {busy && progress ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Download className="w-4 h-4" aria-hidden />} {ready ? 'Re-import boundaries' : 'Import LGA boundaries'}
          </button>
          {ready && <button type="button" onClick={assign} disabled={busy} className={cx(ui.btn, ui.btnSm, ui.btnSoft)}><RefreshCw className="w-4 h-4" aria-hidden /> Re-match stations</button>}
        </div>
      </div>
      {progress && (
        <div>
          <div className="h-2.5 rounded-full bg-surface-3 overflow-hidden" role="progressbar" aria-valuenow={progress.done} aria-valuemin={0} aria-valuemax={progress.total}>
            <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <p className={ui.hint}>{progress.done} of {progress.total} LGAs imported…</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- HELD REPORTS
function HeldReports({ flash, reload }: { flash: (ok: boolean, t: string) => void; reload: () => void }) {
  const [rows, setRows] = useState<HeldReport[] | null>(null);
  const [stations, setStations] = useState<Map<string, { name: string; address: string; price_pms: number | null; lat: number | null; lng: number | null }>>(new Map());
  const [lgas, setLgas] = useState<Map<number, string>>(new Map());
  const [emails, setEmails] = useState<Map<string, string>>(new Map());
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('price_reports')
      .select('id, user_id, station_id, lga_id, price, reporter_lat, reporter_lng, gps_accuracy_m, distance_m, coins, reasons, created_at')
      .eq('status', 'held').order('created_at', { ascending: true }).limit(100);
    if (error) { flash(false, error.message); setRows([]); return; }
    const list = (data || []) as HeldReport[];
    setRows(list);
    const sIds = Array.from(new Set(list.map(r => r.station_id)));
    const lIds = Array.from(new Set(list.map(r => r.lga_id).filter((x): x is number => x !== null)));
    const [st, lg, people] = await Promise.all([
      sIds.length ? supabase.from('stations').select('station_id, name, address, price_pms, lat, lng').in('station_id', sIds) : Promise.resolve({ data: [] }),
      lIds.length ? supabase.from('lgas').select('id, name, state').in('id', lIds) : Promise.resolve({ data: [] }),
      supabase.rpc('admin_reward_people'),
    ]);
    setStations(new Map(((st.data || []) as { station_id: string; name: string; address: string; price_pms: number | null; lat: number | null; lng: number | null }[]).map(s => [String(s.station_id), s])));
    setLgas(new Map(((lg.data || []) as { id: number; name: string; state: string }[]).map(l => [l.id, `${l.name}, ${l.state}`])));
    setEmails(new Map(((people.data || []) as Person[]).map(p => [p.user_id, p.email])));
  }, [flash]);
  useEffect(() => { load(); }, [load]);

  const decide = async (r: HeldReport, approve: boolean) => {
    let note: string | null = null;
    if (!approve) {
      note = window.prompt('Why are you rejecting this price? (The person gets a strike; 3 strikes suspends them.)', 'Price does not match nearby stations');
      if (note === null) return;
    }
    setBusyId(r.id);
    const { error } = await supabase.rpc('admin_review_report', { p_id: r.id, p_approve: approve, p_note: note });
    setBusyId(null);
    if (error) return flash(false, error.message);
    setRows(prev => (prev || []).filter(x => x.id !== r.id));
    flash(true, approve ? `Approved: ${r.coins} coins added.` : 'Rejected and a strike recorded.');
    reload();
  };

  if (!rows) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" aria-label="Loading" /></div>;
  if (rows.length === 0) {
    return <div className={cx(ui.card, 'p-10 text-center')}><CheckCircle2 className="w-10 h-10 mx-auto text-success" aria-hidden /><p className="mt-3 font-semibold text-fg">Nothing waiting for review</p><p className={ui.body}>Unusual prices and impossible journeys appear here.</p></div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className={ui.body}>The price is already on the map; this decision only affects the coins. Oldest first.</p>
      {rows.map(r => {
        const s = stations.get(String(r.station_id));
        const why = r.reasons.filter(x => x !== 'fresh_bonus');
        return (
          <div key={r.id} className={cx(ui.card, 'p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4')}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-fg">{s?.name ?? 'Station'} <span className="text-fg-muted font-normal">· {r.lga_id ? lgas.get(r.lga_id) ?? '' : 'No LGA'}</span></p>
              <p className="text-xs text-fg-muted truncate">{s?.address}</p>
              <p className="mt-2 text-sm text-fg">
                Reported <strong className="tabular">{naira(r.price)}</strong>
                {s?.price_pms !== undefined && s?.price_pms !== null && <> · map now shows <span className="tabular">{naira(s.price_pms)}</span></>}
                {' '}· {r.coins} coins
              </p>
              <p className="text-xs text-fg-muted mt-1">
                {emails.get(r.user_id) ?? r.user_id.slice(0, 8)} · {fmtDate(r.created_at)}
                {r.distance_m !== null && <> · {r.distance_m.toLocaleString('en-NG')} m from station</>}
                {r.gps_accuracy_m !== null && <> · GPS ±{Math.round(r.gps_accuracy_m)} m</>}
                {r.reporter_lat !== null && r.reporter_lng !== null && (
                  <> · <a className={ui.link} target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&origin=${r.reporter_lat},${r.reporter_lng}&destination=${s?.lat ?? ''},${s?.lng ?? ''}`}>Where they were <ExternalLink className="inline w-3 h-3" aria-hidden /></a></>
                )}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {why.map(x => <span key={x} className="rounded-full border border-warning-line bg-warning-soft text-on-warning-soft px-2 py-0.5 text-xs font-medium">{REASON_TEXT[x] ?? x}</span>)}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="button" disabled={busyId === r.id} onClick={() => decide(r, true)} className={cx(ui.btn, ui.btnSm, ui.btnSuccess)}><CheckCircle2 className="w-4 h-4" aria-hidden /> Approve</button>
              <button type="button" disabled={busyId === r.id} onClick={() => decide(r, false)} className={cx(ui.btn, ui.btnSm, ui.btnDanger)}><X className="w-4 h-4" aria-hidden /> Reject</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- PEOPLE
function People({ flash, reload }: { flash: (ok: boolean, t: string) => void; reload: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending_review' | 'verified' | 'suspended' | 'unverified'>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_reward_people');
    if (error) { flash(false, error.message); setPeople([]); return; }
    setPeople((data || []) as Person[]);
  }, [flash]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => (people || []).filter(p => {
    if (filter === 'pending_review' && p.status !== 'pending_review') return false;
    if (filter === 'verified' && p.status !== 'verified') return false;
    if (filter === 'suspended' && p.status !== 'suspended') return false;
    if (filter === 'unverified' && (p.status === 'verified' || p.excluded)) return false;
    const s = q.trim().toLowerCase();
    return !s || p.email.toLowerCase().includes(s) || (p.legal_name || '').toLowerCase().includes(s);
  }), [people, filter, q]);

  const run = async (fn: () => Promise<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return flash(false, error.message);
    flash(true, ok);
    load(); reload();
  };

  const viewId = async (p: Person) => {
    if (!p.id_doc_path) return;
    const { data, error } = await supabase.storage.from('reward_kyc').createSignedUrl(p.id_doc_path, 300);
    if (error || !data) return flash(false, error?.message ?? 'Could not open the file.');
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const reviewKyc = async (p: Person, approve: boolean) => {
    let note: string | null = null;
    if (!approve) {
      note = window.prompt('Reason (shown to the person):', 'The photo was not clear. Please upload a sharper photo of the whole ID.');
      if (note === null) return;
    } else if (!window.confirm(`Approve ${p.legal_name}? Check the name and date of birth match the ID, and they are 18+. The ID photo will be deleted.`)) return;
    setBusy(true);
    const { data: path, error } = await supabase.rpc('admin_review_kyc', { p_user: p.user_id, p_approve: approve, p_note: note });
    if (!error && path) await supabase.storage.from('reward_kyc').remove([path as string]);   // data minimisation: delete the ID image once reviewed
    setBusy(false);
    if (error) return flash(false, error.message);
    flash(true, approve ? 'Identity approved. ID photo deleted.' : 'Rejected. ID photo deleted; they can submit again.');
    load(); reload();
  };

  const reveal = async (p: Person) => {
    if (!window.confirm('Show the full account number? This is logged. Only do this to make a payment.')) return;
    const { data, error } = await supabase.rpc('admin_reveal_payout', { p_user: p.user_id });
    if (error) return flash(false, error.message);
    const num = (data as { account_number: string }).account_number;
    setRevealed(prev => ({ ...prev, [p.user_id]: num }));
    setTimeout(() => setRevealed(prev => { const n = { ...prev }; delete n[p.user_id]; return n; }), 60000);
  };

  if (!people) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" aria-label="Loading" /></div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto">
          {([['all', 'All'], ['pending_review', 'Needs review'], ['unverified', 'Not verified'], ['verified', 'Verified'], ['suspended', 'Suspended']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={cx(ui.btn, ui.btnSm, filter === k ? ui.btnPrimary : ui.btnSoft)}>{l}</button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <input className={cx(ui.input, 'h-10 pl-10')} placeholder="Search email or name" value={q} onChange={e => setQ(e.target.value)} aria-label="Search people" />
        </div>
      </div>

      {shown.length === 0 ? (
        <div className={cx(ui.card, 'p-10 text-center')}><p className="font-semibold text-fg">No one here</p><p className={ui.body}>People appear once they earn coins or start verification.</p></div>
      ) : (
        <div className={cx(ui.card, 'divide-y divide-line overflow-hidden')}>
          {shown.map(p => {
            const expanded = open === p.user_id;
            return (
              <div key={p.user_id}>
                <button type="button" onClick={() => setOpen(expanded ? null : p.user_id)} className="w-full p-4 flex flex-wrap items-center gap-3 text-left hover:bg-surface-2 transition-colors" aria-expanded={expanded}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-fg truncate">{p.legal_name || p.display_name} <span className="font-normal text-fg-muted">· {p.email}</span></span>
                    <span className="block text-xs text-fg-muted mt-0.5">
                      {Number(p.coins_month).toLocaleString('en-NG')} coins this month
                      {p.strikes > 0 && <> · <span className="text-danger font-semibold">{p.strikes} strike(s)</span></>}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {p.excluded && <span className="rounded-full border border-line bg-surface-2 text-fg-muted px-2 py-0.5 text-xs font-semibold">Excluded</span>}
                    <span title="Phone" className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold', p.phone_ok ? STATUS_PILL.verified : STATUS_PILL.incomplete)}><Smartphone className="w-3 h-3" aria-hidden />{p.phone_ok ? 'OK' : 'No'}</span>
                    <span title="Bank" className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold', p.account_last4 ? STATUS_PILL.verified : STATUS_PILL.incomplete)}><Landmark className="w-3 h-3" aria-hidden />{p.account_last4 ? 'OK' : 'No'}</span>
                    <Pill s={p.status} />
                  </span>
                </button>
                {expanded && (
                  <div className="px-4 pb-5 pt-1 bg-surface-2/50 border-t border-line grid lg:grid-cols-3 gap-4 text-sm">
                    <div className="space-y-1 pt-3">
                      <p className={ui.eyebrow}>Identity</p>
                      <p className="text-fg">{p.legal_name ?? '—'}</p>
                      <p className="text-fg-muted">DOB: {p.dob ?? '—'}</p>
                      <p className="text-fg-muted">{p.id_type ? `${ID_TYPES.find(t => t.value === p.id_type)?.label ?? p.id_type} ····${p.id_last4}` : 'No ID submitted'}</p>
                      {p.submitted_at && <p className="text-fg-muted">Submitted {fmtDate(p.submitted_at)}</p>}
                      {p.review_note && <p className="text-fg-muted">Note: {p.review_note}</p>}
                      {p.status === 'pending_review' && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {p.id_doc_path && <button type="button" onClick={() => viewId(p)} className={cx(ui.btn, ui.btnSm, ui.btnSecondary)}><Eye className="w-4 h-4" aria-hidden /> View ID</button>}
                          <button type="button" disabled={busy} onClick={() => reviewKyc(p, true)} className={cx(ui.btn, ui.btnSm, ui.btnSuccess)}><CheckCircle2 className="w-4 h-4" aria-hidden /> Approve</button>
                          <button type="button" disabled={busy} onClick={() => reviewKyc(p, false)} className={cx(ui.btn, ui.btnSm, ui.btnDanger)}><X className="w-4 h-4" aria-hidden /> Reject</button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1 pt-3">
                      <p className={ui.eyebrow}>Phone</p>
                      <p className="text-fg">{p.phone ? `+${p.phone.replace(/^\+/, '')}` : 'No number'}</p>
                      <p className="text-fg-muted">{p.phone_ok ? 'Verified' : 'Not verified'}</p>
                      <div className="flex flex-wrap gap-2 pt-2">
                        {!p.phone_ok
                          ? <button type="button" disabled={busy} onClick={() => window.confirm('Only mark as verified after confirming the number yourself (e.g. a call). Continue?') && run(async () => await supabase.rpc('admin_set_participant', { p_user: p.user_id, p_action: 'phone_verified', p_note: 'Verified manually by admin' }), 'Phone marked as verified.')} className={cx(ui.btn, ui.btnSm, ui.btnSecondary)}><Smartphone className="w-4 h-4" aria-hidden /> Mark verified</button>
                          : <button type="button" disabled={busy} onClick={() => run(async () => await supabase.rpc('admin_set_participant', { p_user: p.user_id, p_action: 'phone_unverified', p_note: null }), 'Manual phone verification removed.')} className={cx(ui.btn, ui.btnSm, ui.btnGhost)}>Remove manual check</button>}
                      </div>
                    </div>
                    <div className="space-y-1 pt-3">
                      <p className={ui.eyebrow}>Bank</p>
                      {p.account_last4 ? (
                        <>
                          <p className="text-fg">{p.bank_name}</p>
                          <p className="text-fg-muted">{p.account_name}</p>
                          <p className="text-fg tabular font-semibold">{revealed[p.user_id] ?? `······${p.account_last4}`}</p>
                          {!revealed[p.user_id] && <button type="button" onClick={() => reveal(p)} className={cx(ui.btn, ui.btnSm, ui.btnGhost, 'mt-1')}><Eye className="w-4 h-4" aria-hidden /> Reveal (logged)</button>}
                        </>
                      ) : <p className="text-fg-muted">No bank account</p>}
                      <div className="pt-3">
                        {p.status === 'suspended'
                          ? <button type="button" disabled={busy} onClick={() => run(async () => await supabase.rpc('admin_set_participant', { p_user: p.user_id, p_action: 'unsuspend', p_note: 'Reinstated by admin' }), 'Reinstated. Strikes reset.')} className={cx(ui.btn, ui.btnSm, ui.btnSecondary)}><RotateCcw className="w-4 h-4" aria-hidden /> Reinstate</button>
                          : <button type="button" disabled={busy} onClick={() => { const n = window.prompt('Reason for suspending (shown to the person):', 'Suspected fake price updates'); if (n !== null) run(async () => await supabase.rpc('admin_set_participant', { p_user: p.user_id, p_action: 'suspend', p_note: n }), 'Suspended.'); }} className={cx(ui.btn, ui.btnSm, ui.btnDanger)}><Ban className="w-4 h-4" aria-hidden /> Suspend</button>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- WINNERS & PAYOUTS
function Payouts({ flash }: { flash: (ok: boolean, t: string) => void }) {
  const [winners, setWinners] = useState<Winner[] | null>(null);
  const [period, setPeriod] = useState<string>('');
  const [month, setMonth] = useState(monthRange(-1).start.slice(0, 7));
  const [year, setYear] = useState(yearRange(-1).label);
  const [busy, setBusy] = useState(false);
  const [showForfeited, setShowForfeited] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_reward_winners');
    if (error) { flash(false, error.message); setWinners([]); return; }
    const list = (data || []) as Winner[];
    setWinners(list);
    setPeriod(prev => prev || (list[0] ? String(list[0].period_id) : ''));
  }, [flash]);
  useEffect(() => { load(); }, [load]);

  const periods = useMemo(() => {
    const m = new Map<string, Winner>();
    (winners || []).forEach(w => { if (!m.has(String(w.period_id))) m.set(String(w.period_id), w); });
    return Array.from(m.entries());
  }, [winners]);
  const rows = useMemo(() => (winners || []).filter(w => String(w.period_id) === period && (showForfeited || w.status !== 'forfeited')), [winners, period, showForfeited]);
  const sum = rows.filter(w => w.status !== 'forfeited').reduce((a, w) => ({ n: a.n + 1, net: a.net + w.net_ngn, paid: a.paid + (w.status === 'paid' ? 1 : 0) }), { n: 0, net: 0, paid: 0 });

  const close = async (kind: 'monthly' | 'annual') => {
    const start = kind === 'monthly' ? `${month}-01` : `${year}-01-01`;
    const label = kind === 'monthly' ? new Date(start + 'T00:00:00Z').toLocaleDateString('en-NG', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : `the year ${year}`;
    if (!window.confirm(`Close ${label} and pick the winners? First approve or reject held reports and pending ID checks, because only verified people with enough active days can win. This cannot be undone.`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_close_period', { p_kind: kind, p_start: start });
    setBusy(false);
    if (error) return flash(false, error.message);
    const r = data as { period_id: number; winners: number; pay_by: string };
    flash(true, `Closed ${label}: ${r.winners} winner(s). Pay by ${r.pay_by}.`);
    setPeriod(String(r.period_id));
    load();
  };

  const act = async (w: Winner, action: 'approve' | 'paid' | 'replace') => {
    setBusy(true);
    let res: { error: { message: string } | null };
    if (action === 'approve') {
      res = await supabase.rpc('admin_update_winner', { p_winner_id: w.id, p_status: 'approved', p_reference: null, p_note: null });
    } else if (action === 'paid') {
      const ref = window.prompt(`Bank transfer reference for ${naira(w.net_ngn)} to ${w.legal_name ?? w.email}:`);
      if (!ref) { setBusy(false); return; }
      res = await supabase.rpc('admin_update_winner', { p_winner_id: w.id, p_status: 'paid', p_reference: ref, p_note: null });
    } else {
      const note = window.prompt('Why is this prize forfeited? The next qualified person in this LGA will be chosen.', 'Could not verify / no response within 60 days');
      if (note === null) { setBusy(false); return; }
      res = await supabase.rpc('admin_replace_winner', { p_winner_id: w.id, p_note: note });
    }
    setBusy(false);
    if (res.error) return flash(false, res.error.message);
    flash(true, action === 'paid' ? 'Marked as paid.' : action === 'approve' ? 'Approved for payment.' : 'Forfeited and replaced (if anyone else qualified).');
    load();
  };

  const exportCsv = async (withAccounts: boolean) => {
    const live = rows.filter(w => w.status !== 'forfeited');
    if (!live.length) return;
    let numbers: Record<string, string> = {};
    if (withAccounts) {
      if (!window.confirm(`Export full account numbers for ${live.length} winner(s)? Each reveal is logged. Store the file securely and delete it after paying.`)) return;
      setBusy(true);
      for (const w of live) {
        if (!w.user_id || numbers[w.user_id]) continue;
        const { data } = await supabase.rpc('admin_reveal_payout', { p_user: w.user_id });
        if (data) numbers[w.user_id] = (data as { account_number: string }).account_number;
      }
      setBusy(false);
    } else numbers = {};
    downloadCsv(
      `qozob-winners-${live[0].kind}-${live[0].period_start}${withAccounts ? '-PAYMENT' : ''}.csv`,
      ['period', 'lga', 'state', 'legal_name', 'email', 'coins', 'active_days', 'gross_ngn', 'wht_ngn', 'net_ngn', 'bank', 'account_name', 'account_number', 'status', 'reference', 'pay_by'],
      live.map(w => [periodLabel(w), w.lga_name ?? 'National', w.state ?? '', w.legal_name, w.email, w.coins, w.active_days, w.gross_ngn, w.wht_ngn, w.net_ngn,
        w.bank_name, w.account_name, withAccounts && w.user_id ? numbers[w.user_id] ?? '' : (w.account_last4 ? `****${w.account_last4}` : ''), w.status, w.payment_reference, w.pay_by]),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div className={cx(ui.card, 'p-5')}>
          <h3 className={ui.h2}>Close a month</h3>
          <p className={cx(ui.body, 'mt-1')}>Picks the top qualified person in each LGA. Do this on the 1st–3rd, then pay by the 7th.</p>
          <div className="mt-3 flex gap-2">
            <input type="month" className={cx(ui.input, 'h-10 max-w-[200px]')} value={month} onChange={e => setMonth(e.target.value)} max={monthRange(-1).start.slice(0, 7)} aria-label="Month to close" />
            <button type="button" disabled={busy} onClick={() => close('monthly')} className={cx(ui.btn, ui.btnMd, ui.btnPrimary)}><Trophy className="w-4 h-4" aria-hidden /> Close month</button>
          </div>
        </div>
        <div className={cx(ui.card, 'p-5')}>
          <h3 className={ui.h2}>Close a year (grand prize)</h3>
          <p className={cx(ui.body, 'mt-1')}>One national winner for January–December, paid by 31 January. Set the prize in Settings first.</p>
          <div className="mt-3 flex gap-2">
            <input type="number" className={cx(ui.input, 'h-10 max-w-[120px]')} value={year} onChange={e => setYear(e.target.value)} min={2026} max={Number(yearRange(-1).label)} aria-label="Year to close" />
            <button type="button" disabled={busy} onClick={() => close('annual')} className={cx(ui.btn, ui.btnMd, ui.btnPrimary)}><Trophy className="w-4 h-4" aria-hidden /> Close year</button>
          </div>
        </div>
      </div>

      <div className={cx(ui.card, 'p-4 sm:p-5')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select className={cx(ui.select, 'h-10 w-auto')} value={period} onChange={e => setPeriod(e.target.value)} aria-label="Period">
              {periods.length === 0 && <option value="">No closed periods yet</option>}
              {periods.map(([id, w]) => <option key={id} value={id}>{periodLabel(w)} ({w.kind})</option>)}
            </select>
            <label className="inline-flex items-center gap-2 text-sm text-fg-muted"><input type="checkbox" className="accent-primary" checked={showForfeited} onChange={e => setShowForfeited(e.target.checked)} /> Show forfeited</label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!rows.length || busy} onClick={() => exportCsv(false)} className={cx(ui.btn, ui.btnSm, ui.btnSecondary)}><Download className="w-4 h-4" aria-hidden /> CSV</button>
            <button type="button" disabled={!rows.length || busy} onClick={() => exportCsv(true)} className={cx(ui.btn, ui.btnSm, ui.btnSoft)}><Landmark className="w-4 h-4" aria-hidden /> Payment file (logged)</button>
          </div>
        </div>
        {period && <p className="mt-3 text-sm text-fg-muted">{sum.n} winner(s) · {naira(sum.net)} to pay · {sum.paid} paid{rows[0] ? ` · pay by ${rows[0].pay_by}` : ''}</p>}

        {!winners ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" aria-label="Loading" /></div>
        ) : rows.length === 0 ? (
          <p className={cx(ui.body, 'py-8 text-center')}>{periods.length ? 'No winners in this period (nobody qualified).' : 'Close a month to see its winners here.'}</p>
        ) : (
          <div className="overflow-x-auto mt-3 -mx-4 sm:mx-0">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-fg-subtle border-b border-line">
                  <th className="py-2 px-2">LGA</th><th className="py-2 px-2">Winner</th><th className="py-2 px-2 text-right">Coins / days</th>
                  <th className="py-2 px-2">Bank</th><th className="py-2 px-2 text-right">Net</th><th className="py-2 px-2">Status</th><th className="py-2 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(w => (
                  <tr key={w.id} className="border-b border-line last:border-0 align-top">
                    <td className="py-2.5 px-2"><span className="font-semibold text-fg">{w.lga_name ?? 'National'}</span><span className="block text-xs text-fg-muted">{w.state}</span></td>
                    <td className="py-2.5 px-2"><span className="text-fg">{w.legal_name ?? w.display_name}</span><span className="block text-xs text-fg-muted">{w.email}</span></td>
                    <td className="py-2.5 px-2 text-right tabular">{w.coins.toLocaleString('en-NG')}<span className="block text-xs text-fg-muted">{w.active_days} days · {w.stations} stations</span></td>
                    <td className="py-2.5 px-2">{w.bank_name ? <><span className="text-fg">{w.bank_name}</span><span className="block text-xs text-fg-muted">{w.account_name} ····{w.account_last4}</span></> : <span className="text-danger text-xs font-semibold">No bank account</span>}</td>
                    <td className="py-2.5 px-2 text-right tabular font-semibold">{naira(w.net_ngn)}{w.wht_ngn > 0 && <span className="block text-xs text-fg-muted font-normal">tax {naira(w.wht_ngn)}</span>}</td>
                    <td className="py-2.5 px-2"><Pill s={w.status} />{w.payment_reference && <span className="block text-xs text-fg-muted mt-1">Ref {w.payment_reference}</span>}{w.note && <span className="block text-xs text-fg-muted mt-1">{w.note}</span>}</td>
                    <td className="py-2.5 px-2">
                      {w.status !== 'paid' && w.status !== 'forfeited' && (
                        <div className="flex justify-end gap-1.5 flex-wrap">
                          {w.status === 'pending' && <button type="button" disabled={busy} onClick={() => act(w, 'approve')} className={cx(ui.btn, ui.btnSm, ui.btnSoft)}>Approve</button>}
                          <button type="button" disabled={busy} onClick={() => act(w, 'paid')} className={cx(ui.btn, ui.btnSm, ui.btnSuccess)}>Mark paid</button>
                          <button type="button" disabled={busy} onClick={() => act(w, 'replace')} className={cx(ui.btn, ui.btnSm, ui.btnDanger)}>Forfeit</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- SETTINGS + EXCLUSIONS
const FIELDS: { key: keyof RewardSettings; label: string; hint: string; step?: number; nullable?: boolean }[] = [
  { key: 'monthly_prize_ngn', label: 'Monthly prize per LGA (₦)', hint: 'Applies to months closed after you save.' },
  { key: 'annual_prize_ngn', label: 'Annual grand prize (₦)', hint: 'Leave empty to show “to be announced”.', nullable: true },
  { key: 'wht_percent', label: 'Tax withheld from prizes (%)', hint: 'Set after tax advice (e.g. 5). 0 = none.', step: 0.5 },
  { key: 'min_active_days', label: 'Active days needed per month', hint: 'Days with at least one coin-earning update.' },
  { key: 'annual_min_active_days', label: 'Active days needed per year', hint: 'For the grand prize.' },
  { key: 'coins_per_update', label: 'Coins per update', hint: '' },
  { key: 'coins_fresh_bonus', label: 'Fresh-station bonus coins', hint: 'When no one earned coins there in 24 hours.' },
  { key: 'max_distance_m', label: 'Max distance from station (m)', hint: 'Must be at the station.' },
  { key: 'cooldown_hours', label: 'Hours between rewarded updates (same station)', hint: '' },
  { key: 'daily_cap', label: 'Rewarded updates per day (max)', hint: '' },
  { key: 'outlier_percent', label: 'Hold prices this % away from nearby median', hint: '' },
  { key: 'price_min', label: 'Lowest believable price (₦/L)', hint: '' },
  { key: 'price_max', label: 'Highest believable price (₦/L)', hint: '' },
  { key: 'max_speed_kmh', label: 'Fastest believable travel (km/h)', hint: 'Faster jumps between stations are held.' },
];

function SettingsPanel({ flash }: { flash: (ok: boolean, t: string) => void }) {
  const [s, setS] = useState<RewardSettings | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('reward_settings').select('*').maybeSingle().then(({ data, error }) => {
      if (error) return flash(false, error.message);
      const v = { ...DEFAULT_REWARD_SETTINGS, ...(data || {}) } as RewardSettings;
      setS(v);
      setActive(v.program_active);
      setForm(Object.fromEntries(FIELDS.map(f => [f.key, v[f.key] === null || v[f.key] === undefined ? '' : String(v[f.key])])));
    });
  }, [flash]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch: Record<string, number | boolean | null> = { program_active: active };
    for (const f of FIELDS) {
      const raw = (form[f.key] ?? '').trim();
      if (raw === '' && f.nullable) { patch[f.key] = null; continue; }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return flash(false, `Check “${f.label}”.`);
      patch[f.key] = n;
    }
    if ((patch.price_min as number) >= (patch.price_max as number)) return flash(false, 'The lowest price must be below the highest price.');
    setBusy(true);
    const { error } = await supabase.from('reward_settings').update(patch).eq('id', true);
    setBusy(false);
    if (error) return flash(false, error.message);
    flash(true, 'Settings saved. The Rewards page and rules shown to users update straight away.');
  };

  return (
    <div className="grid xl:grid-cols-[2fr_1fr] gap-4 items-start">
      <form onSubmit={save} className={cx(ui.card, 'p-5 sm:p-6')}>
        <h3 className={ui.h2}>Programme settings</h3>
        {!s ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" aria-label="Loading" /></div> : (
          <>
            <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-line p-4">
              <span><span className="block font-semibold text-fg">Programme running</span><span className="block text-xs text-fg-muted">Switch off to pause coins (prices still save).</span></span>
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={active} onChange={e => setActive(e.target.checked)} />
            </label>
            <div className="mt-4 grid sm:grid-cols-2 gap-4">
              {FIELDS.map(f => (
                <div key={f.key}>
                  <label htmlFor={`rs-${f.key}`} className={ui.label}>{f.label}</label>
                  <input id={`rs-${f.key}`} type="number" min={0} step={f.step ?? 1} className={ui.input} value={form[f.key] ?? ''} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.nullable ? 'To be announced' : ''} />
                  {f.hint && <p className={ui.hint}>{f.hint}</p>}
                </div>
              ))}
            </div>
            <p className={cx(ui.hint, 'mt-4')}>If you change how coins or prizes work, also update the Official Rules page (app/rewards/rules) so users are told before it applies.</p>
            <button type="submit" disabled={busy} className={cx(ui.btn, ui.btnMd, ui.btnPrimary, 'mt-4')}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : 'Save settings'}</button>
          </>
        )}
      </form>
      <Exclusions flash={flash} />
    </div>
  );
}

interface Exclusion { user_id: string; email: string | null; reason: string; created_at: string }

function Exclusions({ flash }: { flash: (ok: boolean, t: string) => void }) {
  const [list, setList] = useState<Exclusion[] | null>(null);
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('Qozob staff / representative');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_reward_exclusions');
    if (error) { flash(false, error.message); setList([]); return; }
    setList((data || []) as Exclusion[]);
  }, [flash]);
  useEffect(() => { load(); }, [load]);

  const set = async (addr: string, exclude: boolean) => {
    setBusy(true);
    const { error } = await supabase.rpc('admin_exclude_user', { p_email: addr, p_exclude: exclude, p_reason: exclude ? reason : null });
    setBusy(false);
    if (error) return flash(false, error.message);
    if (exclude) setEmail('');
    flash(true, exclude ? `${addr} can no longer earn coins.` : `${addr} can earn coins again.`);
    load();
  };

  return (
    <div className={cx(ui.card, 'p-5 sm:p-6')}>
      <h3 className={cx(ui.h2, 'flex items-center gap-2')}><UserX className="w-5 h-5" aria-hidden /> Excluded people</h3>
      <p className={cx(ui.body, 'mt-1')}>Admins, station managers/owners and @qozob.com emails are excluded automatically. Add field reps, contractors and family here.</p>
      <form onSubmit={e => { e.preventDefault(); if (email.trim()) set(email.trim(), true); }} className="mt-4 space-y-2">
        <input type="email" className={cx(ui.input, 'h-10')} placeholder="their account email" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email to exclude" required />
        <input className={cx(ui.input, 'h-10')} value={reason} onChange={e => setReason(e.target.value)} aria-label="Reason" />
        <button type="submit" disabled={busy} className={cx(ui.btn, ui.btnSm, ui.btnPrimary)}><Plus className="w-4 h-4" aria-hidden /> Exclude</button>
      </form>
      <ul className="mt-4 divide-y divide-line">
        {(list || []).map(x => (
          <li key={x.user_id} className="py-2.5 flex items-center justify-between gap-2">
            <span className="min-w-0"><span className="block text-sm font-medium text-fg truncate">{x.email ?? x.user_id}</span><span className="block text-xs text-fg-muted">{x.reason}</span></span>
            {x.email && <button type="button" disabled={busy} onClick={() => set(x.email as string, false)} className="p-1.5 rounded-md text-fg-muted hover:text-danger hover:bg-danger-soft" aria-label={`Remove exclusion for ${x.email}`}><Trash2 className="w-4 h-4" /></button>}
          </li>
        ))}
        {list && list.length === 0 && <li className="py-3 text-sm text-fg-muted">No manual exclusions yet.</li>}
      </ul>
    </div>
  );
}
