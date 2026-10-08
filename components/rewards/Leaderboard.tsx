"use client";

// Public leaderboard: national or per LGA, this/last month or this/last year.
// Names are masked by the database ("Chinedu O."); the signed-in person's row is highlighted.
import { useEffect, useMemo, useState } from 'react';
import { Trophy, Medal, CheckCircle2, Loader2, MapPin } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { ui, cx } from '@/lib/ui';
import { monthRange, yearRange, type RewardSettings } from '@/lib/rewards';
import { useLgaList } from './hooks';

type PeriodKey = 'm0' | 'm1' | 'y0' | 'y1';
interface Row { rank: number; display_name: string; coins: number; active_days: number; stations: number; verified: boolean; is_me: boolean }

function periodFor(key: PeriodKey) {
  if (key === 'm0') return { ...monthRange(0), kind: 'month' as const };
  if (key === 'm1') return { ...monthRange(-1), kind: 'month' as const };
  if (key === 'y0') return { ...yearRange(0), kind: 'year' as const };
  return { ...yearRange(-1), kind: 'year' as const };
}

export function Leaderboard({ settings, initialLgaId = null, limit = 20 }: { settings: RewardSettings; initialLgaId?: number | null; limit?: number }) {
  const [supabase] = useState(() => createClient());
  const lgas = useLgaList();
  const [period, setPeriod] = useState<PeriodKey>('m0');
  const [lgaId, setLgaId] = useState<number | null>(initialLgaId);
  const [stateName, setStateName] = useState<string>('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const states = useMemo(() => Array.from(new Set(lgas.map(l => l.state))), [lgas]);
  const lgasInState = useMemo(() => lgas.filter(l => l.state === stateName), [lgas, stateName]);
  const selectedLga = useMemo(() => lgas.find(l => l.id === lgaId) || null, [lgas, lgaId]);

  // When we arrive with ?lga=ID, pre-select its state once the list loads
  useEffect(() => {
    if (selectedLga && !stateName) setStateName(selectedLga.state);
  }, [selectedLga, stateName]);

  const p = periodFor(period);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    supabase.rpc('reward_leaderboard', { p_start: p.start, p_end: p.end, p_lga_id: lgaId, p_limit: limit }).then(({ data, error }) => {
      if (!alive) return;
      setFailed(!!error);
      setRows(((data || []) as Row[]).map(r => ({ ...r, rank: Number(r.rank), coins: Number(r.coins), active_days: Number(r.active_days), stations: Number(r.stations) })));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [supabase, p.start, p.end, lgaId, limit]);

  const minDays = p.kind === 'month' ? settings.min_active_days : settings.annual_min_active_days;
  const scopeLabel = selectedLga ? `${selectedLga.name}, ${selectedLga.state}` : 'All of Nigeria';

  const tab = (key: PeriodKey, label: string) => (
    <button
      key={key}
      type="button"
      role="tab"
      aria-selected={period === key}
      onClick={() => setPeriod(key)}
      className={cx('h-9 px-3.5 rounded-full text-sm font-semibold transition-colors whitespace-nowrap',
        period === key ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg hover:bg-surface-2')}
    >
      {label}
    </button>
  );

  return (
    <div className={cx(ui.card, 'p-4 sm:p-6')}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className={cx(ui.h2, 'flex items-center gap-2')}><Trophy className="w-5 h-5 text-warning" aria-hidden /> Leaderboard</h2>
            <p className="text-sm text-fg-muted mt-0.5 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" aria-hidden /> {scopeLabel} · {p.label}</p>
          </div>
          <div role="tablist" aria-label="Period" className="flex gap-1 overflow-x-auto rounded-full bg-surface-2 border border-line p-1">
            {tab('m0', 'This month')}{tab('m1', 'Last month')}{tab('y0', 'This year')}{tab('y1', 'Last year')}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="lb-state" className={ui.label}>State</label>
            <select
              id="lb-state"
              className={ui.select}
              value={stateName}
              onChange={e => { setStateName(e.target.value); setLgaId(null); }}
              disabled={lgas.length === 0}
            >
              <option value="">All of Nigeria</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="lb-lga" className={ui.label}>Local government area</label>
            <select
              id="lb-lga"
              className={ui.select}
              value={lgaId ?? ''}
              onChange={e => setLgaId(e.target.value ? Number(e.target.value) : null)}
              disabled={!stateName}
            >
              <option value="">{stateName ? `All LGAs in ${stateName}` : 'Choose a state first'}</option>
              {lgasInState.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {stateName && !lgaId && <p className={ui.hint}>Prizes are per LGA. Pick one to see who is leading there.</p>}
          </div>
        </div>

        {stateName && !lgaId ? (
          <p className="text-sm text-fg-muted">Choose an LGA in {stateName} to see its leaderboard.</p>
        ) : loading ? (
          <div className="flex items-center justify-center py-10 text-fg-muted"><Loader2 className="w-6 h-6 animate-spin" aria-label="Loading" /></div>
        ) : failed ? (
          <p className={cx(ui.alertWarning)}>The leaderboard is not available yet. Please check back soon.</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-10">
            <Trophy className="w-10 h-10 mx-auto text-fg-subtle" aria-hidden />
            <p className="mt-3 font-semibold text-fg">No coins earned here yet</p>
            <p className="text-sm text-fg-muted mt-1">Be the first: update a price at a station in this area.</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-fg-subtle border-b border-line">
                  <th className="py-2 pl-4 sm:pl-2 pr-2 w-12">#</th>
                  <th className="py-2 pr-2">Updater</th>
                  <th className="py-2 pr-2 text-right">Coins</th>
                  <th className="py-2 pr-2 text-right hidden sm:table-cell">Stations</th>
                  <th className="py-2 pr-4 sm:pr-2 text-right">Active days</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const qualifies = r.active_days >= minDays;
                  return (
                    <tr key={`${r.rank}-${r.display_name}`} className={cx('border-b border-line last:border-0', r.is_me && 'bg-primary/10')}>
                      <td className="py-2.5 pl-4 sm:pl-2 pr-2 font-bold tabular">
                        {r.rank <= 3 ? (
                          <Medal className={cx('w-5 h-5', r.rank === 1 ? 'text-amber-500' : r.rank === 2 ? 'text-slate-400' : 'text-orange-600')} aria-label={`Rank ${r.rank}`} />
                        ) : r.rank}
                      </td>
                      <td className="py-2.5 pr-2">
                        <span className="font-semibold text-fg">{r.display_name}</span>
                        {r.is_me && <span className="ml-2 rounded-full bg-primary text-on-primary text-xs font-bold px-2 py-0.5">You</span>}
                        {r.verified && <CheckCircle2 className="inline w-4 h-4 ml-1.5 text-success align-[-3px]" aria-label="Verified participant" />}
                      </td>
                      <td className="py-2.5 pr-2 text-right font-bold tabular text-fg">{r.coins.toLocaleString('en-NG')}</td>
                      <td className="py-2.5 pr-2 text-right tabular text-fg-muted hidden sm:table-cell">{r.stations}</td>
                      <td className="py-2.5 pr-4 sm:pr-2 text-right tabular">
                        <span className={qualifies ? 'text-success font-semibold' : 'text-fg-muted'}>{r.active_days}/{minDays}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-fg-subtle leading-relaxed">
          Live, unofficial standings. Winners are confirmed after the period closes and checks are complete. To win you need at least {minDays} active days
          {p.kind === 'month' ? ' in the month' : ' in the year'}, a verified ID, phone and bank account. <CheckCircle2 className="inline w-3.5 h-3.5 text-success align-[-2px]" aria-hidden /> = verified.
        </p>
      </div>
    </div>
  );
}

