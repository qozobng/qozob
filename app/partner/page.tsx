"use client";

// =========================================================================
// PARTNER PORTAL  (/partner)
// For people who work for a partner company (insurer, papers agent, tracker
// installer). Admins add them in Admin → Auto services → Partners.
//   • Requests: the service requests Qozob sent to their company; they update
//     the status, give a quote and leave notes (shared with Qozob).
//   • Prices: today's prices for the services they deliver; they can PROPOSE a
//     new price, which goes live only after a Qozob admin approves it.
// Everything is checked in the database (my_partner_portal, partner_* functions,
// supabase/migrations/20261106_service_pricing.sql).
// =========================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2, ClipboardList, Tag, Loader2, AlertTriangle, CheckCircle2, PhoneCall, MessageSquare, Mail, MapPin, Car,
  RefreshCw, Download, X, Clock, ChevronLeft,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { Wordmark } from '@/components/Wordmark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cx, ui } from '@/lib/ui';
import { formatMoney } from '@/lib/currency';
import { NIGERIAN_STATES } from '@/lib/nigeria';
import { downloadXlsx } from '@/lib/xlsx';
import { isMissingFunction } from '@/lib/fetchAll';
import { SERVICE_CATEGORY_LABEL } from '@/lib/servicePricing';
import { VEHICLE_TIERS, type VehicleTier } from '@/lib/vehicles';
import type { ServiceCategory, ServiceStatus, PaymentStatus, TierPriceMap } from '@/types/services';

const supabase = createClient();

interface PortalService {
  id: string; title: string; category: ServiceCategory; private_price: number; commercial_price: number | null;
  tier_prices?: TierPriceMap; rate_percent?: number | null; min_price?: number | null;
  currency: string; is_active: boolean; state_prices: { state: string; private_price: number; commercial_price: number | null; tier_prices?: TierPriceMap }[];
}
interface PortalProposal {
  id: number; service_id: string; service_title: string | null; state: string | null; private_price: number; commercial_price: number | null;
  tier_prices?: TierPriceMap | null; rate_percent?: number | null;
  current_private: number | null; current_commercial: number | null; note: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn'; review_note: string | null; reviewed_at: string | null; created_at: string;
}
interface PortalRequest {
  id: string; service_category: ServiceCategory; service_name: string; full_name: string; phone: string; email: string;
  state: string | null; lga: string | null; delivery_address: string | null; vehicle_make: string | null; vehicle_model: string | null;
  vehicle_year: string | null; plate_number: string | null; chassis_number: string | null; details: Record<string, unknown> | null;
  status: ServiceStatus; estimated_price: number | null; quoted_price: number | null; payment_status: PaymentStatus;
  admin_notes: string | null; partner_assigned_at: string | null; created_at: string; updated_at: string;
}
interface Portal {
  partner: { id: string; name: string; categories: ServiceCategory[]; states: string[]; role: 'lead' | 'agent' | null };
  services: PortalService[]; proposals: PortalProposal[]; requests: PortalRequest[];
}

type Phase = 'loading' | 'ready' | 'not_partner' | 'missing' | 'error';

const STATUS: Record<ServiceStatus, { label: string; cls: string }> = {
  pending: { label: 'New', cls: 'bg-warning-soft text-on-warning-soft border-warning-line' },
  contacted: { label: 'Contacted', cls: 'bg-info-soft text-on-info-soft border-info-line' },
  quoted: { label: 'Quoted', cls: 'bg-info-soft text-on-info-soft border-info-line' },
  in_progress: { label: 'In progress', cls: 'bg-primary/10 text-primary border-primary/30' },
  completed: { label: 'Completed', cls: 'bg-success-soft text-on-success-soft border-success-line' },
  cancelled: { label: 'Cancelled', cls: 'bg-surface-2 text-fg-muted border-line' },
};
const NEXT_STATUSES: ServiceStatus[] = ['contacted', 'quoted', 'in_progress', 'completed', 'cancelled'];
const PAYMENT: Record<PaymentStatus, string> = { unpaid: 'Unpaid', partially_paid: 'Part paid', paid: 'Paid', voucher_used: 'Voucher used' };
const PROPOSAL: Record<PortalProposal['status'], { label: string; cls: string }> = {
  pending: { label: 'Waiting for Qozob', cls: 'bg-warning-soft text-on-warning-soft border-warning-line' },
  approved: { label: 'Approved · live', cls: 'bg-success-soft text-on-success-soft border-success-line' },
  rejected: { label: 'Not approved', cls: 'bg-danger-soft text-on-danger-soft border-danger-line' },
  withdrawn: { label: 'Withdrawn', cls: 'bg-surface-2 text-fg-muted border-line' },
};

const money = (n: number | null | undefined) => (n === null || n === undefined ? '—' : formatMoney(n, 'NGN'));
const ref = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;
const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const errText = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Something went wrong.');
const pill = 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap';
const closed = (s: ServiceStatus) => s === 'completed' || s === 'cancelled';

export default function PartnerPortalPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const [data, setData] = useState<Portal | null>(null);
  const [errorText, setErrorText] = useState('');
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'requests' | 'prices'>('requests');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const flash = useCallback((ok: boolean, text: string) => {
    setNotice({ ok, text });
    window.setTimeout(() => setNotice(null), 7000);
  }, []);

  const fetchPortal = useCallback(() => supabase.rpc('my_partner_portal').then(({ data: d, error }) => {
    if (error) {
      if (isMissingFunction(error)) setPhase('missing');
      else { setErrorText(error.message); setPhase('error'); }
    } else if (!d) {
      setPhase('not_partner');
    } else {
      setData(d as Portal);
      setLoadedAt(new Date());
      setPhase('ready');
    }
    setRefreshing(false);
  }), []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: u }) => {
      if (!u.user) { router.replace('/login?next=/partner'); return; }
      fetchPortal();
    });
  }, [router, fetchPortal]);

  const refresh = async () => { setRefreshing(true); await fetchPortal(); };
  const openCount = data?.requests.filter(r => !closed(r.status)).length ?? 0;
  const pendingCount = data?.proposals.filter(p => p.status === 'pending').length ?? 0;

  return (
    <div className="min-h-screen bg-canvas text-fg flex flex-col">
      <header className="bg-brand-grad text-on-brand sticky top-0 z-40 shadow-[0_1px_0_var(--brand-line)]">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="rounded-md" aria-label="Qozob home"><Wordmark tone="brand" size="md" /></Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs font-semibold text-on-brand-muted">Partner portal</span>
            <ThemeToggle tone="brand" />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto w-full px-4 py-6 sm:py-8 flex-1">
        {phase === 'loading' && (
          <div className="py-24 flex items-center justify-center gap-2 text-sm text-fg-muted"><Loader2 className="w-5 h-5 animate-spin" aria-hidden /> Loading your partner portal…</div>
        )}

        {phase === 'not_partner' && (
          <div className={cx(ui.card, 'max-w-lg mx-auto p-6 sm:p-8 text-center')}>
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Building2 className="w-7 h-7" aria-hidden /></span>
            <h1 className="mt-4 text-xl font-bold text-fg">This page is for Qozob service partners</h1>
            <p className="mt-2 text-sm text-fg-muted">
              Insurers, vehicle-papers agents and tracker installers who work with Qozob manage their requests and prices here.
              Your account is not linked to a partner company.
            </p>
            <p className="mt-3 text-sm text-fg-muted">
              Want to become a partner, or should you have access? Email <a className={ui.link} href="mailto:support@qozob.com">support@qozob.com</a> with your company name.
            </p>
            <Link href="/" className={cx(ui.btn, ui.btnMd, ui.btnSecondary, 'mt-5')}><ChevronLeft className="w-4 h-4" aria-hidden /> Back to Qozob</Link>
          </div>
        )}

        {phase === 'missing' && (
          <div className={cx(ui.alertWarning, 'max-w-lg mx-auto')}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />The partner portal is not switched on yet. Please check back soon.</div>
        )}
        {phase === 'error' && (
          <div className={cx(ui.alertError, 'max-w-lg mx-auto')}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />Could not load the portal: {errorText}</div>
        )}

        {phase === 'ready' && data && (
          <div className="flex flex-col gap-5 animate-in fade-in duration-300">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className={ui.eyebrow}>Partner portal</p>
                <h1 className={cx(ui.h1, 'flex items-center gap-2')}><Building2 className="w-7 h-7 text-primary shrink-0" aria-hidden /> <span className="truncate">{data.partner.name}</span></h1>
                <p className="mt-1 text-xs text-fg-muted">
                  {data.partner.categories.map(c => SERVICE_CATEGORY_LABEL[c] ?? c).join(' · ')}
                  {' · '}{data.partner.states.length ? data.partner.states.join(', ') : 'All states'}
                  {data.partner.role ? ` · You are ${data.partner.role === 'lead' ? 'the lead' : 'an agent'}` : ''}
                </p>
              </div>
              <button type="button" onClick={refresh} disabled={refreshing} className={cx(ui.btn, ui.btnSm, ui.btnSoft, 'h-9')}>
                <RefreshCw className={cx('w-4 h-4', refreshing && 'animate-spin motion-reduce:animate-none')} aria-hidden /> Refresh
              </button>
            </div>

            <div className="-mx-1 overflow-x-auto" role="tablist" aria-label="Portal sections">
              <div className="inline-flex gap-1 p-1 mx-1 rounded-full bg-surface-2 border border-line">
                {([['requests', 'Requests', ClipboardList, openCount], ['prices', 'Prices', Tag, pendingCount]] as const).map(([key, label, Icon, count]) => (
                  <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                    className={cx('shrink-0 inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-semibold transition-colors',
                      tab === key ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg')}>
                    <Icon className="w-4 h-4" aria-hidden /> {label}
                    {count > 0 && <span className="min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-primary text-on-primary text-[11px] font-bold tabular">{count}</span>}
                  </button>
                ))}
              </div>
            </div>

            {notice && (
              <div className={notice.ok ? ui.alertSuccess : ui.alertError} role="status">
                {notice.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />} {notice.text}
              </div>
            )}

            {tab === 'requests'
              ? <RequestsTab portal={data} loadedAt={loadedAt} flash={flash} onChanged={refresh} />
              : <PricesTab portal={data} flash={flash} onChanged={refresh} />}
          </div>
        )}
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-fg-subtle">
        Need help? <a className={ui.link} href="mailto:support@qozob.com">support@qozob.com</a>
      </footer>
    </div>
  );
}

// =========================================================================
// REQUESTS
// =========================================================================
function RequestsTab({ portal, loadedAt, flash, onChanged }: {
  portal: Portal; loadedAt: Date | null; flash: (ok: boolean, t: string) => void; onChanged: () => void;
}) {
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open');
  const rows = useMemo(() => portal.requests.filter(r =>
    filter === 'all' ? true : filter === 'open' ? !closed(r.status) : closed(r.status)), [portal.requests, filter]);

  const exportExcel = async () => {
    const { data: s } = await supabase.auth.getSession();
    downloadXlsx(`qozob-${portal.partner.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-requests`, [{
      name: 'Requests', title: `${portal.partner.name} · Qozob service requests`,
      meta: [`Data as of ${loadedAt ? loadedAt.toLocaleString('en-NG', { timeZone: 'Africa/Lagos' }) : '—'}`],
      columns: [
        { header: 'Ref', width: 11 }, { header: 'Requested', type: 'datetime' }, { header: 'Sent to you', type: 'datetime' },
        { header: 'Service', width: 40 }, { header: 'Customer', width: 24 }, { header: 'Phone', width: 16 }, { header: 'Email', width: 26 },
        { header: 'Plate', width: 12 }, { header: 'Vehicle', width: 22 }, { header: 'Chassis', width: 20 }, { header: 'State', width: 12 },
        { header: 'LGA', width: 14 }, { header: 'Address', width: 32 }, { header: 'Estimate (NGN)', type: 'money' }, { header: 'Quote (NGN)', type: 'money' },
        { header: 'Payment', width: 12 }, { header: 'Status', width: 12 }, { header: 'Notes', width: 50 }, { header: 'Last updated', type: 'datetime' },
      ],
      rows: portal.requests.map(r => [
        ref(r.id), new Date(r.created_at), r.partner_assigned_at ? new Date(r.partner_assigned_at) : null, r.service_name, r.full_name, r.phone, r.email,
        r.plate_number, [r.vehicle_make, r.vehicle_model, r.vehicle_year].filter(Boolean).join(' ') || null, r.chassis_number, r.state, r.lga,
        r.delivery_address, r.estimated_price, r.quoted_price, PAYMENT[r.payment_status] ?? r.payment_status, STATUS[r.status]?.label ?? r.status,
        r.admin_notes, new Date(r.updated_at),
      ]),
    }], { generatedBy: s.session?.user?.email });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['open', 'closed', 'all'] as const).map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
            className={cx('h-8 px-3 rounded-full text-xs font-semibold transition-colors', filter === f ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg hover:bg-surface-2')}>
            {f === 'open' ? 'Open' : f === 'closed' ? 'Completed / cancelled' : 'All'}
          </button>
        ))}
        <button type="button" onClick={exportExcel} disabled={portal.requests.length === 0} className={cx(ui.btn, ui.btnSm, ui.btnSoft, 'ml-auto h-8')}>
          <Download className="w-4 h-4" aria-hidden /> Excel
        </button>
      </div>

      {rows.length === 0 ? (
        <div className={cx(ui.card, 'p-8 text-center')}>
          <ClipboardList className="w-8 h-8 text-fg-subtle mx-auto" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-fg">{filter === 'open' ? 'No open requests' : 'Nothing here yet'}</p>
          <p className="text-xs text-fg-muted">When Qozob sends a customer request to {portal.partner.name}, it shows up here.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map(r => <RequestCard key={r.id} r={r} partnerName={portal.partner.name} flash={flash} onChanged={onChanged} />)}
        </div>
      )}
    </div>
  );
}

function RequestCard({ r, partnerName, flash, onChanged }: { r: PortalRequest; partnerName: string; flash: (ok: boolean, t: string) => void; onChanged: () => void }) {
  const isClosed = closed(r.status);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ServiceStatus>(r.status === 'pending' ? 'contacted' : r.status);
  const [quote, setQuote] = useState(r.quoted_price != null ? String(r.quoted_price) : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const lines = Array.isArray(r.details?.line_items) ? (r.details?.line_items as { title?: string; price?: number }[]) : [];
  const usage = typeof r.details?.vehicle_usage === 'string' ? (r.details.vehicle_usage as string) : null;
  const digits = r.phone.replace(/\D/g, '').replace(/^0/, '234');
  const vehicle = [r.vehicle_make, r.vehicle_model, r.vehicle_year].filter(Boolean).join(' ');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = quote.trim() === '' ? null : Number(quote);
    if (q !== null && (!Number.isFinite(q) || q < 0)) return flash(false, 'The quote must be a number of 0 or more.');
    if (status === 'cancelled' && note.trim().length < 3) return flash(false, 'Say why the request is cancelled.');
    if (status === 'completed' && !window.confirm(`Mark ${ref(r.id)} as completed? You can't change it afterwards.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('partner_update_request', {
      p_request_id: r.id, p_status: status, p_quoted_price: q, p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) return flash(false, errText(error));
    flash(true, `${ref(r.id)} updated: ${STATUS[status].label}.`);
    setNote('');
    setOpen(false);
    onChanged();
  };

  return (
    <div className={cx(ui.card, 'p-4 sm:p-5', isClosed && 'opacity-80')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-fg">{ref(r.id)}</span>
            <span className={cx(pill, STATUS[r.status]?.cls)}>{STATUS[r.status]?.label ?? r.status}</span>
            {usage && <span className={cx(pill, 'bg-surface-2 text-fg-muted border-line capitalize')}>{usage}</span>}
          </div>
          <p className="mt-1 text-sm font-semibold text-fg">{r.service_name}</p>
          <p className="text-[11px] text-fg-subtle flex items-center gap-1 mt-0.5"><Clock className="w-3 h-3" aria-hidden /> Requested {when(r.created_at)} · sent to you {when(r.partner_assigned_at)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-fg-muted">{r.quoted_price != null ? 'Quote' : 'Estimate'}</p>
          <p className="text-lg font-black text-accent tabular">{money(r.quoted_price ?? r.estimated_price)}</p>
          <p className="text-[11px] text-fg-muted">{PAYMENT[r.payment_status] ?? r.payment_status}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 text-xs">
        <div className="rounded-xl bg-surface-2 border border-line p-3 space-y-1.5">
          <p className="font-semibold text-fg">{r.full_name}</p>
          <div className="flex flex-wrap gap-2">
            <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 text-info font-semibold hover:underline"><PhoneCall className="w-3.5 h-3.5" aria-hidden />{r.phone}</a>
            <a href={`https://wa.me/${digits}?text=${encodeURIComponent(`Hello ${r.full_name}, this is ${partnerName} (Qozob partner) about your request ${ref(r.id)} for ${r.service_name}.`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-success font-semibold hover:underline"><MessageSquare className="w-3.5 h-3.5" aria-hidden />WhatsApp</a>
          </div>
          <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1 text-fg-muted hover:text-fg break-all"><Mail className="w-3.5 h-3.5 shrink-0" aria-hidden />{r.email}</a>
          <p className="flex items-start gap-1 text-fg-muted"><MapPin className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden />{[r.delivery_address, r.lga, r.state].filter(Boolean).join(', ') || '—'}</p>
        </div>
        <div className="rounded-xl bg-surface-2 border border-line p-3 space-y-1.5">
          <p className="flex items-center gap-1 font-semibold text-fg"><Car className="w-3.5 h-3.5" aria-hidden />{r.plate_number || 'No plate given'}</p>
          <p className="text-fg-muted">{vehicle || 'Vehicle not given'}{r.chassis_number ? ` · VIN ${r.chassis_number}` : ''}</p>
          {lines.length > 0 && (
            <ul className="pt-1 space-y-0.5">
              {lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-2"><span className="text-fg-muted truncate">{l.title}</span><span className="tabular text-fg">{money(typeof l.price === 'number' ? l.price : null)}</span></li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {r.admin_notes && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-fg-subtle uppercase tracking-wide">Notes (shared with Qozob)</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-fg bg-surface-2 border border-line rounded-xl p-3 max-h-40 overflow-y-auto">{r.admin_notes}</p>
        </div>
      )}

      {!isClosed && (
        open ? (
          <form onSubmit={save} className="mt-4 border-t border-line pt-4 grid gap-3 sm:grid-cols-[1fr_1fr] animate-in fade-in duration-200">
            <div>
              <label className={ui.label} htmlFor={`st-${r.id}`}>Status</label>
              <select id={`st-${r.id}`} value={status} onChange={e => setStatus(e.target.value as ServiceStatus)} className={cx(ui.select, 'h-10')}>
                {NEXT_STATUSES.map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
              </select>
            </div>
            <div>
              <label className={ui.label} htmlFor={`q-${r.id}`}>Your quote (₦)</label>
              <input id={`q-${r.id}`} type="number" min={0} step="any" inputMode="decimal" value={quote} onChange={e => setQuote(e.target.value)} className={cx(ui.input, 'h-10')} placeholder={r.estimated_price != null ? String(r.estimated_price) : 'e.g. 26000'} />
            </div>
            <div className="sm:col-span-2">
              <label className={ui.label} htmlFor={`n-${r.id}`}>Note {status === 'cancelled' ? '(required: why?)' : '(optional)'}</label>
              <textarea id={`n-${r.id}`} rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} className={cx(ui.input, 'h-auto py-2 resize-none')} placeholder="e.g. Called customer, documents collected, delivery on Friday" />
              <p className={ui.hint}>Saved with your company name and the time. Qozob can read it.</p>
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <button type="button" onClick={() => setOpen(false)} className={cx(ui.btn, ui.btnMd, ui.btnSecondary)}><X className="w-4 h-4" aria-hidden /> Cancel</button>
              <button type="submit" disabled={busy} className={cx(ui.btn, ui.btnMd, ui.btnPrimary, 'flex-1')}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : 'Save update'}</button>
            </div>
          </form>
        ) : (
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => setOpen(true)} className={cx(ui.btn, ui.btnSm, ui.btnPrimary)}>Update request</button>
          </div>
        )
      )}
    </div>
  );
}

// =========================================================================
// PRICES (propose; Qozob approves)
// =========================================================================
function PricesTab({ portal, flash, onChanged }: { portal: Portal; flash: (ok: boolean, t: string) => void; onChanged: () => void }) {
  const [proposeFor, setProposeFor] = useState<PortalService | null>(null);
  const stateLimited = portal.partner.states.length > 0;

  const withdraw = async (p: PortalProposal) => {
    if (!window.confirm('Withdraw this proposal?')) return;
    const { error } = await supabase.rpc('partner_withdraw_proposal', { p_id: p.id });
    if (error) return flash(false, errText(error));
    flash(true, 'Proposal withdrawn.');
    onChanged();
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-fg-muted">
        These are the prices customers see on Qozob for the services you deliver. To change one, propose a new price:
        it goes live only after Qozob approves it, and you can see the decision below.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        {portal.services.map(s => {
          const pending = portal.proposals.filter(p => p.service_id === s.id && p.status === 'pending');
          return (
            <div key={s.id} className={cx(ui.card, 'p-4 flex flex-col gap-3', !s.is_active && 'opacity-70')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-fg">{s.title}</p>
                  <p className="text-[11px] text-fg-muted">{SERVICE_CATEGORY_LABEL[s.category] ?? s.category}{!s.is_active ? ' · not shown to customers' : ''}</p>
                </div>
                <button type="button" onClick={() => setProposeFor(s)} className={cx(ui.btn, ui.btnSm, ui.btnPrimary, 'shrink-0')}><Tag className="w-3.5 h-3.5" aria-hidden /> Propose price</button>
              </div>
              <div className="rounded-xl bg-surface-2 border border-line p-3 text-xs space-y-1">
                <div className="flex justify-between gap-2"><span className="text-fg-muted">National · private</span><span className="font-semibold tabular">{money(s.private_price)}</span></div>
                <div className="flex justify-between gap-2"><span className="text-fg-muted">National · commercial</span><span className="font-semibold tabular">{money(s.commercial_price ?? s.private_price)}</span></div>
                {s.state_prices.map(sp => (
                  <div key={sp.state} className="flex justify-between gap-2"><span className="text-fg-muted">{sp.state}</span>
                    <span className="font-semibold tabular">{money(sp.private_price)}{sp.commercial_price !== null && sp.commercial_price !== sp.private_price ? ` / ${money(sp.commercial_price)}` : ''}</span>
                  </div>
                ))}
              </div>
              {pending.map(p => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-xs text-on-warning-soft">
                  <span>Waiting: <span className="font-bold tabular">{money(p.private_price)}</span>{p.commercial_price !== null ? ` / ${money(p.commercial_price)}` : ''} · {p.state ?? 'National'}</span>
                  <button type="button" onClick={() => withdraw(p)} className="font-semibold underline underline-offset-2">Withdraw</button>
                </div>
              ))}
            </div>
          );
        })}
        {portal.services.length === 0 && <div className={cx(ui.card, 'p-6 text-sm text-fg-muted')}>No services are linked to your company yet. Contact Qozob.</div>}
      </div>

      <div className={cx(ui.card, 'p-4')}>
        <h2 className={ui.h2}>Your proposals</h2>
        {portal.proposals.length === 0 ? (
          <p className="mt-1 text-xs text-fg-muted">No proposals yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-fg-subtle border-b border-line">
                  <th className="py-2 pr-3 font-semibold">Sent</th><th className="py-2 pr-3 font-semibold">Service</th><th className="py-2 pr-3 font-semibold">Applies to</th>
                  <th className="py-2 pr-3 font-semibold text-right">Was</th><th className="py-2 pr-3 font-semibold text-right">Proposed</th>
                  <th className="py-2 pr-3 font-semibold">Status</th><th className="py-2 font-semibold">Qozob note</th>
                </tr>
              </thead>
              <tbody>
                {portal.proposals.map(p => (
                  <tr key={p.id} className="border-b border-line last:border-0 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap text-fg-muted">{when(p.created_at)}</td>
                    <td className="py-2 pr-3 text-fg">{p.service_title ?? p.service_id}</td>
                    <td className="py-2 pr-3 text-fg-muted">{p.state ?? 'National'}</td>
                    <td className="py-2 pr-3 text-right tabular text-fg-muted">{money(p.current_private)}</td>
                    <td className="py-2 pr-3 text-right tabular font-semibold text-fg">{money(p.private_price)}{p.commercial_price !== null ? ` / ${money(p.commercial_price)}` : ''}</td>
                    <td className="py-2 pr-3"><span className={cx(pill, PROPOSAL[p.status].cls)}>{PROPOSAL[p.status].label}</span></td>
                    <td className="py-2 text-fg-muted">{p.review_note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {proposeFor && (
        <ProposeDialog service={proposeFor} states={stateLimited ? portal.partner.states : null} onClose={() => setProposeFor(null)}
          onDone={msg => { flash(true, msg); setProposeFor(null); onChanged(); }} onError={msg => flash(false, msg)} />
      )}
    </div>
  );
}

function ProposeDialog({ service, states, onClose, onDone, onError }: {
  service: PortalService; states: string[] | null; onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void;
}) {
  // State-limited partners price their own states; others can price nationally or for any state
  const scopes = states ?? ['', ...NIGERIAN_STATES];
  const [scope, setScope] = useState(scopes[0]);
  const [priv, setPriv] = useState('');
  const [comm, setComm] = useState('');
  const [ratePct, setRatePct] = useState(service.rate_percent != null ? String(service.rate_percent) : '');
  const [showTiers, setShowTiers] = useState(() => Boolean(service.tier_prices && Object.keys(service.tier_prices).length > 0));
  const [tierInputs, setTierInputs] = useState<Record<VehicleTier, { priv: string; comm: string }>>(() => {
    const out: Record<VehicleTier, { priv: string; comm: string }> = {
      saloon_small: { priv: '', comm: '' },
      saloon_large: { priv: '', comm: '' },
      suv_pickup: { priv: '', comm: '' },
      bus: { priv: '', comm: '' },
      truck: { priv: '', comm: '' },
      motorcycle: { priv: '', comm: '' },
    };
    const baseTiers = service.tier_prices ?? {};
    for (const t of VEHICLE_TIERS) {
      const e = baseTiers[t.key];
      if (e) {
        out[t.key] = {
          priv: e.private != null ? String(e.private) : '',
          comm: e.commercial != null ? String(e.commercial) : '',
        };
      }
    }
    return out;
  });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const supportsRate = service.rate_percent != null || service.id === 'comprehensive_insurance';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sp = scope ? service.state_prices.find(s => s.state === scope) : undefined;
  const curPriv = sp ? sp.private_price : service.private_price;
  const curComm = sp ? sp.commercial_price : service.commercial_price;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = priv.trim() === '' ? null : Number(priv);
    const c = comm.trim() === '' ? null : Number(comm);
    const r = !scope && supportsRate && ratePct.trim() !== '' ? Number(ratePct) : null;
    if (p === null || !Number.isFinite(p) || p < 0 || (c !== null && (!Number.isFinite(c) || c < 0))) return onError('Enter prices of 0 or more. The private price is required.');
    if (r !== null && (!Number.isFinite(r) || r < 0 || r > 100)) return onError('Rate % must be between 0 and 100.');

    const tierPayload: TierPriceMap = {};
    if (showTiers) {
      for (const t of VEHICLE_TIERS) {
        const tp = tierInputs[t.key].priv.trim() === '' ? null : Number(tierInputs[t.key].priv);
        const tc = tierInputs[t.key].comm.trim() === '' ? null : Number(tierInputs[t.key].comm);
        if ((tp !== null && (!Number.isFinite(tp) || tp < 0)) || (tc !== null && (!Number.isFinite(tc) || tc < 0))) {
          return onError(`Tier price for ${t.short} must be 0 or more.`);
        }
        if (tp !== null || tc !== null) tierPayload[t.key] = { private: tp, commercial: tc };
      }
    }

    setBusy(true);
    let { error } = await supabase.rpc('partner_propose_price', {
      p_service_id: service.id,
      p_state: scope || null,
      p_private: p,
      p_commercial: c,
      p_note: note.trim() || null,
      p_tier_prices: showTiers ? tierPayload : null,
      p_rate_percent: r,
    });
    if (error && /function|p_tier_prices/i.test(error.message)) {
      ({ error } = await supabase.rpc('partner_propose_price', {
        p_service_id: service.id, p_state: scope || null, p_private: p, p_commercial: c, p_note: note.trim() || null,
      }));
    }
    setBusy(false);
    if (error) return onError(errText(error));
    onDone(`Sent to Qozob for approval: ${service.title}${scope ? ` (${scope})` : ''} at ${money(p)}. The current price stays until it is approved.`);
  };

  return (
    <div className={cx(ui.overlay, 'z-50')} onClick={onClose}>
      <div className={cx(ui.modal, 'max-w-lg p-0 overflow-hidden')} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pp-title">
        <div className="p-5 border-b border-line">
          <h3 id="pp-title" className="text-base font-bold text-fg">Propose a new price</h3>
          <p className="text-xs text-fg-muted">{service.title}</p>
          <button type="button" onClick={onClose} className={ui.modalClose} aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className={ui.label} htmlFor="pp-scope">Applies to</label>
            <select id="pp-scope" value={scope} onChange={e => setScope(e.target.value)} className={ui.select}>
              {scopes.map(s => <option key={s || 'national'} value={s}>{s || 'National price (all states)'}</option>)}
            </select>
            <p className={ui.hint}>Now: {money(curPriv)} private · {money(curComm ?? curPriv)} commercial{scope && !sp ? ' (national price)' : ''}</p>
          </div>
          <div className={cx('grid gap-3', !scope && supportsRate ? 'grid-cols-3' : 'grid-cols-2')}>
            <div>
              <label className={ui.label} htmlFor="pp-priv">{supportsRate ? 'Min. Private (₦) *' : 'Private (₦) *'}</label>
              <input id="pp-priv" type="number" min={0} step="any" inputMode="decimal" required value={priv} onChange={e => setPriv(e.target.value)} className={ui.input} placeholder={String(curPriv)} />
            </div>
            <div>
              <label className={ui.label} htmlFor="pp-comm">{supportsRate ? 'Min. Commercial (₦)' : 'Commercial (₦)'}</label>
              <input id="pp-comm" type="number" min={0} step="any" inputMode="decimal" value={comm} onChange={e => setComm(e.target.value)} className={ui.input} placeholder="Same as private" />
            </div>
            {!scope && supportsRate && (
              <div>
                <label className={ui.label} htmlFor="pp-rate">Rate (% of value)</label>
                <input id="pp-rate" type="number" min={0} max={100} step="0.1" inputMode="decimal" value={ratePct} onChange={e => setRatePct(e.target.value)} className={ui.input} placeholder="e.g. 3.5" />
              </div>
            )}
          </div>

          {!supportsRate && (
            <div className="rounded-2xl border border-line bg-surface-2 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-fg">Engine / Body-Type Tier Prices</span>
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg cursor-pointer">
                  <input type="checkbox" checked={showTiers} onChange={e => setShowTiers(e.target.checked)} className="h-4 w-4 accent-primary" />
                  <span>Include tier prices</span>
                </label>
              </div>
              {showTiers && (
                <div className="space-y-1.5 pt-1">
                  {VEHICLE_TIERS.map(t => (
                    <div key={t.key} className="grid grid-cols-12 gap-2 items-center">
                      <span className="col-span-6 text-[11px] font-semibold text-fg truncate" title={t.label}>{t.short}</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        placeholder={priv || String(curPriv)}
                        value={tierInputs[t.key].priv}
                        onChange={e => setTierInputs(prev => ({ ...prev, [t.key]: { ...prev[t.key], priv: e.target.value } }))}
                        className={cx(ui.input, 'col-span-3 h-8 text-xs px-2')}
                        aria-label={`${t.short} private price`}
                      />
                      <input
                        type="number"
                        min={0}
                        step="any"
                        placeholder={comm || 'Same'}
                        value={tierInputs[t.key].comm}
                        onChange={e => setTierInputs(prev => ({ ...prev, [t.key]: { ...prev[t.key], comm: e.target.value } }))}
                        className={cx(ui.input, 'col-span-3 h-8 text-xs px-2')}
                        aria-label={`${t.short} commercial price`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className={ui.label} htmlFor="pp-note">Why? (helps Qozob approve faster)</label>
            <input id="pp-note" value={note} onChange={e => setNote(e.target.value)} className={ui.input} maxLength={300} placeholder="e.g. New government tariff from 1 Dec" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnMd, ui.btnSecondary, 'flex-1')}>Cancel</button>
            <button type="submit" disabled={busy} className={cx(ui.btn, ui.btnMd, ui.btnPrimary, 'flex-1')}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : 'Send for approval'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
