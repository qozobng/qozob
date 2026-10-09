"use client";

// =========================================================================
// ADMIN · REWARDS DRILL-DOWNS
// Every KPI card on Rewards → Overview opens the rows behind the number,
// with a period picker, column picker and Excel download.
// =========================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { cx, ui } from '@/lib/ui';
import { ID_TYPES, isoDate, lagosToday, monthRange } from '@/lib/rewards';
import { fetchAllRows, isMissingFunction } from '@/lib/fetchAll';
import { DrillDownModal, ReportTable, type ReportColumn } from './ReportTable';
import { PriceReportLog, PriceReviews } from './PriceReviews';

const supabase = createClient();

export type DrillKind = 'updates' | 'coins' | 'contributors' | 'lgas' | 'held' | 'kyc';

const TITLES: Record<DrillKind, { title: string; subtitle: string }> = {
  updates: { title: 'Rewarded updates', subtitle: 'Every price report that earned coins in the period.' },
  coins: { title: 'Coins earned', subtitle: 'Coins per contributor, with their checks and payout details.' },
  contributors: { title: 'Contributors', subtitle: 'Everyone who reported prices in the period.' },
  lgas: { title: 'Active LGAs', subtitle: 'Activity per LGA, quorum status and current leader.' },
  held: { title: 'Held for review', subtitle: 'Prices waiting for an admin. They are not on the map yet.' },
  kyc: { title: 'People & ID checks', subtitle: 'Reward participants and their verification status.' },
};

const monthEnd = (start: string) => {
  const d = new Date(start + 'T00:00:00Z');
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  const today = lagosToday();
  return isoDate(end > today ? today : end);
};

export function RewardDrillDown({ kind, onClose, onChanged }: { kind: DrillKind | null; onClose: () => void; onChanged?: () => void }) {
  if (!kind) return null;
  const t = TITLES[kind];
  const m = monthRange(0);
  return (
    <DrillDownModal open onClose={onClose} title={t.title} subtitle={t.subtitle}>
      {kind === 'updates' && <PriceReportLog initialFrom={m.start} initialTo={isoDate(lagosToday())} initialStatus="accepted" />}
      {(kind === 'coins' || kind === 'contributors') && <ContributorsReport sortBy={kind === 'coins' ? 'coins' : 'reports'} />}
      {kind === 'lgas' && <LgaReport />}
      {kind === 'held' && <PriceReviews compact onChanged={onChanged} />}
      {kind === 'kyc' && <PeopleReport />}
    </DrillDownModal>
  );
}

// ---------------------------------------------------------------- shared month picker
function useMonth() {
  const [month, setMonth] = useState(monthRange(0).start.slice(0, 7));
  const from = `${month}-01`;
  const to = monthEnd(from);
  const label = new Date(from + 'T00:00:00Z').toLocaleDateString('en-NG', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const picker = (
    <input
      type="month"
      value={month}
      max={monthRange(0).start.slice(0, 7)}
      onChange={(e) => e.target.value && setMonth(e.target.value)}
      className="h-10 px-3 rounded-full bg-surface-2 border border-line text-xs font-semibold text-fg outline-none focus:border-primary"
      aria-label="Month"
    />
  );
  return { from, to, label, picker };
}

function DeployNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className={cx(ui.alertWarning, 'mb-3')}>
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
      <span>{error}</span>
    </div>
  );
}

const errMsg = (e: { message: string; code?: string } | null) =>
  !e ? null : isMissingFunction(e) ? 'This report needs the latest database update (20261014). Run it in the Supabase SQL editor.' : e.message;

// ---------------------------------------------------------------- contributors / coins
interface Contributor {
  user_id: string; email: string | null; display_name: string | null; legal_name: string | null; participant_status: string;
  verified: boolean; phone_ok: boolean; bank_on_file: boolean; payout_preference: string; excluded: boolean;
  reports: number; accepted: number; held: number; rejected: number; no_reward: number;
  coins: number; coins_held: number; stations: number; active_days: number; lgas: string | null; last_report_at: string | null;
}

function ContributorsReport({ sortBy }: { sortBy: 'coins' | 'reports' }) {
  const { from, to, label, picker } = useMonth();
  const [rows, setRows] = useState<Contributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchAllRows<Contributor>((a, b) => supabase.rpc('admin_reward_contributors', { p_from: from, p_to: to }).range(a, b));
    setError(errMsg(res.error));
    setRows(res.rows.map((r) => ({ ...r, coins: Number(r.coins), coins_held: Number(r.coins_held), reports: Number(r.reports), accepted: Number(r.accepted) })));
    setLoadedAt(new Date());
    setLoading(false);
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  const columns = useMemo<ReportColumn<Contributor>[]>(() => [
    { key: 'name', header: 'Name', get: (r) => r.legal_name || r.display_name },
    { key: 'email', header: 'Email', get: (r) => r.email, width: 28 },
    { key: 'coins', header: 'Coins', get: (r) => r.coins, type: 'integer', align: 'right' },
    { key: 'accepted', header: 'Rewarded updates', get: (r) => r.accepted, type: 'integer', align: 'right' },
    { key: 'reports', header: 'All reports', get: (r) => r.reports, type: 'integer', align: 'right' },
    { key: 'active_days', header: 'Active days', get: (r) => r.active_days, type: 'integer', align: 'right' },
    { key: 'stations', header: 'Stations', get: (r) => r.stations, type: 'integer', align: 'right' },
    { key: 'lgas', header: 'LGAs', get: (r) => r.lgas, width: 40 },
    { key: 'status', header: 'Verification', get: (r) => r.participant_status.replace(/_/g, ' ') },
    { key: 'held', header: 'Held', get: (r) => r.held, type: 'integer', align: 'right', defaultVisible: false },
    { key: 'coins_held', header: 'Coins held', get: (r) => r.coins_held, type: 'integer', align: 'right', defaultVisible: false },
    { key: 'rejected', header: 'Rejected', get: (r) => r.rejected, type: 'integer', align: 'right', defaultVisible: false },
    { key: 'no_reward', header: 'No coins', get: (r) => r.no_reward, type: 'integer', align: 'right', defaultVisible: false },
    { key: 'verified', header: 'Fully verified', get: (r) => r.verified, type: 'boolean', defaultVisible: false },
    { key: 'phone', header: 'Phone verified', get: (r) => r.phone_ok, type: 'boolean', defaultVisible: false },
    { key: 'bank', header: 'Bank on file', get: (r) => r.bank_on_file, type: 'boolean', defaultVisible: false },
    { key: 'payout', header: 'Payout choice', get: (r) => (r.payout_preference === 'voucher' ? 'Service voucher' : 'Cash'), defaultVisible: false },
    { key: 'excluded', header: 'Excluded', get: (r) => r.excluded, type: 'boolean', defaultVisible: false },
    { key: 'last', header: 'Last report', get: (r) => r.last_report_at, type: 'datetime', defaultVisible: false },
    { key: 'user_id', header: 'User ID', get: (r) => r.user_id, defaultVisible: false },
  ], []);

  return (
    <>
      <DeployNote error={error} />
      <ReportTable id={`reward-contributors-${sortBy}`} title={sortBy === 'coins' ? 'Coins by contributor' : 'Contributors'} rows={rows} columns={columns}
        rowKey={(r) => r.user_id} loading={loading} loadedAt={loadedAt} onRefresh={load} meta={[`Period: ${label} (${from} to ${to})`]}
        initialSort={{ key: sortBy === 'coins' ? 'coins' : 'reports', dir: 'desc' }} toolbar={picker} bare
        searchPlaceholder="Search name, email, LGA…" emptyText="No price reports in this month." />
    </>
  );
}

// ---------------------------------------------------------------- LGAs
interface LgaRow {
  lga_id: number; lga: string | null; state: string | null; updates: number; all_reports: number; stations: number; contributors: number;
  coins: number; held: number; quorum_met: boolean; in_scope: boolean; leader_name: string | null; leader_email: string | null; leader_coins: number | null;
}

function LgaReport() {
  const { from, to, label, picker } = useMonth();
  const [rows, setRows] = useState<LgaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchAllRows<LgaRow>((a, b) => supabase.rpc('admin_reward_lga_summary', { p_from: from, p_to: to }).range(a, b));
    setError(errMsg(res.error));
    setRows(res.rows.map((r) => ({ ...r, coins: Number(r.coins), updates: Number(r.updates) })));
    setLoadedAt(new Date());
    setLoading(false);
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  const qualifying = rows.filter((r) => r.quorum_met && r.in_scope).length;
  const columns = useMemo<ReportColumn<LgaRow>[]>(() => [
    { key: 'lga', header: 'LGA', get: (r) => r.lga },
    { key: 'state', header: 'State', get: (r) => r.state },
    { key: 'updates', header: 'Rewarded updates', get: (r) => r.updates, type: 'integer', align: 'right' },
    { key: 'stations', header: 'Stations', get: (r) => r.stations, type: 'integer', align: 'right' },
    { key: 'contributors', header: 'Contributors', get: (r) => r.contributors, type: 'integer', align: 'right' },
    { key: 'coins', header: 'Coins', get: (r) => r.coins, type: 'integer', align: 'right' },
    {
      key: 'quorum', header: 'Prize eligible', get: (r) => (r.quorum_met && r.in_scope ? 'Yes' : !r.in_scope ? 'Not in payout scope' : 'Below quorum'),
      render: (r) => (
        <span className={cx('inline-flex rounded-full border px-2 py-0.5 font-semibold whitespace-nowrap',
          r.quorum_met && r.in_scope ? 'bg-success-soft text-on-success-soft border-success-line' : 'bg-surface-2 text-fg-muted border-line')}>
          {r.quorum_met && r.in_scope ? 'Yes' : !r.in_scope ? 'Not in scope' : 'Below quorum'}
        </span>
      ),
    },
    { key: 'leader', header: 'Current leader', get: (r) => r.leader_name },
    { key: 'leader_coins', header: 'Leader coins', get: (r) => r.leader_coins, type: 'integer', align: 'right' },
    { key: 'leader_email', header: 'Leader email', get: (r) => r.leader_email, defaultVisible: false, width: 28 },
    { key: 'held', header: 'Held', get: (r) => r.held, type: 'integer', align: 'right', defaultVisible: false },
    { key: 'all', header: 'All reports', get: (r) => r.all_reports, type: 'integer', align: 'right', defaultVisible: false },
    { key: 'id', header: 'LGA ID', get: (r) => r.lga_id, type: 'integer', defaultVisible: false },
  ], []);

  return (
    <>
      <DeployNote error={error} />
      {!error && !loading && (
        <p className="text-sm text-fg-muted mb-3">
          <strong className="text-fg">{rows.length}</strong> active LGA{rows.length === 1 ? '' : 's'} in {label};{' '}
          <strong className="text-fg">{qualifying}</strong> currently meet{qualifying === 1 ? 's' : ''} the prize quorum.
        </p>
      )}
      <ReportTable id="reward-lgas" title="LGA activity" rows={rows} columns={columns} rowKey={(r) => String(r.lga_id)}
        loading={loading} loadedAt={loadedAt} onRefresh={load} meta={[`Period: ${label} (${from} to ${to})`, `Prize-eligible LGAs: ${qualifying}`]}
        initialSort={{ key: 'coins', dir: 'desc' }} toolbar={picker} bare searchPlaceholder="Search LGA, state, leader…"
        emptyText="No LGA activity in this month." />
    </>
  );
}

// ---------------------------------------------------------------- people / ID checks
interface Person {
  user_id: string; email: string; display_name: string; legal_name: string | null; status: string; id_type: string | null; id_last4: string | null;
  dob: string | null; phone: string | null; phone_ok: boolean; bank_name: string | null; account_name: string | null; account_last4: string | null;
  strikes: number; excluded: boolean; coins_month: number; submitted_at: string | null; review_note: string | null;
}
const PERSON_STATUS: Record<string, string> = {
  verified: 'Verified', pending_review: 'Needs review', rejected: 'Rejected', suspended: 'Suspended', incomplete: 'Not submitted',
};

export const PERSON_COLUMNS: ReportColumn<Person>[] = [
  { key: 'name', header: 'Legal name', get: (r) => r.legal_name || r.display_name },
  { key: 'email', header: 'Email', get: (r) => r.email, width: 28 },
  { key: 'status', header: 'Verification', get: (r) => PERSON_STATUS[r.status] ?? r.status },
  { key: 'submitted', header: 'ID submitted', get: (r) => r.submitted_at, type: 'datetime' },
  { key: 'id_type', header: 'ID type', get: (r) => (r.id_type ? ID_TYPES.find((t) => t.value === r.id_type)?.label ?? r.id_type : null) },
  { key: 'id_last4', header: 'ID (last 4)', get: (r) => (r.id_last4 ? `····${r.id_last4}` : null), defaultVisible: false },
  { key: 'phone_ok', header: 'Phone verified', get: (r) => r.phone_ok, type: 'boolean' },
  { key: 'bank', header: 'Bank', get: (r) => r.bank_name, defaultVisible: false },
  { key: 'account', header: 'Account (masked)', get: (r) => (r.account_last4 ? `${r.account_name ?? ''} ····${r.account_last4}`.trim() : null), defaultVisible: false },
  { key: 'coins', header: 'Coins this month', get: (r) => Number(r.coins_month), type: 'integer', align: 'right' },
  { key: 'strikes', header: 'Strikes', get: (r) => r.strikes, type: 'integer', align: 'right' },
  { key: 'excluded', header: 'Excluded', get: (r) => r.excluded, type: 'boolean', defaultVisible: false },
  { key: 'dob', header: 'Date of birth', get: (r) => r.dob, type: 'date', defaultVisible: false },
  { key: 'note', header: 'Review note', get: (r) => r.review_note, defaultVisible: false, width: 40 },
  { key: 'user_id', header: 'User ID', get: (r) => r.user_id, defaultVisible: false },
];

function PeopleReport() {
  const [rows, setRows] = useState<Person[]>([]);
  const [status, setStatus] = useState('pending_review');
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchAllRows<Person>((a, b) => supabase.rpc('admin_reward_people').range(a, b));
    setError(res.error ? res.error.message : null);
    setRows(res.rows);
    setLoadedAt(new Date());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => (status === 'all' ? rows : rows.filter((r) => r.status === status)), [rows, status]);
  return (
    <>
      <DeployNote error={error} />
      <ReportTable id="reward-people-drill" title="Reward participants" rows={shown} columns={PERSON_COLUMNS} rowKey={(r) => r.user_id}
        loading={loading} loadedAt={loadedAt} onRefresh={load} bare initialSort={{ key: 'submitted', dir: 'asc' }}
        meta={[status !== 'all' ? `Verification: ${PERSON_STATUS[status] ?? status}` : '']}
        searchPlaceholder="Search name or email…" emptyText="Nobody in this group."
        toolbar={
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Verification status"
            className="h-10 px-3 rounded-full bg-surface-2 border border-line text-xs font-semibold text-fg outline-none focus:border-primary">
            <option value="all">Everyone</option>
            {Object.entries(PERSON_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        } />
      <p className={cx(ui.hint, 'mt-2')}>Approve or reject IDs in Rewards → People. Full account numbers are never exported here.</p>
    </>
  );
}

