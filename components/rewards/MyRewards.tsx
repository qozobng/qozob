"use client";

// =========================================================================
// "My rewards" (user dashboard tab): coins, LGA ranks, verification steps
// (phone OTP, ID, bank account), wins and recent updates.
// Every rule is enforced by the database; this screen only collects and explains.
// =========================================================================
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  Coins, Trophy, CalendarCheck, Hourglass, Smartphone, ShieldCheck, Landmark, CheckCircle2, Circle, Loader2,
  AlertTriangle, ChevronDown, ChevronUp, MapPin, Trash2, Lock, Ban, ArrowUpRight,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { StatCard } from '@/components/analytics/StatCard';
import { ui, cx } from '@/lib/ui';
import { ID_TYPES, ID_TYPES_INTL, NIGERIAN_BANKS, REASON_TEXT, money } from '@/lib/rewards';
import { useRewardSettings } from './hooks';
import { SITE } from '@/lib/site';

interface Summary {
  coins_month: number; coins_year: number; coins_held: number; coins_total: number;
  active_days_month: number; active_days_year: number; reports_month: number;
  /** Person's country and its programme (20261105). Missing = older database = Nigeria. */
  country_code?: string | null;
  program?: null | { country_code: string; currency: string; active: boolean; monthly_prize: number; annual_prize: number | null;
                     voucher_enabled: boolean; voucher_bonus_pct: number; min_active_days: number; area_label: string; country_name: string };
  lgas: { lga_id: number | null; name: string | null; state: string | null; coins: number; rank: number; country_code?: string | null }[];
  excluded: boolean;
  participant: null | { status: 'incomplete' | 'pending_review' | 'verified' | 'rejected' | 'suspended'; legal_name: string | null; id_type: string | null; id_last4: string | null; review_note: string | null; strikes: number; submitted_at: string | null };
  phone_verified: boolean;
  phone: string | null;
  bank: null | { bank_name: string; account_name: string; last4: string };
  verified: boolean;
  wins: {
    kind: 'monthly' | 'annual'; period_start: string; lga: string | null; state: string | null; gross_ngn: number; net_ngn: number; status: string; paid_at: string | null;
    payout_type?: 'cash' | 'voucher' | null; voucher_code?: string | null; voucher_value_ngn?: number | null; voucher_redeemed_at?: string | null;
    currency?: string | null;
  }[];
}
interface ReportRow { id: number; station_id: string; price: number; status: string; coins: number; reasons: string[]; created_at: string; station_name?: string; currency?: string | null }

const STATUS_STYLE: Record<string, string> = {
  accepted: 'bg-success-soft text-on-success-soft border-success-line',
  held: 'bg-warning-soft text-on-warning-soft border-warning-line',
  rejected: 'bg-danger-soft text-on-danger-soft border-danger-line',
  no_reward: 'bg-surface-2 text-fg-muted border-line',
};
const STATUS_LABEL: Record<string, string> = { accepted: 'Coins earned', held: 'Under review (not live yet)', rejected: 'Rejected', no_reward: 'No coins' };

/** 0803 123 4567 / 234803... / +234803... → +2348031234567 (null if not a Nigerian mobile number). */
export function normaliseNgPhone(input: string): string | null {
  const d = input.replace(/\D/g, '');
  let local = '';
  if (d.startsWith('234')) local = d.slice(3);
  else if (d.startsWith('0')) local = d.slice(1);
  else local = d;
  if (!/^[789][01]\d{8}$/.test(local)) return null;
  return `+234${local}`;
}

/** Any international mobile number with country code → +XXXXXXXX (8–15 digits), else null. */
export function normaliseIntlPhone(input: string): string | null {
  const d = input.replace(/\D/g, '').replace(/^00/, '');
  return /^\d{8,15}$/.test(d) ? `+${d}` : null;
}

const errText = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Something went wrong. Please try again.');

export function MyRewards() {
  const [supabase] = useState(() => createClient());
  const { settings } = useRewardSettings();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [open, setOpen] = useState<'phone' | 'id' | 'bank' | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_reward_summary');
    if (error || !data) { setUnavailable(true); setLoading(false); return; }
    setSummary(data as Summary);
    const { data: rows } = await supabase.from('price_reports')
      .select('*')
      .order('created_at', { ascending: false }).limit(15);
    const list = (rows || []) as ReportRow[];
    const ids = Array.from(new Set(list.map(r => r.station_id)));
    if (ids.length) {
      const { data: st } = await supabase.from('stations').select('station_id, name').in('station_id', ids);
      const names = new Map((st || []).map((s: { station_id: string; name: string }) => [String(s.station_id), s.name]));
      list.forEach(r => { r.station_name = names.get(String(r.station_id)); });
    }
    setReports(list);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-primary" aria-label="Loading" /></div>;
  }

  if (unavailable || !summary) {
    return (
      <div className="max-w-3xl">
        <Header />
        <div className={cx(ui.alertWarning, 'mt-6')}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> Rewards are being set up. Please check back soon.</div>
      </div>
    );
  }

  if (summary.excluded) {
    return (
      <div className="max-w-3xl">
        <Header />
        <div className={cx(ui.card, 'p-6 mt-6 flex items-start gap-3')}>
          <Ban className="w-6 h-6 text-fg-muted shrink-0" aria-hidden />
          <div>
            <p className="font-semibold text-fg">This account cannot earn reward coins</p>
            <p className={cx(ui.body, 'mt-1')}>
              {SITE.name} staff, representatives and station owners or managers (and suspended accounts) are not eligible for Rewards. You can still update prices, and they still help everyone.
              If you think this is a mistake, email <a className={ui.link} href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const p = summary.participant;
  const idDone = p?.status === 'verified';
  const idPending = p?.status === 'pending_review';
  const suspended = p?.status === 'suspended';
  // Programme of the person's country (older database: the Nigeria settings)
  const hasRegions = 'program' in summary;
  const isNg = !summary.country_code || summary.country_code === 'NG';
  const prog = summary.program;
  const noProgramme = hasRegions && !prog;
  const cur = prog?.currency || 'NGN';
  const prize = prog ? prog.monthly_prize : settings.monthly_prize_ngn;
  const minDays = prog ? prog.min_active_days : settings.min_active_days;
  const programActive = prog ? prog.active : (hasRegions ? false : settings.program_active);
  const areaWord = prog?.area_label || 'LGA';
  const bestLga = summary.lgas.filter(l => l.lga_id !== null).sort((a, b) => a.rank - b.rank || b.coins - a.coins)[0];
  const daysPct = Math.min(100, Math.round((summary.active_days_month / Math.max(1, minDays)) * 100));
  const idLabel = (v: string | null | undefined) => [...ID_TYPES, ...ID_TYPES_INTL].find(t => t.value === v)?.label ?? 'ID';

  const steps = [
    { key: 'phone' as const, icon: Smartphone, title: 'Verify your phone number', done: summary.phone_verified, detail: summary.phone_verified ? (summary.phone ? `+${String(summary.phone).replace(/^\+/, '')}` : 'Verified') : 'We send a 6-digit code by SMS' },
    { key: 'id' as const, icon: ShieldCheck, title: 'Verify your identity', done: idDone, detail: idDone ? `${idLabel(p?.id_type)} ending ${p?.id_last4}` : idPending ? 'Submitted. We are reviewing it (usually within 2 working days)' : p?.status === 'rejected' ? `Not approved${p.review_note ? `: ${p.review_note}` : ''}. Please submit again.` : 'Government ID and date of birth (18+)' },
    { key: 'bank' as const, icon: Landmark, title: isNg ? 'Add your bank account' : 'Add your bank or mobile-money account', done: !!summary.bank, detail: summary.bank ? `${summary.bank.bank_name} ····${summary.bank.last4} (${summary.bank.account_name})` : 'Where we pay your prize (in your own name)' },
  ];

  return (
    <div className="max-w-5xl flex flex-col gap-6 animate-in fade-in duration-300">
      <Header areaWord={areaWord} />

      {noProgramme ? (
        <div className={ui.alertWarning}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> There is no rewards programme in your country yet. Your price updates still help drivers, and we&apos;ll announce prizes here when they start.</div>
      ) : !programActive && <div className={ui.alertWarning}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> The rewards programme is paused right now. Coins will start again when it resumes.</div>}
      {suspended && <div className={ui.alertError}><Ban className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> Your Rewards participation is suspended{p?.review_note ? `: ${p.review_note}` : ''}. Contact {SITE.contactEmail} if you think this is wrong.</div>}

      {/* STATS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Coins this month" value={summary.coins_month.toLocaleString('en')} subtitle={`${summary.coins_year.toLocaleString('en')} this year`} icon={Coins} colorTheme="amber" />
        <StatCard title={`Best ${areaWord} rank`} value={bestLga ? `#${bestLga.rank}` : '—'} subtitle={bestLga ? `${bestLga.name ?? `Unknown ${areaWord}`}` : 'Update a price to get ranked'} icon={Trophy} colorTheme="indigo" />
        <StatCard title="Active days" value={`${summary.active_days_month}/${minDays}`} subtitle={summary.active_days_month >= minDays ? 'Qualified this month' : `${minDays - summary.active_days_month} more day(s) to qualify`} icon={CalendarCheck} colorTheme="emerald" />
        <StatCard title="Under review" value={summary.coins_held.toLocaleString('en')} subtitle="Coins waiting for a reviewer" icon={Hourglass} colorTheme="blue" />
      </div>

      {/* ACTIVE DAYS PROGRESS */}
      <div className={cx(ui.card, 'p-5')}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-fg">Monthly qualification</p>
          <p className="text-sm tabular text-fg-muted">{summary.active_days_month} of {minDays} days</p>
        </div>
        <div className="mt-2 h-3 rounded-full bg-surface-3 overflow-hidden" role="progressbar" aria-valuenow={daysPct} aria-valuemin={0} aria-valuemax={100} aria-label="Active days this month">
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${daysPct}%` }} />
        </div>
        <p className={ui.hint}>
          A day counts when at least one of your updates earns coins.
          {!noProgramme && ` Prize: ${money(prize, cur)} for the top qualified updater in each ${areaWord}, paid by the 7th of next month.`}
        </p>
      </div>

      {/* VERIFICATION */}
      <div className={cx(ui.card, 'p-5 sm:p-6')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={ui.h2}>Get ready to be paid</h3>
          {summary.verified
            ? <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft text-on-success-soft border border-success-line px-3 py-1 text-xs font-bold"><CheckCircle2 className="w-4 h-4" aria-hidden /> Fully verified</span>
            : <span className="text-xs font-semibold text-fg-muted">{steps.filter(s => s.done).length} of 3 done</span>}
        </div>
        <p className={cx(ui.body, 'mt-1')}>You can collect coins without these, but you must finish all three before the month closes to win.</p>
        <ul className="mt-4 divide-y divide-line border border-line rounded-xl overflow-hidden">
          {steps.map(s => {
            const expanded = open === s.key;
            const locked = (s.key === 'id' && (idDone || suspended)) || suspended;
            return (
              <li key={s.key} className="bg-surface">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : s.key)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-surface-2 transition-colors"
                  aria-expanded={expanded}
                >
                  {s.done ? <CheckCircle2 className="w-6 h-6 text-success shrink-0" aria-label="Done" /> : <Circle className="w-6 h-6 text-fg-subtle shrink-0" aria-label="To do" />}
                  <s.icon className="w-5 h-5 text-fg-muted shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-fg">{s.title}</span>
                    <span className="block text-xs text-fg-muted mt-0.5 break-words">{s.detail}</span>
                  </span>
                  {expanded ? <ChevronUp className="w-4 h-4 text-fg-muted" aria-hidden /> : <ChevronDown className="w-4 h-4 text-fg-muted" aria-hidden />}
                </button>
                {expanded && (
                  <div className="px-4 pb-5 pt-1 border-t border-line bg-surface-2/50">
                    {locked ? (
                      <p className={cx(ui.body, 'pt-3 flex items-center gap-2')}><Lock className="w-4 h-4" aria-hidden /> {suspended ? 'Locked while your participation is suspended.' : 'Your ID has been verified. Contact support to change it.'}</p>
                    ) : s.key === 'phone' ? (
                      <PhoneStep currentPhone={summary.phone} verified={summary.phone_verified} isNg={isNg} onDone={() => { setOpen(null); load(); }} />
                    ) : s.key === 'id' ? (
                      <IdStep pending={idPending} isNg={isNg} onDone={() => { setOpen(null); load(); }} />
                    ) : (
                      <BankStep bank={summary.bank} isNg={isNg} country={summary.country_code ?? null} onDone={() => { setOpen(null); load(); }} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {!suspended && !noProgramme && <PayoutChoice />}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* AREA STANDINGS */}
        <div className={cx(ui.card, 'p-5 sm:p-6')}>
          <h3 className={ui.h2}>Your {areaWord === 'LGA' ? 'LGAs' : 'areas'} this month</h3>
          {summary.lgas.length === 0 ? (
            <p className={cx(ui.body, 'mt-3')}>No coins yet this month. Visit a station, turn on location and update its price on the <Link href="/" className={ui.link}>map</Link>.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {summary.lgas.map(l => (
                <li key={`${l.country_code ?? ''}-${l.lga_id}`} className="py-3 flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-fg truncate"><MapPin className="inline w-3.5 h-3.5 mr-1 text-fg-muted align-[-2px]" aria-hidden />{l.name ?? `Station without an ${areaWord} yet`}</span>
                    <span className="block text-xs text-fg-muted">{l.state ?? ''} · {Number(l.coins).toLocaleString('en')} coins</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-bold border', l.rank === 1 ? 'bg-amber-300 text-slate-900 border-amber-500/40' : 'bg-surface-2 text-fg border-line')}>#{l.rank}</span>
                    {l.lga_id !== null && <Link href={`/rewards?lga=${l.lga_id}`} className="text-fg-muted hover:text-fg" aria-label={`Open ${l.name} leaderboard`}><ArrowUpRight className="w-4 h-4" /></Link>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* WINS */}
        <div className={cx(ui.card, 'p-5 sm:p-6')}>
          <h3 className={ui.h2}>My prizes</h3>
          {summary.wins.length === 0 ? (
            <p className={cx(ui.body, 'mt-3')}>{noProgramme ? 'No prizes yet.' : `No prizes yet. Top your ${areaWord} this month to win ${money(prize, cur)}.`}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {summary.wins.map((w, i) => (
                <li key={i} className="py-3 flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-fg">{w.kind === 'annual' ? `Grand prize ${w.period_start.slice(0, 4)}` : `${new Date(w.period_start + 'T00:00:00Z').toLocaleDateString('en-NG', { month: 'long', year: 'numeric', timeZone: 'UTC' })}${w.lga ? ` · ${w.lga}` : ''}`}</span>
                    <span className="block text-xs text-fg-muted">
                      {w.payout_type === 'voucher'
                        ? `Service voucher worth ${money(w.voucher_value_ngn ?? w.gross_ngn, w.currency)}`
                        : `${money(w.net_ngn, w.currency)}${w.gross_ngn !== w.net_ngn ? ` after tax (${money(w.gross_ngn, w.currency)} prize)` : ''}`}
                    </span>
                    {w.payout_type === 'voucher' && w.voucher_code && (
                      <span className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-success-line bg-success-soft px-2 py-0.5 text-xs font-mono font-bold text-on-success-soft">
                        {w.voucher_code}{w.voucher_redeemed_at ? ' · used' : ''}
                      </span>
                    )}
                    {w.payout_type === 'voucher' && w.voucher_code && !w.voucher_redeemed_at && (
                      <Link href="/services" className="block mt-1 text-xs font-semibold text-primary hover:underline">Use it on Auto services →</Link>
                    )}
                  </span>
                  <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-bold border capitalize', w.status === 'paid' ? STATUS_STYLE.accepted : STATUS_STYLE.held)}>{w.status === 'paid' ? 'Paid' : w.status === 'approved' ? 'Approved' : 'Processing'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* RECENT UPDATES */}
      <div className={cx(ui.card, 'p-5 sm:p-6')}>
        <h3 className={ui.h2}>Recent price updates</h3>
        {reports.length === 0 ? (
          <p className={cx(ui.body, 'mt-3')}>Your rewarded updates will show here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {reports.map(r => {
              const why = (r.reasons || []).map(x => REASON_TEXT[x]).filter(Boolean);
              return (
                <li key={r.id} className="py-3 flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-fg truncate">{r.station_name ?? 'Station'} · {money(r.price, r.currency)}</span>
                    <span className="block text-xs text-fg-muted">{new Date(r.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    {why.length > 0 && <span className="block text-xs text-fg-muted mt-0.5">{why.join(' · ')}</span>}
                  </span>
                  <span className="flex flex-col items-end gap-1 shrink-0">
                    <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-bold border', STATUS_STYLE[r.status] ?? STATUS_STYLE.no_reward)}>{STATUS_LABEL[r.status] ?? r.status}</span>
                    {r.coins > 0 && <span className="text-xs font-bold tabular text-fg">+{r.coins}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Cash or auto-service voucher (worth more) for prizes won from now on. */
function PayoutChoice() {
  const [supabase] = useState(() => createClient());
  const [info, setInfo] = useState<{ preference: 'cash' | 'voucher'; monthly_prize_ngn: number; voucher_bonus_pct: number; voucher_value_ngn: number; currency?: string; voucher_available?: boolean } | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    supabase.rpc('my_payout_preference').then(({ data, error }) => {
      if (error || !data) { setMissing(true); return; }
      setInfo(data as typeof info);
    });
  }, [supabase]);

  // No programme / vouchers where the person lives: prizes are always cash, so there is nothing to choose
  if (missing || !info || info.voucher_available === false) return null;

  const choose = async (pref: 'cash' | 'voucher') => {
    if (pref === info.preference) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('set_payout_preference', { p_pref: pref });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: errText(error) });
    setInfo({ ...info, preference: pref });
    setMsg({ ok: true, text: pref === 'voucher' ? 'Saved. Future prizes will be issued as an auto-service voucher.' : 'Saved. Future prizes will be paid by bank transfer.' });
  };

  const option = (key: 'cash' | 'voucher', title: string, value: string, detail: string) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => choose(key)}
      aria-pressed={info.preference === key}
      className={cx('flex-1 text-left rounded-xl border p-4 transition-colors',
        info.preference === key ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-line hover:bg-surface-2')}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-fg">{title}</span>
        {info.preference === key ? <CheckCircle2 className="w-5 h-5 text-primary" aria-label="Selected" /> : <Circle className="w-5 h-5 text-fg-subtle" aria-hidden />}
      </span>
      <span className="block mt-1 text-lg font-bold tabular text-fg">{value}</span>
      <span className="block text-xs text-fg-muted mt-0.5">{detail}</span>
    </button>
  );

  return (
    <div className={cx(ui.card, 'p-5 sm:p-6')}>
      <h3 className={ui.h2}>How would you like to receive a prize?</h3>
      <p className={cx(ui.body, 'mt-1')}>Applies to prizes from months that have not closed yet. You can change it any time before the month closes.</p>
      <div className="mt-4 flex flex-col sm:flex-row gap-3">
        {option('cash', 'Cash', money(info.monthly_prize_ngn, info.currency), 'Bank transfer to your verified account (tax may apply).')}
        {option('voucher', 'Auto-service voucher', money(info.voucher_value_ngn, info.currency), `${info.voucher_bonus_pct}% extra value for vehicle papers, insurance or a tracker on Qozob Auto services.`)}
      </div>
      {msg && <p className={cx('mt-3 text-sm', msg.ok ? 'text-success' : 'text-danger')} role="status">{msg.text}</p>}
    </div>
  );
}

function Header({ areaWord = 'LGA' }: { areaWord?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-fg">My rewards</h2>
        <p className="text-fg-muted text-sm mt-1">Earn coins for checked price updates. Top your {areaWord} to win every month.</p>
      </div>
      <div className="flex gap-2">
        <Link href="/rewards" className={cx(ui.btn, ui.btnSm, ui.btnSecondary)}><Trophy className="w-4 h-4" aria-hidden /> Leaderboards</Link>
        <Link href="/rewards/rules" className={cx(ui.btn, ui.btnSm, ui.btnGhost)}>Rules</Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- PHONE (SMS OTP via Supabase Auth)
function PhoneStep({ currentPhone, verified, isNg, onDone }: { currentPhone: string | null; verified: boolean; isNg: boolean; onDone: () => void }) {
  const [supabase] = useState(() => createClient());
  const [phone, setPhone] = useState(currentPhone
    ? (isNg ? `0${String(currentPhone).replace(/^\+?234/, '')}` : `+${String(currentPhone).replace(/^\+/, '')}`)
    : '');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    setError('');
    const e164 = isNg ? normaliseNgPhone(phone) : normaliseIntlPhone(phone);
    if (!e164) return setError(isNg ? 'Enter a Nigerian mobile number, for example 0803 123 4567.' : 'Enter your mobile number with the country code, for example +233 24 123 4567.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ phone: e164 });
    setBusy(false);
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes('provider') || m.includes('sms') || m.includes('not enabled') || m.includes('unsupported')) {
        return setError(`SMS codes are not switched on yet. Email ${SITE.contactEmail} from your account email and we will verify your number manually.`);
      }
      if (m.includes('already') || m.includes('registered')) return setError('This number is already used by another account. Each person may use one number.');
      return setError(error.message);
    }
    setSentTo(e164);
  };

  const verify = async () => {
    if (!sentTo) return;
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone: sentTo, token: code.trim(), type: 'phone_change' });
    setBusy(false);
    if (error) return setError(error.message.toLowerCase().includes('expired') ? 'That code has expired. Send a new one.' : 'That code is not right. Check the SMS and try again.');
    onDone();
  };

  return (
    <div className="pt-3 space-y-3">
      {verified && <p className={ui.body}>Your number is verified. To change it, enter a new number and confirm the code we send.</p>}
      {!sentTo ? (
        <>
          <div>
            <label htmlFor="rw-phone" className={ui.label}>Mobile number</label>
            <input id="rw-phone" type="tel" inputMode="tel" autoComplete="tel" className={ui.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder={isNg ? '0803 123 4567' : '+233 24 123 4567'} />
            <p className={ui.hint}>We only use this to confirm it is really you and to contact you about prizes. No marketing SMS.</p>
          </div>
          <button type="button" onClick={send} disabled={busy} className={cx(ui.btn, ui.btnMd, ui.btnPrimary)}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : 'Send code'}</button>
        </>
      ) : (
        <>
          <div>
            <label htmlFor="rw-otp" className={ui.label}>Enter the 6-digit code sent to {sentTo}</label>
            <input id="rw-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={cx(ui.input, 'tracking-[0.4em] font-semibold max-w-[220px]')} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={verify} disabled={busy || code.length < 6} className={cx(ui.btn, ui.btnMd, ui.btnPrimary)}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : 'Verify'}</button>
            <button type="button" onClick={() => { setSentTo(null); setCode(''); }} className={cx(ui.btn, ui.btnMd, ui.btnGhost)}>Change number</button>
          </div>
        </>
      )}
      {error && <div className={ui.alertError}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- ID (KYC)
const MAX_DOC_BYTES = 5 * 1024 * 1024;
const DOC_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

function IdStep({ pending, isNg, onDone }: { pending: boolean; isNg: boolean; onDone: () => void }) {
  const [supabase] = useState(() => createClient());
  const idTypes: { value: string; label: string; hint: string }[] = isNg ? ID_TYPES : ID_TYPES_INTL;
  const [legalName, setLegalName] = useState('');
  const [dob, setDob] = useState('');
  const [idType, setIdType] = useState<string>(idTypes[0].value);
  const [idNumber, setIdNumber] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!file) return setError('Please add a clear photo or PDF of your ID.');
    const ext = DOC_TYPES[file.type];
    if (!ext) return setError('Use a JPG, PNG, WEBP or PDF file.');
    if (file.size > MAX_DOC_BYTES) return setError('The file is bigger than 5 MB. Please use a smaller photo.');
    if (idType === 'nin' && !/^\d{11}$/.test(idNumber.replace(/\D/g, ''))) return setError('A NIN has exactly 11 digits.');
    if (!accept) return setError('Please accept the Rewards Official Rules and Privacy Policy.');

    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return setError('Please sign in again.'); }
    const path = `${user.id}/${Date.now()}.${ext}`;
    const up = await supabase.storage.from('reward_kyc').upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) { setBusy(false); return setError(`Upload failed: ${up.error.message}`); }

    const { error } = await supabase.rpc('submit_reward_kyc', {
      p_legal_name: legalName, p_dob: dob || null, p_id_type: idType, p_id_number: idNumber, p_doc_path: path, p_accept_terms: accept,
    });
    if (error) {
      await supabase.storage.from('reward_kyc').remove([path]);   // don't leave an orphaned ID photo behind
      setBusy(false);
      return setError(errText(error));
    }
    setBusy(false);
    onDone();
  };

  const hint = idTypes.find(t => t.value === idType)?.hint;
  return (
    <form onSubmit={submit} className="pt-3 space-y-4">
      {pending && <div className={ui.alertWarning}><Hourglass className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> We already have your details and are reviewing them. Submitting again replaces them.</div>}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="rw-name" className={ui.label}>Full name (as on your ID)</label>
          <input id="rw-name" className={ui.input} value={legalName} onChange={e => setLegalName(e.target.value)} autoComplete="name" required minLength={3} />
        </div>
        <div>
          <label htmlFor="rw-dob" className={ui.label}>Date of birth</label>
          <input id="rw-dob" type="date" className={ui.input} value={dob} onChange={e => setDob(e.target.value)} required max={new Date().toISOString().slice(0, 10)} />
          <p className={ui.hint}>You must be 18 or older.</p>
        </div>
        <div>
          <label htmlFor="rw-idtype" className={ui.label}>ID type</label>
          <select id="rw-idtype" className={ui.select} value={idType} onChange={e => setIdType(e.target.value)}>
            {idTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="rw-idnum" className={ui.label}>ID number</label>
          <input id="rw-idnum" className={ui.input} value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder={hint} required autoComplete="off" />
          <p className={ui.hint}>We store only the last 4 characters and a one-way code to stop duplicate sign-ups.</p>
        </div>
      </div>
      <div>
        <label htmlFor="rw-doc" className={ui.label}>Photo or scan of the ID</label>
        <input id="rw-doc" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className={ui.file} onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <p className={ui.hint}>JPG, PNG, WEBP or PDF, up to 5 MB. Only our reviewers can see it, and it is deleted as soon as it has been reviewed.</p>
      </div>
      <label className="flex items-start gap-3 text-sm text-fg">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={accept} onChange={e => setAccept(e.target.checked)} />
        <span>I am 18 or older, these details are true, and I agree to the <Link href="/rewards/rules" target="_blank" className={ui.link}>Rewards Official Rules</Link> and the <Link href="/privacy" target="_blank" className={ui.link}>Privacy Policy</Link>, including the use of my ID to confirm I am eligible.</span>
      </label>
      {error && <div className={ui.alertError}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {error}</div>}
      <button type="submit" disabled={busy} className={cx(ui.btn, ui.btnMd, ui.btnPrimary)}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : 'Submit for review'}</button>
    </form>
  );
}

// ---------------------------------------------------------------- BANK ACCOUNT
function BankStep({ bank, isNg, country, onDone }: { bank: Summary['bank']; isNg: boolean; country: string | null; onDone: () => void }) {
  const [supabase] = useState(() => createClient());
  const [bankName, setBankName] = useState(bank?.bank_name ?? '');
  const [number, setNumber] = useState('');
  const [accountName, setAccountName] = useState(bank?.account_name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (isNg && !/^\d{10}$/.test(number.replace(/\D/g, ''))) return setError('Nigerian account numbers (NUBAN) have exactly 10 digits.');
    if (!isNg && !/^[A-Za-z0-9]{6,34}$/.test(number.replace(/[^A-Za-z0-9]/g, ''))) return setError('Enter your account, IBAN or mobile-money number (6 to 34 letters/digits).');
    setBusy(true);
    const args: Record<string, string> = { p_bank_name: bankName, p_account_number: number, p_account_name: accountName };
    if (!isNg && country) args.p_country = country;
    const { error } = await supabase.rpc('save_payout_account', args);
    setBusy(false);
    if (error) return setError(errText(error));
    onDone();
  };

  const remove = async () => {
    if (!window.confirm('Remove your bank details? You will need to add them again before you can be paid.')) return;
    setBusy(true);
    const { error } = await supabase.rpc('delete_payout_account');
    setBusy(false);
    if (error) return setError(errText(error));
    onDone();
  };

  return (
    <form onSubmit={save} className="pt-3 space-y-4">
      {bank && <p className={ui.body}>Saved: {bank.bank_name} ····{bank.last4}. To change it, enter the new details below.</p>}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="rw-bank" className={ui.label}>{isNg ? 'Bank' : 'Bank or mobile-money provider'}</label>
          {isNg ? (
            <select id="rw-bank" className={ui.select} value={bankName} onChange={e => setBankName(e.target.value)} required>
              <option value="">Choose your bank</option>
              {NIGERIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          ) : (
            <input id="rw-bank" className={ui.input} value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. Ecobank, MTN MoMo, M-Pesa" required minLength={2} />
          )}
        </div>
        <div>
          <label htmlFor="rw-acct" className={ui.label}>{isNg ? 'Account number' : 'Account / mobile-money number'}</label>
          {isNg ? (
            <input id="rw-acct" inputMode="numeric" maxLength={10} className={cx(ui.input, 'tabular tracking-wider')} value={number} onChange={e => setNumber(e.target.value.replace(/\D/g, ''))} placeholder="10 digits" required autoComplete="off" />
          ) : (
            <input id="rw-acct" maxLength={40} className={cx(ui.input, 'tabular tracking-wider')} value={number} onChange={e => setNumber(e.target.value)} placeholder="Account, IBAN or phone number" required autoComplete="off" />
          )}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="rw-acctname" className={ui.label}>Account name</label>
          <input id="rw-acctname" className={ui.input} value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="Exactly as your bank shows it" required minLength={3} />
          <p className={ui.hint}>Must be in your own name and match your ID. Your account number is encrypted; staff see only the last 4 digits.</p>
        </div>
      </div>
      {error && <div className={ui.alertError}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {error}</div>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={cx(ui.btn, ui.btnMd, ui.btnPrimary)}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : bank ? 'Update bank details' : 'Save bank details'}</button>
        {bank && <button type="button" onClick={remove} disabled={busy} className={cx(ui.btn, ui.btnMd, ui.btnDanger)}><Trash2 className="w-4 h-4" aria-hidden /> Remove</button>}
      </div>
    </form>
  );
}
