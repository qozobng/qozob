"use client";

// =========================================================================
// ADMIN · PRICE REVIEWS
// Community prices that broke a rule (out of range, far from the local
// median, impossible journey, suspended reporter) are HELD: they are not on
// the map until an admin approves them. Approving publishes the price with
// the time it was originally reported (unless a newer price is already live)
// and the reporter keeps coins for that original time. Rejecting adds a strike.
// Also: a full, filterable log of every price report with Excel export.
// =========================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, ExternalLink, History, Hourglass, Loader2, MapPin, RefreshCw, X,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { cx, ui } from '@/lib/ui';
import { REASON_TEXT, naira, monthRange, isoDate, lagosToday } from '@/lib/rewards';
import { queueLabel } from '@/lib/queue';
import { downloadXlsx, formatWat } from '@/lib/xlsx';
import { fetchAllRows, isMissingFunction } from '@/lib/fetchAll';
import { ReportTable, type ReportColumn } from './ReportTable';

const supabase = createClient();

interface QueueRow {
  id: number;
  created_at: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  strikes: number;
  station_id: string;
  station_name: string | null;
  station_lat: number | null;
  station_lng: number | null;
  lga: string | null;
  state: string | null;
  price: number;
  current_price: number | null;
  current_updated: string | null;
  ref_median: number | null;
  queue_status: string | null;
  distance_m: number | null;
  gps_accuracy_m: number | null;
  coins: number;
  reasons: string[];
  applied: boolean | null;
}

interface LogRow {
  id: number;
  created_at: string;
  lagos_day: string;
  status: string;
  live_on_map: string;
  coins: number;
  price: number;
  queue_status: string | null;
  ref_median: number | null;
  station_id: string;
  station_name: string | null;
  lga: string | null;
  state: string | null;
  user_id: string;
  email: string | null;
  display_name: string | null;
  distance_m: number | null;
  gps_accuracy_m: number | null;
  reasons: string | null;
  reviewed_at: string | null;
  reviewer_email: string | null;
  review_note: string | null;
}

const STATUS_TEXT: Record<string, string> = {
  accepted: 'Coins earned', held: 'Waiting for review', rejected: 'Rejected', no_reward: 'No coins',
};

const reasonText = (r: string) => REASON_TEXT[r]?.split(/[.(]/)[0] ?? r.replace(/_/g, ' ');

export function PriceReviews({ onChanged, compact }: { onChanged?: () => void; compact?: boolean }) {
  const [view, setView] = useState<'queue' | 'log'>('queue');
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [notDeployed, setNotDeployed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const flash = useCallback((ok: boolean, text: string) => {
    setNotice({ ok, text });
    window.setTimeout(() => setNotice(null), 7000);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_price_review_queue');
    if (err) {
      if (isMissingFunction(err)) setNotDeployed(true);
      else setError(err.message);
      setRows([]);
    } else {
      setNotDeployed(false);
      setRows(((data || []) as QueueRow[]).map((r) => ({
        ...r,
        price: Number(r.price),
        current_price: r.current_price === null ? null : Number(r.current_price),
        ref_median: r.ref_median === null ? null : Number(r.ref_median),
        reasons: r.reasons || [],
      })));
    }
    setLoadedAt(new Date());
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (r: QueueRow, approve: boolean) => {
    let note: string | null = null;
    if (!approve) {
      note = window.prompt(
        'Why are you rejecting this price? The person gets a strike (3 strikes suspends them from rewards).',
        'Price does not match nearby stations',
      );
      if (note === null) return;
    }
    setBusyId(r.id);
    const { data, error: err } = await supabase.rpc('admin_review_report', { p_id: r.id, p_approve: approve, p_note: note });
    setBusyId(null);
    if (err) return flash(false, err.message);

    const res = (data && typeof data === 'object' ? data : {}) as { published?: boolean; already_live?: boolean };
    setRows((prev) => (prev || []).filter((x) => x.id !== r.id));
    if (!approve) flash(true, 'Rejected. The price stays off the map and a strike was recorded.');
    else if (res.published) flash(true, `Approved and published: ${naira(r.price)} now shows on the map, timed ${formatWat(r.created_at)}.`);
    else if (res.already_live) flash(true, `Approved: ${r.coins} coins confirmed.`);
    else flash(true, 'Approved and coins kept. The map was not changed because a newer price was already live.');
    onChanged?.();
  };

  const exportQueue = async () => {
    const list = rows || [];
    const { data } = await supabase.auth.getSession();
    downloadXlsx('qozob-prices-waiting-for-review', [{
      name: 'Waiting for review',
      title: 'Qozob · Prices waiting for review',
      meta: [`Data as of: ${formatWat(loadedAt)} WAT`, `Rows: ${list.length}`],
      columns: [
        { header: 'Report ID', type: 'integer' }, { header: 'Reported at', type: 'datetime' }, { header: 'Station' },
        { header: 'LGA' }, { header: 'State' }, { header: 'Reported price (₦)', type: 'money' },
        { header: 'Price on map (₦)', type: 'money' }, { header: 'Nearby median (₦)', type: 'money' },
        { header: 'Queue' }, { header: 'Why held', width: 50 }, { header: 'On map now?' },
        { header: 'Reporter' }, { header: 'Reporter email', width: 28 }, { header: 'Strikes', type: 'integer' },
        { header: 'Distance (m)', type: 'integer' }, { header: 'GPS accuracy (m)', type: 'integer' },
        { header: 'Coins if approved', type: 'integer' }, { header: 'Station ID' },
      ],
      rows: list.map((r) => [
        r.id, r.created_at, r.station_name, r.lga, r.state, r.price, r.current_price, r.ref_median,
        queueLabel(r.queue_status), r.reasons.filter((x) => x !== 'fresh_bonus').map(reasonText).join('; '),
        r.applied === false ? 'No (waiting)' : 'Yes (older rules)', r.display_name, r.email, r.strikes,
        r.distance_m, r.gps_accuracy_m === null ? null : Math.round(r.gps_accuracy_m), r.coins, r.station_id,
      ]),
    }], { generatedBy: data.session?.user?.email });
  };

  const waiting = rows?.length ?? 0;

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-300">
      {!compact && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-fg mb-1">Price reviews</h2>
            <p className="text-fg-muted text-xs sm:text-sm max-w-2xl">
              Unusual community prices wait here and are <strong className="text-fg">not shown on the map</strong> until approved.
              Approving publishes the price with its original time; the reporter keeps coins for that time.
            </p>
          </div>
        </div>
      )}

      <div role="tablist" aria-label="Price review views" className="flex gap-1 rounded-full bg-surface border border-line p-1 w-fit max-w-full overflow-x-auto">
        {([['queue', 'Waiting for review', Hourglass], ['log', 'All price reports', History]] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={view === k}
            onClick={() => setView(k)}
            className={cx('inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors',
              view === k ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg hover:bg-surface-2')}
          >
            <Icon className="w-4 h-4" aria-hidden /> {label}
            {k === 'queue' && waiting > 0 && (
              <span className={cx('min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full text-xs font-bold',
                view === k ? 'bg-on-primary/20' : 'bg-warning-soft text-on-warning-soft')}>{waiting}</span>
            )}
          </button>
        ))}
      </div>

      {notice && (
        <div className={cx(notice.ok ? ui.alertSuccess : ui.alertError, 'animate-in fade-in slide-in-from-top-1 duration-200')} role="status">
          {notice.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />}
          <span>{notice.text}</span>
        </div>
      )}
      {notDeployed && (
        <div className={ui.alertWarning}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          <span>Price reviews need the latest database update. Run <code>supabase/migrations/20261014_admin_access_price_moderation.sql</code> in the Supabase SQL editor.</span>
        </div>
      )}
      {error && <div className={ui.alertError}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {error}</div>}

      {view === 'log' ? (
        <PriceReportLog />
      ) : !rows ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" aria-label="Loading" /></div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" aria-hidden /> Oldest first · Data as of {formatWat(loadedAt)} WAT
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={load} className={cx(ui.btn, ui.btnSm, ui.btnSoft)}><RefreshCw className="w-3.5 h-3.5" aria-hidden /> Refresh</button>
              <button type="button" onClick={exportQueue} disabled={!rows.length} className={cx(ui.btn, ui.btnSm, ui.btnSecondary)}>Excel ({rows.length})</button>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className={cx(ui.card, 'p-10 text-center')}>
              <CheckCircle2 className="w-10 h-10 mx-auto text-success" aria-hidden />
              <p className="mt-3 font-semibold text-fg">Nothing waiting for review</p>
              <p className={ui.body}>Unusual prices, impossible journeys and reports from suspended people appear here.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((r) => {
                const why = r.reasons.filter((x) => x !== 'fresh_bonus');
                const diff = r.current_price ? Math.round(((r.price - r.current_price) / r.current_price) * 100) : null;
                const pending = r.applied === false;
                return (
                  <li key={r.id} className={cx(ui.card, 'p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4 animate-in fade-in duration-200')}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-fg">{r.station_name || 'Station'}</p>
                        <span className={cx('rounded-full border px-2 py-0.5 text-xs font-semibold',
                          pending ? 'bg-warning-soft text-on-warning-soft border-warning-line' : 'bg-surface-2 text-fg-muted border-line')}>
                          {pending ? 'Not yet live' : 'Already on map (older rules)'}
                        </span>
                      </div>
                      <p className="text-xs text-fg-muted mt-0.5 inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" aria-hidden /> {[r.lga, r.state].filter(Boolean).join(', ') || 'LGA not assigned'}
                        {r.station_lat !== null && r.station_lng !== null && (
                          <a className={cx(ui.link, 'ml-1 inline-flex items-center gap-0.5')} target="_blank" rel="noopener noreferrer"
                             href={`https://www.google.com/maps/search/?api=1&query=${r.station_lat},${r.station_lng}`}>
                            map <ExternalLink className="w-3 h-3" aria-hidden />
                          </a>
                        )}
                      </p>

                      <div className="mt-3 grid grid-cols-3 gap-2 max-w-md">
                        <Figure label="Reported" value={naira(r.price)} strong />
                        <Figure label="On map now" value={r.current_price ? naira(r.current_price) : '—'} sub={diff !== null ? `${diff > 0 ? '+' : ''}${diff}%` : undefined} />
                        <Figure label="Nearby median" value={r.ref_median ? naira(r.ref_median) : '—'} />
                      </div>

                      <p className="text-xs text-fg-muted mt-3">
                        {r.display_name || r.email || r.user_id.slice(0, 8)}
                        {r.email && r.display_name && <> · {r.email}</>}
                        {r.strikes > 0 && <> · <span className="text-danger font-semibold">{r.strikes} strike{r.strikes > 1 ? 's' : ''}</span></>}
                        {' '}· {formatWat(r.created_at)}
                        {r.distance_m !== null && <> · {r.distance_m.toLocaleString('en-NG')} m away</>}
                        {r.gps_accuracy_m !== null && <> · GPS ±{Math.round(r.gps_accuracy_m)} m</>}
                        {r.queue_status && <> · Queue: {queueLabel(r.queue_status)}</>}
                        {' '}· {r.coins} coins if approved
                      </p>
                      {why.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {why.map((x) => (
                            <span key={x} className="rounded-full border border-warning-line bg-warning-soft text-on-warning-soft px-2 py-0.5 text-xs font-medium">{reasonText(x)}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button type="button" disabled={busyId === r.id} onClick={() => decide(r, true)} className={cx(ui.btn, ui.btnSm, ui.btnSuccess)}>
                        {busyId === r.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CheckCircle2 className="w-4 h-4" aria-hidden />}
                        {pending ? 'Approve & publish' : 'Approve'}
                      </button>
                      <button type="button" disabled={busyId === r.id} onClick={() => decide(r, false)} className={cx(ui.btn, ui.btnSm, ui.btnDanger)}>
                        <X className="w-4 h-4" aria-hidden /> Reject
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Figure({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-2 border border-line px-2.5 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className={cx('tabular text-sm', strong ? 'font-bold text-fg' : 'font-semibold text-fg-muted')}>
        {value}{sub && <span className="ml-1 text-xs font-medium text-fg-subtle">{sub}</span>}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full price-report log (every community/owner report with outcome)
// ---------------------------------------------------------------------------
export function PriceReportLog({ initialFrom, initialTo, initialStatus }: { initialFrom?: string; initialTo?: string; initialStatus?: string }) {
  const [from, setFrom] = useState(initialFrom ?? isoDate(new Date(lagosToday().getTime() - 29 * 86400000)));
  const [to, setTo] = useState(initialTo ?? isoDate(lagosToday()));
  const [status, setStatus] = useState(initialStatus ?? 'all');
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchAllRows<LogRow>((a, b) =>
      supabase.rpc('admin_report_rows', { p_from: from || null, p_to: to || null, p_status: status === 'all' ? null : status, p_lga_id: null }).range(a, b),
    );
    if (res.error) setError(isMissingFunction(res.error) ? 'Run the 20261014 database update to enable this report.' : res.error.message);
    setRows(res.rows);
    setLoadedAt(new Date());
    setLoading(false);
  }, [from, to, status]);
  useEffect(() => { load(); }, [load]);

  const columns = useMemo<ReportColumn<LogRow>[]>(() => [
    { key: 'created_at', header: 'Reported at', get: (r) => r.created_at, type: 'datetime' },
    { key: 'station', header: 'Station', get: (r) => r.station_name, width: 30 },
    { key: 'lga', header: 'LGA', get: (r) => r.lga },
    { key: 'state', header: 'State', get: (r) => r.state },
    { key: 'price', header: 'Price (₦)', get: (r) => r.price, type: 'money', align: 'right' },
    { key: 'median', header: 'Nearby median (₦)', get: (r) => r.ref_median, type: 'money', align: 'right', defaultVisible: false },
    { key: 'queue', header: 'Queue', get: (r) => (r.queue_status ? queueLabel(r.queue_status) : null), defaultVisible: false },
    {
      key: 'status', header: 'Outcome', get: (r) => STATUS_TEXT[r.status] ?? r.status,
      render: (r) => (
        <span className={cx('inline-flex rounded-full border px-2 py-0.5 font-semibold whitespace-nowrap',
          r.status === 'accepted' ? 'bg-success-soft text-on-success-soft border-success-line'
            : r.status === 'held' ? 'bg-warning-soft text-on-warning-soft border-warning-line'
            : r.status === 'rejected' ? 'bg-danger-soft text-on-danger-soft border-danger-line'
            : 'bg-surface-2 text-fg-muted border-line')}>
          {STATUS_TEXT[r.status] ?? r.status}
        </span>
      ),
    },
    { key: 'live', header: 'On map', get: (r) => r.live_on_map },
    { key: 'coins', header: 'Coins', get: (r) => r.coins, type: 'integer', align: 'right' },
    { key: 'reporter', header: 'Reporter', get: (r) => r.display_name },
    { key: 'email', header: 'Reporter email', get: (r) => r.email, width: 28 },
    { key: 'reasons', header: 'Checks / reasons', get: (r) => (r.reasons ? r.reasons.split(', ').filter((x) => x !== 'fresh_bonus').map(reasonText).join('; ') : null), defaultVisible: false, width: 45 },
    { key: 'distance', header: 'Distance (m)', get: (r) => r.distance_m, type: 'integer', align: 'right', defaultVisible: false },
    { key: 'gps', header: 'GPS accuracy (m)', get: (r) => (r.gps_accuracy_m === null ? null : Math.round(r.gps_accuracy_m)), type: 'integer', align: 'right', defaultVisible: false },
    { key: 'reviewed_at', header: 'Reviewed at', get: (r) => r.reviewed_at, type: 'datetime', defaultVisible: false },
    { key: 'reviewer', header: 'Reviewed by', get: (r) => r.reviewer_email, defaultVisible: false },
    { key: 'note', header: 'Review note', get: (r) => r.review_note, defaultVisible: false, width: 40 },
    { key: 'day', header: 'Lagos day', get: (r) => r.lagos_day, type: 'date', defaultVisible: false },
    { key: 'id', header: 'Report ID', get: (r) => r.id, type: 'integer', defaultVisible: false },
    { key: 'station_id', header: 'Station ID', get: (r) => r.station_id, defaultVisible: false },
  ], []);

  const inputCls = 'h-10 px-3 rounded-full bg-surface-2 border border-line text-xs font-semibold text-fg outline-none focus:border-primary';
  const thisMonth = monthRange(0);

  return (
    <div className="flex flex-col gap-3">
      {error && <div className={ui.alertError}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {error}</div>}
      <ReportTable
        id="admin-price-report-log"
        title="Price reports"
        rows={rows}
        columns={columns}
        rowKey={(r) => String(r.id)}
        loading={loading}
        loadedAt={loadedAt}
        onRefresh={load}
        meta={[`Period: ${from || 'start'} to ${to || 'today'}`, status !== 'all' ? `Outcome: ${STATUS_TEXT[status] ?? status}` : '']}
        searchPlaceholder="Search station, LGA, reporter…"
        initialSort={{ key: 'created_at', dir: 'desc' }}
        emptyText="No price reports in this period."
        toolbar={
          <>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={inputCls} aria-label="From" />
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputCls} aria-label="To" />
            <button type="button" className={cx(ui.btn, ui.btnGhost, 'h-10 px-3 text-xs')} onClick={() => { setFrom(thisMonth.start); setTo(isoDate(lagosToday())); }}>This month</button>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls} aria-label="Outcome">
              <option value="all">All outcomes</option>
              {Object.entries(STATUS_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </>
        }
      />
    </div>
  );
}

