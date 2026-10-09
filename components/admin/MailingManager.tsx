"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Mail, Users, UserCheck, UserMinus, Send, Plus, Pencil, Trash2, Loader2, X, AlertTriangle, Download,
  Copy, RotateCcw, Ban, FlaskConical, CheckCircle2, Clock, Eye,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { ui, cx } from '@/lib/ui';
import { renderEmail } from '@/lib/emailTemplate';
import { StatCard } from '@/components/analytics/StatCard';
import { AreaChart, AreaDataPoint } from '@/components/analytics/AreaChart';
import { DonutChart, DonutSegment } from '@/components/analytics/DonutChart';
import { fetchAllRows } from '@/lib/fetchAll';
import { downloadXlsx, type XlsxSheet } from '@/lib/xlsx';
import { ReportTable, type ReportColumn } from './ReportTable';

// =========================================================================
// ADMIN → MAILING LIST
// Subscribers (who agreed to receive emails), bulk messages (campaigns) and
// sending progress. Sending happens on the server (/api/admin/mailing) through
// Resend, within the daily email limit; big lists continue automatically each day.
// Tables: supabase/migrations/20261010_mailing.sql
// =========================================================================

const supabase = createClient();

type SubStatus = 'pending' | 'subscribed' | 'unsubscribed' | 'bounced' | 'complained';
interface Subscriber {
  id: string; email: string; full_name: string | null; state: string | null; lga: string | null;
  source: string; status: SubStatus; consent_at: string | null; confirmed_at: string | null;
  unsubscribed_at: string | null; last_emailed_at: string | null; created_at: string;
}
type CampStatus = 'draft' | 'sending' | 'sent' | 'cancelled';
interface Audience { type: 'all' | 'state' | 'lga'; value?: string }
interface Campaign {
  id: string; subject: string; preheader: string | null; body: string; cta_label: string | null; cta_url: string | null;
  audience: Audience; status: CampStatus; total: number; sent_count: number; failed_count: number;
  created_at: string; queued_at: string | null; completed_at: string | null;
}
interface Setup { ready: boolean; missing: string[]; from: string | null; adminEmail: string | null; quota: { limit: number; used: number; remaining: number } }

const SUB_STATUS_CLASS: Record<SubStatus, string> = {
  subscribed: 'bg-success-soft text-on-success-soft border-success-line',
  pending: 'bg-info-soft text-on-info-soft border-info-line',
  unsubscribed: 'bg-surface-2 text-fg-muted border-line',
  bounced: 'bg-warning-soft text-on-warning-soft border-warning-line',
  complained: 'bg-danger-soft text-on-danger-soft border-danger-line',
};
const CAMP_STATUS_CLASS: Record<CampStatus, string> = {
  draft: 'bg-surface-2 text-fg-muted border-line',
  sending: 'bg-info-soft text-on-info-soft border-info-line',
  sent: 'bg-success-soft text-on-success-soft border-success-line',
  cancelled: 'bg-warning-soft text-on-warning-soft border-warning-line',
};
const SOURCE_LABEL: Record<string, string> = { website: 'Website form', signup: 'Sign-up page', dashboard: 'Dashboard', rewards: 'Rewards', admin: 'Admin' };
const SOURCE_COLOR: Record<string, string> = { website: 'var(--chart-1)', signup: 'var(--chart-2)', dashboard: 'var(--info)', rewards: 'var(--warning)', admin: 'var(--fg-subtle)' };

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const audienceLabel = (a: Audience) => (a?.type === 'state' ? `State: ${a.value}` : a?.type === 'lga' ? `LGA: ${a.value}` : 'All subscribers');

function matchesAudience(s: Subscriber, a: Audience) {
  if (s.status !== 'subscribed') return false;
  if (a.type === 'state') return (s.state || '').toLowerCase() === (a.value || '').toLowerCase();
  if (a.type === 'lga') return (s.lga || '').toLowerCase() === (a.value || '').toLowerCase();
  return true;
}

const SUB_STATUS_LABEL: Record<SubStatus, string> = {
  subscribed: 'Subscribed', pending: 'Awaiting confirmation', unsubscribed: 'Unsubscribed', bounced: 'Bounced', complained: 'Marked as spam',
};

/** Excel download stamped with the exporting admin's email and the generation time. */
async function exportXlsx(base: string, sheets: XlsxSheet[]) {
  const { data } = await supabase.auth.getSession();
  downloadXlsx(base, sheets, { generatedBy: data.session?.user?.email });
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------------------------------------------------------------------------------------
export function MailingManager() {
  const [view, setView] = useState<'campaigns' | 'subscribers'>('campaigns');
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [sent30, setSent30] = useState(0);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Campaign> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [subRes, campRes, sentRes, setupRes] = await Promise.all([
      fetchAllRows<Subscriber>((a, b) => supabase.from('mailing_subscribers')
        .select('id, email, full_name, state, lga, source, status, consent_at, confirmed_at, unsubscribed_at, last_emailed_at, created_at')
        .order('created_at', { ascending: false }).range(a, b)),
      supabase.from('mail_campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('mail_deliveries').select('id', { count: 'exact', head: true }).gte('sent_at', since),
      fetch('/api/admin/mailing').then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (subRes.error) {
      setError(subRes.error.code === '42P01' || /relation|does not exist/i.test(subRes.error.message)
        ? 'The mailing tables are not set up yet. Run supabase/migrations/20261010_mailing.sql in the Supabase SQL editor.'
        : subRes.error.message);
    }
    setSubs(subRes.rows);
    setCampaigns((campRes.data as Campaign[]) || []);
    setSent30(sentRes.count ?? 0);
    setSetup(setupRes as Setup | null);
    setLoadedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ---- Analytics ----
  const counts = useMemo(() => {
    const c: Record<SubStatus, number> = { subscribed: 0, pending: 0, unsubscribed: 0, bounced: 0, complained: 0 };
    subs.forEach(s => { c[s.status] = (c[s.status] || 0) + 1; });
    return c;
  }, [subs]);

  const growth: AreaDataPoint[] = useMemo(() => {
    const byDay = new Map<string, number>();
    subs.forEach(s => { if (s.confirmed_at) { const k = s.confirmed_at.slice(0, 10); byDay.set(k, (byDay.get(k) || 0) + 1); } });
    const out: AreaDataPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      out.push({ label: d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }), value: byDay.get(d.toISOString().slice(0, 10)) || 0 });
    }
    return out;
  }, [subs]);

  const sources: DonutSegment[] = useMemo(() => {
    const m = new Map<string, number>();
    subs.filter(s => s.status === 'subscribed').forEach(s => m.set(s.source, (m.get(s.source) || 0) + 1));
    return [...m.entries()].map(([k, v]) => ({ id: k, label: SOURCE_LABEL[k] || k, value: v, color: SOURCE_COLOR[k] || 'var(--fg-subtle)' }));
  }, [subs]);

  const churn = counts.unsubscribed + counts.bounced + counts.complained;

  // ---- Campaign actions ----
  const runAction = async (c: Campaign, action: 'queue' | 'next' | 'retry_failed') => {
    setBusyId(c.id);
    setNotice(null);
    try {
      const r = await postJson('/api/admin/mailing', { action, campaignId: c.id });
      const left = r.quota?.remaining ?? 0;
      setNotice(r.error
        ? `Sending stopped: ${r.error}`
        : `Sent ${r.sent ?? 0} email(s)${r.failed ? `, ${r.failed} failed` : ''}. ${left > 0 ? `${left} more can be sent today.` : 'Daily limit reached — the rest will go out automatically tomorrow morning.'}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Sending failed.');
    } finally {
      setBusyId(null);
      load();
    }
  };

  const cancel = async (c: Campaign) => {
    if (!window.confirm(`Stop sending "${c.subject}"? People who already received it are not affected.`)) return;
    setBusyId(c.id);
    const { error } = await supabase.from('mail_campaigns').update({ status: 'cancelled', completed_at: new Date().toISOString() }).eq('id', c.id);
    setBusyId(null);
    if (error) alert('Could not cancel: ' + error.message);
    load();
  };

  const removeCampaign = async (c: Campaign) => {
    if (!window.confirm(`Delete "${c.subject}"? This cannot be undone.`)) return;
    setBusyId(c.id);
    const { error } = await supabase.from('mail_campaigns').delete().eq('id', c.id);
    setBusyId(null);
    if (error) alert('Could not delete: ' + error.message);
    load();
  };

  // ---- Subscriber actions ----
  const unsubscribeOne = async (s: Subscriber) => {
    if (!window.confirm(`Unsubscribe ${s.email}? They will stop receiving emails immediately.`)) return;
    const { error } = await supabase.from('mailing_subscribers').update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString(), confirm_token: null }).eq('id', s.id);
    if (error) return alert('Could not update: ' + error.message);
    setSubs(prev => prev.map(x => (x.id === s.id ? { ...x, status: 'unsubscribed', unsubscribed_at: new Date().toISOString() } : x)));
  };

  const eraseOne = async (s: Subscriber) => {
    if (!window.confirm(`Permanently erase ${s.email} from the mailing list (data-deletion request)? Their consent record is deleted too.`)) return;
    const { error } = await supabase.from('mailing_subscribers').delete().eq('id', s.id);
    if (error) return alert('Could not delete: ' + error.message);
    setSubs(prev => prev.filter(x => x.id !== s.id));
  };

  const quota = setup?.quota;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl sm:text-[28px] font-bold tracking-tight text-fg">Mailing list</h2>
          <p className="text-fg-muted text-sm mt-1">People who agreed to receive emails, and the bulk messages you send them.</p>
        </div>
        <button onClick={() => setEditing({ audience: { type: 'all' } })} className={cx(ui.btn, ui.btnMd, ui.btnPrimary)}>
          <Plus className="w-4 h-4" aria-hidden /> New message
        </button>
      </div>

      {error && <div className={ui.alertError}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {error}</div>}
      {setup && !setup.ready && (
        <div className={ui.alertWarning}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          <span>
            Email sending is not switched on yet. In Vercel → Project → Settings → Environment Variables add:{' '}
            <strong>{setup.missing.join(', ')}</strong>, then redeploy. You can still write and save drafts.
          </span>
        </div>
      )}
      {notice && <div className={ui.alertSuccess}><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {notice}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Subscribed" value={counts.subscribed.toLocaleString()} subtitle="Confirmed and receiving emails" icon={UserCheck} colorTheme="emerald" />
        <StatCard title="Awaiting confirmation" value={counts.pending.toLocaleString()} subtitle="Have not clicked the email link yet" icon={Clock} colorTheme="blue" />
        <StatCard title="Left the list" value={churn.toLocaleString()} subtitle={`${counts.unsubscribed} unsubscribed · ${counts.bounced} bounced · ${counts.complained} spam`} icon={UserMinus} colorTheme="amber" />
        <StatCard title="Emails sent (30 days)" value={sent30.toLocaleString()} subtitle={quota ? `Today: ${quota.used} of ${quota.limit} daily limit` : 'Bulk messages delivered'} icon={Send} colorTheme="indigo" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={cx(ui.card, 'p-5 lg:col-span-2')}>
          <AreaChart title="New subscribers" subtitle="Confirmed sign-ups per day, last 30 days" data={growth} color="var(--chart-2)" emptyMessage="No sign-ups yet" />
        </div>
        <div className={cx(ui.card, 'p-5')}>
          <DonutChart title="Where they signed up" subtitle="Current subscribers" data={sources} centerSub="Subscribers" emptyMessage="No subscribers yet" />
        </div>
      </div>

      <div className="inline-flex self-start rounded-full border border-line bg-surface-2 p-1" role="tablist" aria-label="Mailing views">
        {(['campaigns', 'subscribers'] as const).map(v => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
            className={cx('h-9 px-4 rounded-full text-sm font-semibold transition-colors', view === v ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg')}>
            {v === 'campaigns' ? `Messages (${campaigns.length})` : `Subscribers (${subs.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={cx(ui.card, 'p-10 flex justify-center')}><Loader2 className="w-6 h-6 animate-spin text-fg-subtle" aria-label="Loading" /></div>
      ) : view === 'campaigns' ? (
        <CampaignList
          campaigns={campaigns}
          busyId={busyId}
          canSend={!!setup?.ready}
          onEdit={c => setEditing(c)}
          onDuplicate={c => setEditing({ subject: c.subject, preheader: c.preheader, body: c.body, cta_label: c.cta_label, cta_url: c.cta_url, audience: c.audience })}
          onAction={runAction}
          onCancel={cancel}
          onDelete={removeCampaign}
          loadedAt={loadedAt}
        />
      ) : (
        <SubscriberList subs={subs} loadedAt={loadedAt} onRefresh={load} onUnsubscribe={unsubscribeOne} onErase={eraseOne} />
      )}

      {editing && (
        <CampaignEditor
          initial={editing}
          subs={subs}
          setup={setup}
          onClose={() => setEditing(null)}
          onDone={msg => { setEditing(null); if (msg) setNotice(msg); load(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
function CampaignList({ campaigns, busyId, canSend, onEdit, onDuplicate, onAction, onCancel, onDelete, loadedAt }: {
  campaigns: Campaign[]; busyId: string | null; canSend: boolean;
  onEdit: (c: Campaign) => void; onDuplicate: (c: Campaign) => void;
  onAction: (c: Campaign, a: 'queue' | 'next' | 'retry_failed') => void;
  onCancel: (c: Campaign) => void; onDelete: (c: Campaign) => void;
  loadedAt: Date | null;
}) {
  const [logBusy, setLogBusy] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);

  const exportSummary = () => exportXlsx('qozob-mail-campaigns', [{
    name: 'Messages',
    title: 'Bulk email messages',
    meta: [`Messages: ${campaigns.length}`, ...(loadedAt ? [`Data as of: ${loadedAt.toLocaleString('en-GB', { timeZone: 'Africa/Lagos' })} WAT`] : [])],
    columns: [
      { header: 'Subject', width: 40 }, { header: 'Status' }, { header: 'Audience', width: 24 },
      { header: 'Recipients', type: 'integer' }, { header: 'Sent', type: 'integer' }, { header: 'Failed', type: 'integer' }, { header: 'Delivered %', type: 'number' },
      { header: 'Created', type: 'datetime' }, { header: 'Queued', type: 'datetime' }, { header: 'Finished', type: 'datetime' },
      { header: 'Button label' }, { header: 'Button link', width: 36 }, { header: 'Message ID' },
    ],
    rows: campaigns.map(c => [
      c.subject, c.status, audienceLabel(c.audience), c.total, c.sent_count, c.failed_count,
      c.total ? Math.round((c.sent_count / c.total) * 1000) / 10 : null,
      c.created_at, c.queued_at, c.completed_at, c.cta_label, c.cta_url, c.id,
    ]),
  }]);

  const exportLog = async (c: Campaign) => {
    setLogBusy(c.id); setLogError(null);
    const res = await fetchAllRows<{ email: string; status: string; error: string | null; provider_id: string | null; created_at: string; sent_at: string | null }>(
      (a, b) => supabase.from('mail_deliveries').select('email, status, error, provider_id, created_at, sent_at').eq('campaign_id', c.id).order('id').range(a, b));
    setLogBusy(null);
    if (res.error) { setLogError(`Could not load the delivery log: ${res.error.message}`); return; }
    await exportXlsx(`qozob-mail-log-${c.subject.slice(0, 30)}`, [{
      name: 'Delivery log',
      title: `Delivery log · ${c.subject}`,
      meta: [`Audience: ${audienceLabel(c.audience)}`, `Status: ${c.status}`, `Rows: ${res.rows.length}`, 'Contains personal data: store securely and delete when done.'],
      columns: [{ header: 'Email', width: 32 }, { header: 'Status' }, { header: 'Queued', type: 'datetime' }, { header: 'Sent', type: 'datetime' }, { header: 'Error', width: 40 }, { header: 'Provider ID', width: 28 }],
      rows: res.rows.map(d => [d.email, d.status, d.created_at, d.sent_at, d.error, d.provider_id]),
    }]);
  };

  if (campaigns.length === 0) {
    return (
      <div className={cx(ui.card, 'p-10 text-center')}>
        <Mail className="w-8 h-8 mx-auto text-fg-subtle mb-2" aria-hidden />
        <p className="text-sm font-semibold text-fg">No messages yet</p>
        <p className="text-sm text-fg-muted mt-1">Click &quot;New message&quot; to write your first email to subscribers.</p>
      </div>
    );
  }
  return (
    <section className={cx(ui.card, 'overflow-hidden')}>
      <div className="px-5 py-3 border-b border-line flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-muted">{loadedAt ? `Data as of ${loadedAt.toLocaleString('en-GB', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} WAT` : ''}</p>
        <button type="button" onClick={exportSummary} className={cx(ui.btn, ui.btnSm, ui.btnSecondary)}><Download className="w-4 h-4" aria-hidden /> Excel</button>
      </div>
      {logError && <div className={cx(ui.alertError, 'm-4')}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {logError}</div>}
      <ul className="divide-y divide-line">
        {campaigns.map(c => {
          const pct = c.total > 0 ? Math.round(((c.sent_count + c.failed_count) / c.total) * 100) : 0;
          const busy = busyId === c.id;
          return (
            <li key={c.id} className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-fg truncate">{c.subject}</p>
                  <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize', CAMP_STATUS_CLASS[c.status])}>{c.status}</span>
                </div>
                <p className="text-xs text-fg-muted mt-1">{audienceLabel(c.audience)} · created {fmtDay(c.created_at)}{c.completed_at ? ` · finished ${fmtDate(c.completed_at)}` : ''}</p>
                {c.status !== 'draft' && (
                  <div className="mt-2 max-w-md">
                    <div className="h-2 rounded-full bg-surface-3 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Sending progress">
                      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-fg-muted mt-1 tabular">
                      {c.sent_count.toLocaleString()} sent{c.failed_count ? ` · ${c.failed_count} failed` : ''} of {c.total.toLocaleString()}
                      {c.status === 'sending' && c.total > c.sent_count + c.failed_count ? ' · continues automatically each morning' : ''}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {c.status === 'draft' && (
                  <>
                    <button onClick={() => onEdit(c)} className={cx(ui.btn, ui.btnSm, ui.btnSecondary)}><Pencil className="w-4 h-4" aria-hidden /> Edit</button>
                    <button onClick={() => onEdit(c)} disabled={!canSend} className={cx(ui.btn, ui.btnSm, ui.btnPrimary)}><Send className="w-4 h-4" aria-hidden /> Review &amp; send</button>
                  </>
                )}
                {c.status === 'sending' && (
                  <>
                    <button onClick={() => onAction(c, 'next')} disabled={busy || !canSend} className={cx(ui.btn, ui.btnSm, ui.btnPrimary)}>
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />} Send next batch
                    </button>
                    <button onClick={() => onCancel(c)} disabled={busy} className={cx(ui.btn, ui.btnSm, ui.btnSoft)}><Ban className="w-4 h-4" aria-hidden /> Stop</button>
                  </>
                )}
                {c.status === 'sent' && c.failed_count > 0 && (
                  <button onClick={() => onAction(c, 'retry_failed')} disabled={busy || !canSend} className={cx(ui.btn, ui.btnSm, ui.btnSoft)}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RotateCcw className="w-4 h-4" aria-hidden />} Retry failed
                  </button>
                )}
                {c.status !== 'draft' && (
                  <>
                    <button onClick={() => exportLog(c)} disabled={logBusy === c.id} className={cx(ui.btn, ui.btnSm, ui.btnGhost)} title="Download who it was sent to (Excel)">
                      {logBusy === c.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Download className="w-4 h-4" aria-hidden />} Log
                    </button>
                    <button onClick={() => onDuplicate(c)} className={cx(ui.btn, ui.btnSm, ui.btnSecondary)}><Copy className="w-4 h-4" aria-hidden /> Duplicate</button>
                  </>
                )}
                {(c.status === 'draft' || c.status === 'cancelled') && (
                  <button onClick={() => onDelete(c)} disabled={busy} className={cx(ui.btn, ui.btnSm, ui.btnDanger)} aria-label={`Delete ${c.subject}`}><Trash2 className="w-4 h-4" aria-hidden /></button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------------
function SubscriberList({ subs, loadedAt, onRefresh, onUnsubscribe, onErase }: {
  subs: Subscriber[]; loadedAt: Date | null; onRefresh: () => void;
  onUnsubscribe: (s: Subscriber) => void; onErase: (s: Subscriber) => void;
}) {
  const [status, setStatus] = useState<'all' | SubStatus>('all');
  const rows = useMemo(() => (status === 'all' ? subs : subs.filter(s => s.status === status)), [subs, status]);

  const columns = useMemo<ReportColumn<Subscriber>[]>(() => [
    {
      key: 'email', header: 'Email', get: s => s.email, width: 32,
      render: s => <span><span className="font-medium text-fg break-all block">{s.email}</span>{s.full_name && <span className="text-xs text-fg-muted">{s.full_name}</span>}</span>,
    },
    { key: 'name', header: 'Name', get: s => s.full_name, defaultVisible: false, width: 24 },
    {
      key: 'status', header: 'Status', get: s => SUB_STATUS_LABEL[s.status] ?? s.status,
      render: s => <span className={cx('inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap', SUB_STATUS_CLASS[s.status])}>{SUB_STATUS_LABEL[s.status] ?? s.status}</span>,
    },
    { key: 'state', header: 'State', get: s => s.state },
    { key: 'lga', header: 'LGA', get: s => s.lga },
    { key: 'source', header: 'Source', get: s => SOURCE_LABEL[s.source] || s.source },
    { key: 'consent', header: 'Consent given', get: s => s.consent_at, type: 'datetime' },
    { key: 'confirmed', header: 'Confirmed', get: s => s.confirmed_at, type: 'datetime', defaultVisible: false },
    { key: 'unsubscribed', header: 'Unsubscribed', get: s => s.unsubscribed_at, type: 'datetime', defaultVisible: false },
    { key: 'last', header: 'Last emailed', get: s => s.last_emailed_at, type: 'datetime', defaultVisible: false },
    { key: 'created', header: 'Joined', get: s => s.created_at, type: 'datetime', defaultVisible: false },
  ], []);

  return (
    <ReportTable
      id="admin-mail-subscribers"
      title="Mailing list subscribers"
      rows={rows}
      columns={columns}
      rowKey={s => s.id}
      loadedAt={loadedAt}
      onRefresh={onRefresh}
      meta={[`Status: ${status === 'all' ? 'All' : SUB_STATUS_LABEL[status]}`, 'Contains personal data: store securely and delete when done.']}
      initialSort={{ key: 'consent', dir: 'desc' }}
      searchPlaceholder="Search email, name, state or LGA"
      emptyText={subs.length === 0 ? 'No subscribers yet. People join from the website footer, the sign-up page or their dashboard settings.' : 'No matches. Try a different search or filter.'}
      toolbar={(
        <select value={status} onChange={e => setStatus(e.target.value as 'all' | SubStatus)} aria-label="Filter by status" className={cx(ui.select, 'h-10 w-auto')}>
          <option value="all">All statuses</option>
          {(Object.keys(SUB_STATUS_LABEL) as SubStatus[]).map(k => <option key={k} value={k}>{SUB_STATUS_LABEL[k]}</option>)}
        </select>
      )}
      rowActions={s => (
        <div className="flex justify-end gap-2">
          {(s.status === 'subscribed' || s.status === 'pending') && (
            <button onClick={() => onUnsubscribe(s)} className={cx(ui.btn, ui.btnSm, ui.btnSoft)}>Unsubscribe</button>
          )}
          <button onClick={() => onErase(s)} className={cx(ui.btn, ui.btnSm, ui.btnDanger)} aria-label={`Erase ${s.email}`} title="Erase (data-deletion request)"><Trash2 className="w-4 h-4" aria-hidden /></button>
        </div>
      )}
    />
  );
}

// ---------------------------------------------------------------------------------------
function CampaignEditor({ initial, subs, setup, onClose, onDone }: {
  initial: Partial<Campaign>; subs: Subscriber[]; setup: Setup | null;
  onClose: () => void; onDone: (msg?: string) => void;
}) {
  const [id, setId] = useState<string | undefined>(initial.id);
  const [subject, setSubject] = useState(initial.subject || '');
  const [preheader, setPreheader] = useState(initial.preheader || '');
  const [body, setBody] = useState(initial.body || '');
  const [ctaLabel, setCtaLabel] = useState(initial.cta_label || '');
  const [ctaUrl, setCtaUrl] = useState(initial.cta_url || '');
  const [audType, setAudType] = useState<Audience['type']>(initial.audience?.type || 'all');
  const [audValue, setAudValue] = useState(initial.audience?.value || '');
  const [busy, setBusy] = useState<null | 'save' | 'test' | 'send'>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const states = useMemo(() => [...new Set(subs.map(s => s.state).filter(Boolean) as string[])].sort(), [subs]);
  const lgas = useMemo(() => [...new Set(subs.map(s => s.lga).filter(Boolean) as string[])].sort(), [subs]);
  const audience: Audience = audType === 'all' ? { type: 'all' } : { type: audType, value: audValue.trim() };
  const recipients = useMemo(() => subs.filter(s => matchesAudience(s, audience)).length, [subs, audType, audValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewHtml = useMemo(() => renderEmail(
    { subject: subject || 'Your subject', preheader, body: body || 'Your message will appear here.', ctaLabel, ctaUrl },
    '#unsubscribe',
  ), [subject, preheader, body, ctaLabel, ctaUrl]);

  const validate = () => {
    if (!subject.trim()) return 'Add a subject line.';
    if (!body.trim()) return 'Write the message.';
    if ((ctaLabel && !ctaUrl) || (!ctaLabel && ctaUrl)) return 'For a button, fill in both the button text and its link (or leave both empty).';
    if (ctaUrl && !/^https?:\/\/\S+$/i.test(ctaUrl.trim())) return 'The button link must start with https://';
    if (audType !== 'all' && !audValue.trim()) return `Choose which ${audType === 'state' ? 'state' : 'LGA'} to send to.`;
    return null;
  };

  const save = async (): Promise<string | null> => {
    const v = validate();
    if (v) { setErr(v); return null; }
    const row = {
      subject: subject.trim(), preheader: preheader.trim() || null, body: body.trim(),
      cta_label: ctaLabel.trim() || null, cta_url: ctaUrl.trim() || null, audience,
    };
    if (id) {
      const { error } = await supabase.from('mail_campaigns').update(row).eq('id', id).eq('status', 'draft');
      if (error) { setErr(error.message); return null; }
      return id;
    }
    const { data, error } = await supabase.from('mail_campaigns').insert(row).select('id').single();
    if (error) { setErr(error.message); return null; }
    setId(data.id);
    return data.id as string;
  };

  const onSave = async () => {
    setErr(null); setInfo(null); setBusy('save');
    const saved = await save();
    setBusy(null);
    if (saved) onDone('Draft saved.');
  };

  const onTest = async () => {
    setErr(null); setInfo(null);
    const v = validate();
    if (v) return setErr(v);
    setBusy('test');
    try {
      const r = await postJson('/api/admin/mailing/test', { subject, preheader, body, ctaLabel, ctaUrl });
      setInfo(`Test sent to ${r.to}. Check your inbox (and spam folder).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Test failed.');
    } finally {
      setBusy(null);
    }
  };

  const onSend = async () => {
    setErr(null); setInfo(null);
    const v = validate();
    if (v) return setErr(v);
    if (recipients === 0) return setErr('Nobody in this audience is subscribed yet.');
    const q = setup?.quota;
    const later = q && recipients > q.remaining ? `\n\nToday's limit allows ${q.remaining} more email(s); the rest will be sent automatically on the following days.` : '';
    if (!window.confirm(`Send "${subject.trim()}" to ${recipients.toLocaleString()} subscriber(s)? This cannot be undone.${later}`)) return;
    setBusy('send');
    try {
      const savedId = await save();
      if (!savedId) return;
      const r = await postJson('/api/admin/mailing', { action: 'queue', campaignId: savedId });
      onDone(r.error
        ? `Message queued for ${r.queued} people, but sending stopped: ${r.error}`
        : `Message queued for ${r.queued} people. ${r.sent} sent now${r.quota?.remaining === 0 && r.queued > r.sent ? '; the rest go out automatically each morning.' : '.'}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sending failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={ui.overlay} role="dialog" aria-modal="true" aria-labelledby="mail-editor-title">
      <div className={cx(ui.modal, 'max-w-5xl max-h-[94vh] overflow-y-auto p-6 sm:p-7')}>
        <button onClick={onClose} className={ui.modalClose} aria-label="Close"><X className="w-5 h-5" /></button>
        <h2 id="mail-editor-title" className={cx(ui.h2, 'text-xl pr-8')}>{id ? 'Edit message' : 'New message'}</h2>
        <p className="text-sm text-fg-muted mt-1 mb-6">Only people who agreed to receive emails get this. Every email includes an unsubscribe link automatically.</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex flex-col gap-4">
            <div>
              <label className={ui.label} htmlFor="m-subject">Subject</label>
              <input id="m-subject" value={subject} onChange={e => setSubject(e.target.value)} maxLength={150} className={ui.input} placeholder="e.g. Petrol prices dropped in Lagos this week" />
            </div>
            <div>
              <label className={ui.label} htmlFor="m-pre">Preview text <span className="font-normal text-fg-subtle">(optional)</span></label>
              <input id="m-pre" value={preheader} onChange={e => setPreheader(e.target.value)} maxLength={200} className={ui.input} placeholder="Short line shown next to the subject in the inbox" />
            </div>
            <div>
              <label className={ui.label} htmlFor="m-body">Message</label>
              <textarea id="m-body" value={body} onChange={e => setBody(e.target.value)} rows={10} maxLength={20000}
                className={cx(ui.input, 'h-auto py-3 leading-relaxed resize-y')} placeholder={'Hello!\n\nLeave a blank line between paragraphs. Wrap words in **double stars** for bold. Links like https://www.qozob.com become clickable.'} />
              <p className={ui.hint}>Blank line = new paragraph · **bold** · links are detected automatically.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={ui.label} htmlFor="m-cta">Button text <span className="font-normal text-fg-subtle">(optional)</span></label>
                <input id="m-cta" value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} maxLength={60} className={ui.input} placeholder="Open the fuel map" />
              </div>
              <div>
                <label className={ui.label} htmlFor="m-ctaurl">Button link</label>
                <input id="m-ctaurl" value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} className={ui.input} placeholder="https://www.qozob.com" inputMode="url" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={ui.label} htmlFor="m-aud">Send to</label>
                <select id="m-aud" value={audType} onChange={e => { setAudType(e.target.value as Audience['type']); setAudValue(''); }} className={ui.select}>
                  <option value="all">All subscribers</option>
                  <option value="state">Subscribers in one state</option>
                  <option value="lga">Subscribers in one LGA</option>
                </select>
              </div>
              {audType === 'state' && (
                <div>
                  <label className={ui.label} htmlFor="m-state">State</label>
                  <select id="m-state" value={audValue} onChange={e => setAudValue(e.target.value)} className={ui.select}>
                    <option value="">Choose a state…</option>
                    {states.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              {audType === 'lga' && (
                <div>
                  <label className={ui.label} htmlFor="m-lga">LGA</label>
                  <input id="m-lga" list="m-lga-list" value={audValue} onChange={e => setAudValue(e.target.value)} className={ui.input} placeholder="Type an LGA" />
                  <datalist id="m-lga-list">{lgas.map(l => <option key={l} value={l} />)}</datalist>
                </div>
              )}
            </div>
            <p className="text-sm text-fg">
              <Users className="inline w-4 h-4 mr-1 -mt-0.5 text-primary" aria-hidden />
              <strong>{recipients.toLocaleString()}</strong> subscriber(s) will receive this.
              {setup?.quota && <span className="text-fg-muted"> Today you can still send {setup.quota.remaining} of {setup.quota.limit}.</span>}
            </p>
            <button type="button" onClick={() => setShowPreview(p => !p)} className={cx(ui.btn, ui.btnSm, ui.btnSoft, 'self-start lg:hidden')}>
              <Eye className="w-4 h-4" aria-hidden /> {showPreview ? 'Hide preview' : 'Show preview'}
            </button>
          </div>

          <div className={cx(showPreview ? 'block' : 'hidden', 'lg:block')}>
            <p className={ui.label}>Preview</p>
            <iframe title="Email preview" srcDoc={previewHtml} sandbox="" className="w-full h-[560px] rounded-2xl border border-line bg-white" />
          </div>
        </div>

        {err && <div className={cx(ui.alertError, 'mt-5')}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {err}</div>}
        {info && <div className={cx(ui.alertSuccess, 'mt-5')}><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {info}</div>}

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button onClick={onClose} className={cx(ui.btn, ui.btnMd, ui.btnSecondary)}>Cancel</button>
          <button onClick={onSave} disabled={!!busy} className={cx(ui.btn, ui.btnMd, ui.btnSoft)}>
            {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Save draft
          </button>
          <button onClick={onTest} disabled={!!busy || !setup?.ready} className={cx(ui.btn, ui.btnMd, ui.btnSoft)} title={setup?.adminEmail ? `Sends to ${setup.adminEmail}` : undefined}>
            {busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <FlaskConical className="w-4 h-4" aria-hidden />} Send me a test
          </button>
          <button onClick={onSend} disabled={!!busy || !setup?.ready} className={cx(ui.btn, ui.btnMd, ui.btnPrimary)}>
            {busy === 'send' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />} Send now
          </button>
        </div>
      </div>
    </div>
  );
}

