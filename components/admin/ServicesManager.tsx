"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText, RefreshCw, CheckCircle2, Clock, PhoneCall, MessageSquare, Edit3, Loader2, Banknote, X, Ticket, AlertTriangle, Wallet,
} from 'lucide-react';

import { createClient } from '@/utils/supabase/client';
import type { ServiceRequest, ServiceStatus, PaymentStatus } from '@/types/services';
import { StatCard } from '@/components/analytics/StatCard';
import { ReportTable, type ReportColumn } from './ReportTable';
import { fetchAllRows } from '@/lib/fetchAll';
import { cx, ui } from '@/lib/ui';

// =========================================================================
// ADMIN → AUTO SERVICES
// Requests from /services (papers, registration, insurance, trackers).
// Every list can be filtered, column-picked and downloaded to Excel; reward
// vouchers are redeemed through admin_redeem_voucher (checked in the DB).
// =========================================================================

const supabase = createClient();

const STATUS: Record<ServiceStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-warning-soft text-on-warning-soft border-warning-line' },
  contacted: { label: 'Contacted', cls: 'bg-info-soft text-on-info-soft border-info-line' },
  quoted: { label: 'Quoted', cls: 'bg-info-soft text-on-info-soft border-info-line' },
  in_progress: { label: 'In progress', cls: 'bg-primary/10 text-primary border-primary/30' },
  completed: { label: 'Completed', cls: 'bg-success-soft text-on-success-soft border-success-line' },
  cancelled: { label: 'Cancelled', cls: 'bg-surface-2 text-fg-muted border-line' },
};
const PAYMENT: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid', partially_paid: 'Part paid', paid: 'Paid', voucher_used: 'Voucher used',
};
const CATEGORY: Record<string, string> = {
  papers_renewal: 'Papers renewal', new_registration: 'New registration', auto_insurance: 'Auto insurance',
  gps_tracker: 'GPS tracker', fleet_solution: 'Fleet solution',
};

const ref = (r: ServiceRequest) => `#${r.id.slice(0, 8).toUpperCase()}`;
const money = (n: number | null | undefined) => (n == null ? '—' : `₦${Number(n).toLocaleString('en-NG')}`);
const value = (r: ServiceRequest) => Number(r.quoted_price ?? r.estimated_price ?? 0);
const errText = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Something went wrong.');

export function ServicesManager() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | ServiceStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selected, setSelected] = useState<ServiceRequest | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const flash = useCallback((ok: boolean, text: string) => {
    setNotice({ ok, text });
    setTimeout(() => setNotice(null), 6000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchAllRows<ServiceRequest>((a, b) => supabase.from('service_requests').select('*').order('created_at', { ascending: false }).range(a, b));
    setLoadError(res.error ? res.error.message : '');
    setRequests(res.rows);
    setLoadedAt(new Date());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const live = requests.filter(r => r.status !== 'cancelled');
    return {
      total: requests.length,
      open: requests.filter(r => r.status !== 'completed' && r.status !== 'cancelled').length,
      pending: requests.filter(r => r.status === 'pending').length,
      completed: requests.filter(r => r.status === 'completed').length,
      pipeline: live.filter(r => r.status !== 'completed').reduce((a, r) => a + value(r), 0),
      collected: requests.reduce((a, r) => a + Number(r.paid_price ?? (r.payment_status === 'paid' ? value(r) : 0)), 0),
    };
  }, [requests]);

  const filtered = useMemo(() => requests.filter(r => {
    if (statusFilter === 'open' && (r.status === 'completed' || r.status === 'cancelled')) return false;
    if (statusFilter !== 'all' && statusFilter !== 'open' && r.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && r.service_category !== categoryFilter) return false;
    return true;
  }), [requests, statusFilter, categoryFilter]);

  const columns = useMemo<ReportColumn<ServiceRequest>[]>(() => [
    { key: 'ref', header: 'Ref', get: r => ref(r), render: r => <span className="font-mono font-bold text-fg">{ref(r)}</span> },
    { key: 'created', header: 'Requested', get: r => r.created_at, type: 'datetime' },
    {
      key: 'customer', header: 'Customer', get: r => r.full_name, width: 24,
      render: r => <span><span className="font-semibold text-fg block">{r.full_name}</span><span className="text-xs text-fg-muted">{r.phone}</span></span>,
    },
    { key: 'phone', header: 'Phone', get: r => r.phone, defaultVisible: false },
    { key: 'email', header: 'Email', get: r => r.email, defaultVisible: false, width: 28 },
    {
      key: 'service', header: 'Service', get: r => r.service_name, width: 32,
      render: r => (
        <span className="block max-w-[220px]">
          <span className="block truncate font-medium text-fg" title={r.service_name}>{r.service_name}</span>
          {r.voucher_code && <span className="inline-flex items-center gap-1 mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-success-soft text-on-success-soft"><Ticket className="w-3 h-3" aria-hidden />{r.voucher_code}</span>}
        </span>
      ),
    },
    { key: 'category', header: 'Category', get: r => CATEGORY[r.service_category] ?? r.service_category },
    { key: 'plate', header: 'Plate', get: r => r.plate_number ?? null, render: r => (r.plate_number ? <span className="font-mono font-semibold">{r.plate_number}</span> : <span className="text-fg-subtle">—</span>) },
    { key: 'vehicle', header: 'Vehicle', get: r => [r.vehicle_make, r.vehicle_model, r.vehicle_year].filter(Boolean).join(' ') || null },
    { key: 'chassis', header: 'Chassis no.', get: r => r.chassis_number ?? null, defaultVisible: false },
    { key: 'state', header: 'State', get: r => r.state ?? null },
    { key: 'lga', header: 'LGA', get: r => r.lga ?? null, defaultVisible: false },
    { key: 'address', header: 'Delivery address', get: r => r.delivery_address ?? null, defaultVisible: false, width: 36 },
    { key: 'estimated', header: 'Estimate', get: r => r.estimated_price ?? null, type: 'money', align: 'right', defaultVisible: false },
    { key: 'quoted', header: 'Quote', get: r => r.quoted_price ?? r.estimated_price ?? null, type: 'money', align: 'right' },
    { key: 'paid', header: 'Received', get: r => r.paid_price ?? null, type: 'money', align: 'right', defaultVisible: false },
    { key: 'payment', header: 'Payment', get: r => PAYMENT[r.payment_status] ?? r.payment_status },
    {
      key: 'status', header: 'Status', get: r => STATUS[r.status]?.label ?? r.status,
      render: r => <span className={cx('inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap', STATUS[r.status]?.cls)}>{STATUS[r.status]?.label ?? r.status}</span>,
    },
    { key: 'voucher', header: 'Voucher', get: r => r.voucher_code ?? null, defaultVisible: false },
    { key: 'assigned', header: 'Assigned to', get: r => r.assigned_to ?? null, defaultVisible: false },
    { key: 'notes', header: 'Admin notes', get: r => r.admin_notes ?? null, defaultVisible: false, width: 40 },
    { key: 'account', header: 'Signed-in request', get: r => Boolean(r.user_id), type: 'boolean', defaultVisible: false },
    { key: 'updated', header: 'Last updated', get: r => r.updated_at, type: 'datetime', defaultVisible: false },
    { key: 'id', header: 'Request ID', get: r => r.id, defaultVisible: false },
  ], []);

  const statusOptions: [typeof statusFilter, string][] = [['all', 'All statuses'], ['open', 'Open (not completed)'], ...Object.entries(STATUS).map(([k, v]) => [k as ServiceStatus, v.label] as [ServiceStatus, string])];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className={cx(ui.h1, 'flex items-center gap-2')}><FileText className="w-7 h-7 text-primary" aria-hidden /> Auto services</h2>
          <p className={cx(ui.body, 'mt-1')}>Vehicle papers, registration, insurance and tracker requests. Click a card to filter.</p>
        </div>
      </div>

      {notice && (
        <div className={notice.ok ? ui.alertSuccess : ui.alertError} role="status">
          {notice.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />} {notice.text}
        </div>
      )}
      {loadError && (
        <div className={ui.alertWarning}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /><span>Could not load requests: {loadError}. Run <code>supabase/migrations/20261013_monetization_and_services.sql</code> if the table is missing.</span></div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="All requests" value={stats.total.toLocaleString('en-NG')} subtitle={`${stats.open} open`} icon={FileText} colorTheme="indigo" onClick={() => setStatusFilter('all')} />
        <StatCard title="Needs action" value={stats.pending.toLocaleString('en-NG')} subtitle="Not yet contacted" icon={Clock} colorTheme="amber" badge={stats.pending ? { text: 'Action', variant: 'warning' } : undefined} onClick={() => setStatusFilter('pending')} />
        <StatCard title="Completed" value={stats.completed.toLocaleString('en-NG')} subtitle={`Collected ${money(stats.collected)}`} icon={CheckCircle2} colorTheme="emerald" onClick={() => setStatusFilter('completed')} />
        <StatCard title="Open pipeline" value={money(stats.pipeline)} subtitle="Quotes / estimates not yet completed" icon={Banknote} colorTheme="blue" onClick={() => setStatusFilter('open')} />
      </div>

      <ReportTable
        id="admin-services"
        title="Auto service requests"
        rows={filtered}
        columns={columns}
        rowKey={r => r.id}
        loading={loading}
        loadedAt={loadedAt}
        onRefresh={load}
        meta={[
          `Status: ${statusOptions.find(([k]) => k === statusFilter)?.[1] ?? statusFilter}`,
          `Category: ${categoryFilter === 'all' ? 'All' : CATEGORY[categoryFilter] ?? categoryFilter}`,
        ]}
        initialSort={{ key: 'created', dir: 'desc' }}
        searchPlaceholder="Search name, phone, plate, service…"
        emptyText="No service requests match. New orders from /services appear here."
        toolbar={(
          <>
            <select className={cx(ui.select, 'h-10 w-auto')} value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} aria-label="Status">
              {statusOptions.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select className={cx(ui.select, 'h-10 w-auto')} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} aria-label="Category">
              <option value="all">All categories</option>
              {Object.entries(CATEGORY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </>
        )}
        rowActions={r => {
          const digits = r.phone.replace(/\D/g, '').replace(/^0/, '234');
          const wa = `https://wa.me/${digits}?text=${encodeURIComponent(`Hello ${r.full_name}, this is Qozob about your request ${ref(r)} for ${r.service_name}.`)}`;
          return (
            <div className="flex justify-end gap-1">
              <a href={wa} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-success hover:bg-success-soft" title="WhatsApp" aria-label={`WhatsApp ${r.full_name}`}><MessageSquare className="w-4 h-4" /></a>
              <a href={`tel:${r.phone}`} className="p-1.5 rounded-lg text-info hover:bg-info-soft" title="Call" aria-label={`Call ${r.full_name}`}><PhoneCall className="w-4 h-4" /></a>
              <button type="button" onClick={() => setSelected(r)} className="p-1.5 rounded-lg text-fg hover:bg-surface-2" title="Manage" aria-label={`Manage ${ref(r)}`}><Edit3 className="w-4 h-4" /></button>
            </div>
          );
        }}
      />

      {selected && (
        <RequestEditor
          req={selected}
          onClose={() => setSelected(null)}
          onSaved={(msg) => { flash(true, msg); setSelected(null); load(); }}
          onError={(msg) => flash(false, msg)}
        />
      )}
    </div>
  );
}

function RequestEditor({ req, onClose, onSaved, onError }: {
  req: ServiceRequest; onClose: () => void; onSaved: (msg: string) => void; onError: (msg: string) => void;
}) {
  const [status, setStatus] = useState<ServiceStatus>(req.status);
  const [payment, setPayment] = useState<PaymentStatus>(req.payment_status);
  const [quoted, setQuoted] = useState(req.quoted_price != null ? String(req.quoted_price) : req.estimated_price != null ? String(req.estimated_price) : '');
  const [paid, setPaid] = useState(req.paid_price != null ? String(req.paid_price) : '');
  const [assigned, setAssigned] = useState(req.assigned_to ?? '');
  const [notes, setNotes] = useState(req.admin_notes ?? '');
  const [code, setCode] = useState(req.voucher_code ?? '');
  const [busy, setBusy] = useState(false);
  const voucherDone = req.payment_status === 'voucher_used';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const num = (s: string) => (s.trim() === '' ? null : Number(s));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = num(quoted); const p = num(paid);
    if ((q !== null && (!Number.isFinite(q) || q < 0)) || (p !== null && (!Number.isFinite(p) || p < 0))) return onError('Prices must be positive numbers.');
    setBusy(true);
    const { error } = await supabase.from('service_requests').update({
      status, payment_status: payment, quoted_price: q, paid_price: p,
      assigned_to: assigned.trim() || null, admin_notes: notes.trim() || null, updated_at: new Date().toISOString(),
    }).eq('id', req.id);
    setBusy(false);
    if (error) return onError(`Could not save: ${error.message}`);
    onSaved(`Saved ${ref(req)}.`);
  };

  const redeem = async () => {
    if (!code.trim()) return onError('Enter the voucher code the customer gave you.');
    if (!window.confirm(`Redeem voucher ${code.trim().toUpperCase()} against ${ref(req)}? It can only be used once.`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_redeem_voucher', { p_request_id: req.id, p_code: code.trim() });
    setBusy(false);
    if (error) return onError(errText(error));
    const v = (data as { value_ngn?: number } | null)?.value_ngn;
    onSaved(`Voucher redeemed${v ? ` (worth ${money(v)})` : ''}. The prize is now marked as paid.`);
  };

  const row = (label: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-3"><span className="text-fg-muted shrink-0">{label}</span><span className="font-medium text-fg text-right break-words min-w-0">{v || '—'}</span></div>
  );

  return (
    <div className={cx(ui.overlay, 'z-50')} onClick={onClose}>
      <div className={cx(ui.modal, 'max-w-xl p-0 overflow-hidden animate-in fade-in zoom-in-95 duration-200')} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="sr-title">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-line">
          <div className="min-w-0">
            <h3 id="sr-title" className="text-base font-bold text-fg">Manage {ref(req)}</h3>
            <p className="text-xs text-fg-muted truncate">{req.service_name}</p>
          </div>
          <button type="button" onClick={onClose} className={ui.modalClose} aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="p-3.5 rounded-xl bg-surface-2 border border-line space-y-1.5 text-xs">
            {row('Customer', req.full_name)}
            {row('Phone / WhatsApp', req.phone)}
            {row('Email', req.email)}
            {row('Vehicle', [req.plate_number, [req.vehicle_make, req.vehicle_model, req.vehicle_year].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}
            {req.chassis_number && row('Chassis', req.chassis_number)}
            {row('Location', [req.lga, req.state].filter(Boolean).join(', '))}
            {req.delivery_address && row('Delivery address', req.delivery_address)}
            {row('Requested', new Date(req.created_at).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' }))}
            {row('Account', req.user_id ? 'Signed in' : 'Guest (cannot use a reward voucher)')}
          </div>

          <div className="rounded-xl border border-line p-3.5">
            <p className="text-sm font-semibold text-fg flex items-center gap-2"><Ticket className="w-4 h-4 text-success" aria-hidden /> Reward voucher</p>
            {voucherDone ? (
              <p className="mt-1 text-xs text-on-success-soft">Voucher {req.voucher_code} has been redeemed on this request.</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-fg-muted">If the customer won a Qozob service voucher, enter the code to apply it. It must belong to the same signed-in account.</p>
                <div className="mt-2 flex gap-2">
                  <input className={cx(ui.input, 'h-10 font-mono uppercase')} value={code} onChange={e => setCode(e.target.value)} placeholder="QZ-VCH-XXXXXXXX" aria-label="Voucher code" />
                  <button type="button" disabled={busy || !req.user_id} onClick={redeem} className={cx(ui.btn, ui.btnSm, ui.btnSuccess, 'h-10 shrink-0')}><Wallet className="w-4 h-4" aria-hidden /> Redeem</button>
                </div>
              </>
            )}
          </div>

          <form onSubmit={save} className="space-y-3.5">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className={ui.label} htmlFor="sr-status">Order status</label>
                <select id="sr-status" value={status} onChange={e => setStatus(e.target.value as ServiceStatus)} className={ui.select}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className={ui.label} htmlFor="sr-pay">Payment</label>
                <select id="sr-pay" value={payment} onChange={e => setPayment(e.target.value as PaymentStatus)} className={ui.select} disabled={voucherDone}>
                  {(Object.keys(PAYMENT) as PaymentStatus[]).filter(k => k !== 'voucher_used' || voucherDone).map(k => <option key={k} value={k}>{PAYMENT[k]}</option>)}
                </select>
              </div>
              <div>
                <label className={ui.label} htmlFor="sr-quote">Quote / final price (₦)</label>
                <input id="sr-quote" type="number" min={0} step="any" inputMode="decimal" value={quoted} onChange={e => setQuoted(e.target.value)} className={ui.input} placeholder="e.g. 26000" />
              </div>
              <div>
                <label className={ui.label} htmlFor="sr-paid">Amount received (₦)</label>
                <input id="sr-paid" type="number" min={0} step="any" inputMode="decimal" value={paid} onChange={e => setPaid(e.target.value)} className={ui.input} placeholder="Leave empty if none" />
              </div>
            </div>
            <div>
              <label className={ui.label} htmlFor="sr-assigned">Assigned to</label>
              <input id="sr-assigned" value={assigned} onChange={e => setAssigned(e.target.value)} className={ui.input} placeholder="Agent or partner handling it" />
            </div>
            <div>
              <label className={ui.label} htmlFor="sr-notes">Admin notes</label>
              <textarea id="sr-notes" rows={3} value={notes} onChange={e => setNotes(e.target.value)} className={ui.input} placeholder="e.g. Called customer, documents submitted, install booked for Friday…" />
            </div>
            <div className="pt-1 flex gap-2">
              <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnMd, ui.btnSecondary, 'flex-1')}>Cancel</button>
              <button type="submit" disabled={busy} className={cx(ui.btn, ui.btnMd, ui.btnPrimary, 'flex-1')}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : 'Save changes'}</button>
            </div>
          </form>
          <p className="text-[11px] text-fg-subtle flex items-center gap-1"><RefreshCw className="w-3 h-3" aria-hidden /> Last updated {new Date(req.updated_at).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}</p>
        </div>
      </div>
    </div>
  );
}
