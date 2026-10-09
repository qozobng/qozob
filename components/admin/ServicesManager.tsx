"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText, Radio, Search, Filter, RefreshCw, CheckCircle2,
  Clock, PhoneCall, Mail, MessageSquare, AlertCircle, Edit3,
  Loader2, DollarSign, User, MapPin, Car, Shield, ExternalLink, X
} from 'lucide-react';

import { createClient } from '@/utils/supabase/client';
import { ServiceRequest, ServiceStatus, PaymentStatus, ServiceCategory } from '@/types/services';
import { StatCard } from '@/components/analytics/StatCard';
import { cx, ui } from '@/lib/ui';

export function ServicesManager() {
  const supabase = createClient();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected for edit / view modal
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [editStatus, setEditStatus] = useState<ServiceStatus>('pending');
  const [editPaymentStatus, setEditPaymentStatus] = useState<PaymentStatus>('unpaid');
  const [editQuotedPrice, setEditQuotedPrice] = useState<string>('');
  const [editAdminNotes, setEditAdminNotes] = useState<string>('');

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('service_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching service requests:', error.message);
    } else {
      setRequests(data || []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleOpenModal = (req: ServiceRequest) => {
    setSelectedRequest(req);
    setEditStatus(req.status);
    setEditPaymentStatus(req.payment_status);
    setEditQuotedPrice(req.quoted_price ? String(req.quoted_price) : req.estimated_price ? String(req.estimated_price) : '');
    setEditAdminNotes(req.admin_notes || '');
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;

    setIsUpdating(true);
    const quoted = editQuotedPrice ? parseFloat(editQuotedPrice) : null;

    const { error } = await supabase
      .from('service_requests')
      .update({
        status: editStatus,
        payment_status: editPaymentStatus,
        quoted_price: quoted,
        admin_notes: editAdminNotes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedRequest.id);

    setIsUpdating(false);

    if (error) {
      alert('Error updating request: ' + error.message);
    } else {
      setSelectedRequest(null);
      loadRequests();
    }
  };

  // KPIs
  const stats = useMemo(() => {
    const total = requests.length;
    const pending = requests.filter(r => r.status === 'pending').length;
    const completed = requests.filter(r => r.status === 'completed').length;
    const totalQuotedValue = requests.reduce((acc, curr) => acc + Number(curr.quoted_price || curr.estimated_price || 0), 0);

    return { total, pending, completed, totalQuotedValue };
  }, [requests]);

  // Filtered requests
  const filtered = useMemo(() => {
    return requests.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && r.service_category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          (r.full_name || '').toLowerCase().includes(q) ||
          (r.phone || '').toLowerCase().includes(q) ||
          (r.email || '').toLowerCase().includes(q) ||
          (r.plate_number || '').toLowerCase().includes(q) ||
          (r.service_name || '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [requests, statusFilter, categoryFilter, searchQuery]);

  const statusBadge = (s: ServiceStatus) => {
    switch (s) {
      case 'pending':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">Pending</span>;
      case 'contacted':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">Contacted</span>;
      case 'quoted':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">Quoted</span>;
      case 'in_progress':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">In Progress</span>;
      case 'completed':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">Completed</span>;
      case 'cancelled':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">Cancelled</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface p-6 rounded-2xl border border-line">
        <div>
          <h2 className="text-xl font-bold text-fg flex items-center gap-2">
            <FileText className="w-5 h-5 text-accent" />
            <span>Auto Services & Revenue Queue</span>
          </h2>
          <p className="text-xs text-fg-muted mt-1">
            Manage customer vehicle papers renewals, NIID auto insurance quotes, and 4G GPS tracker installation orders.
          </p>
        </div>
        <button
          type="button"
          onClick={loadRequests}
          disabled={loading}
          className={cx(ui.btn, 'px-3 py-2 text-xs font-semibold border border-line bg-surface-2 hover:bg-surface-3')}
        >
          <RefreshCw className={cx('w-3.5 h-3.5 mr-1.5', loading && 'animate-spin')} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Inquiries"
          value={stats.total.toLocaleString()}
          subtitle="All time customer requests"
          icon={FileText}
          colorTheme="indigo"
        />
        <StatCard
          title="Needs Action"
          value={stats.pending.toLocaleString()}
          subtitle="Pending follow-up"
          icon={Clock}
          colorTheme="amber"
          badge={stats.pending > 0 ? { text: 'Pending', variant: 'warning' } : undefined}
        />
        <StatCard
          title="Completed Orders"
          value={stats.completed.toLocaleString()}
          subtitle="Fulfillments finalized"
          icon={CheckCircle2}
          colorTheme="emerald"
        />
        <StatCard
          title="Pipeline Value"
          value={`₦${stats.totalQuotedValue.toLocaleString()}`}
          subtitle="Estimated order volume"
          icon={DollarSign}
          colorTheme="blue"
        />
      </div>

      {/* Filters Bar */}
      <div className="bg-surface p-4 rounded-2xl border border-line flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, phone, plate number or email…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={cx(ui.input, 'pl-9 text-xs')}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className={cx(ui.select, 'text-xs w-auto py-2')}
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="contacted">Contacted</option>
            <option value="quoted">Quoted</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className={cx(ui.select, 'text-xs w-auto py-2')}
          >
            <option value="all">All Categories</option>
            <option value="papers_renewal">Vehicle Papers Renewal</option>
            <option value="auto_insurance">Auto Insurance</option>
            <option value="gps_tracker">4G GPS Tracker</option>
            <option value="new_registration">New Registration</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      {loading ? (
        <div className="p-12 text-center text-fg-muted bg-surface rounded-2xl border border-line">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-accent mb-2" />
          <p className="text-xs">Loading orders…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center text-fg-muted bg-surface rounded-2xl border border-line">
          <p className="text-sm font-semibold">No service requests found</p>
          <p className="text-xs text-fg-subtle mt-1">Incoming customer orders from /services will appear here.</p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-line overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 border-b border-line text-fg-muted font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Ref / Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Service Requested</th>
                  <th className="px-4 py-3">Vehicle / Plate</th>
                  <th className="px-4 py-3">State / Location</th>
                  <th className="px-4 py-3">Price (₦)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map(req => {
                  const rawPhone = req.phone.replace(/\D/g, '');
                  const waUrl = `https://wa.me/${rawPhone}?text=${encodeURIComponent(`Hello ${req.full_name}, regarding your Qozob service request #${req.id.slice(0, 8).toUpperCase()} for ${req.service_name}...`)}`;

                  return (
                    <tr key={req.id} className="hover:bg-surface-2/60 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono font-bold text-fg">#{req.id.slice(0, 8).toUpperCase()}</span>
                        <span className="text-[10px] text-fg-subtle block">
                          {new Date(req.created_at).toLocaleDateString()}
                        </span>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-bold text-fg block">{req.full_name}</span>
                        <span className="text-[11px] text-fg-muted block">{req.phone}</span>
                      </td>

                      <td className="px-4 py-3 max-w-[200px]">
                        <span className="font-semibold text-fg block truncate" title={req.service_name}>
                          {req.service_name}
                        </span>
                        {req.voucher_code && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            Voucher: {req.voucher_code}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {req.plate_number ? (
                          <span className="font-mono font-bold text-fg bg-surface-2 px-1.5 py-0.5 rounded border border-line">
                            {req.plate_number}
                          </span>
                        ) : (
                          <span className="text-fg-subtle italic">Unset</span>
                        )}
                        <span className="text-[10px] text-fg-muted block mt-0.5">
                          {req.vehicle_make || ''} {req.vehicle_model || ''}
                        </span>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-fg-muted">
                        <span>{req.state || '---'}</span>
                        {req.lga && <span className="text-[10px] block text-fg-subtle">{req.lga}</span>}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap font-bold text-fg tabular">
                        ₦{Number(req.quoted_price || req.estimated_price || 0).toLocaleString()}
                        <span className="text-[10px] text-fg-subtle font-normal block capitalize">{req.payment_status}</span>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {statusBadge(req.status)}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-right space-x-1.5">
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex p-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                          title="Message on WhatsApp"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </a>
                        <a
                          href={`tel:${req.phone}`}
                          className="inline-flex p-1.5 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 hover:bg-blue-500/25 transition-colors"
                          title="Call Customer"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleOpenModal(req)}
                          className="inline-flex p-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-fg transition-colors"
                          title="View / Edit Quote"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review / Quote Modal */}
      {selectedRequest && (
        <div className={cx(ui.overlay, 'z-50')} onClick={() => setSelectedRequest(null)}>
          <div className={cx(ui.modal, 'max-w-xl p-6')} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
              <div>
                <h3 className="text-base font-bold text-fg">
                  Manage Service Order #{selectedRequest.id.slice(0, 8).toUpperCase()}
                </h3>
                <p className="text-xs text-fg-muted">{selectedRequest.service_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className={ui.modalClose}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Customer Details Box */}
              <div className="p-3.5 rounded-xl bg-surface-2 border border-line space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-fg-muted">Customer Name:</span>
                  <span className="font-bold text-fg">{selectedRequest.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-muted">Phone / WhatsApp:</span>
                  <span className="font-semibold text-fg">{selectedRequest.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-muted">Email:</span>
                  <span className="font-semibold text-fg">{selectedRequest.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-muted">Plate / Vehicle:</span>
                  <span className="font-semibold text-fg">
                    {selectedRequest.plate_number || 'None'} ({selectedRequest.vehicle_make || ''} {selectedRequest.vehicle_model || ''})
                  </span>
                </div>
                {selectedRequest.delivery_address && (
                  <div className="flex justify-between">
                    <span className="text-fg-muted">Delivery Address:</span>
                    <span className="font-semibold text-fg text-right max-w-[280px] truncate">{selectedRequest.delivery_address}</span>
                  </div>
                )}
                {selectedRequest.voucher_code && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                    <span>Reward Voucher:</span>
                    <span>{selectedRequest.voucher_code}</span>
                  </div>
                )}
              </div>

              {/* Edit Form */}
              <form onSubmit={handleSaveModal} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={ui.label} htmlFor="m-status">Order Status</label>
                    <select
                      id="m-status"
                      value={editStatus}
                      onChange={e => setEditStatus(e.target.value as ServiceStatus)}
                      className={ui.select}
                    >
                      <option value="pending">Pending</option>
                      <option value="contacted">Contacted</option>
                      <option value="quoted">Quoted</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  <div>
                    <label className={ui.label} htmlFor="m-pay">Payment Status</label>
                    <select
                      id="m-pay"
                      value={editPaymentStatus}
                      onChange={e => setEditPaymentStatus(e.target.value as PaymentStatus)}
                      className={ui.select}
                    >
                      <option value="unpaid">Unpaid</option>
                      <option value="partially_paid">Partially Paid</option>
                      <option value="paid">Paid</option>
                      <option value="voucher_used">Voucher Used</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={ui.label} htmlFor="m-quote">Quoted / Final Price (₦)</label>
                  <input
                    id="m-quote"
                    type="number"
                    step="any"
                    placeholder="e.g. 26000"
                    value={editQuotedPrice}
                    onChange={e => setEditQuotedPrice(e.target.value)}
                    className={cx(ui.input, 'font-bold text-accent')}
                  />
                </div>

                <div>
                  <label className={ui.label} htmlFor="m-notes">Admin Notes / Tracking Details</label>
                  <textarea
                    id="m-notes"
                    rows={2}
                    placeholder="e.g. Called customer, documents submitted to VIO, tracker scheduled for Friday..."
                    value={editAdminNotes}
                    onChange={e => setEditAdminNotes(e.target.value)}
                    className={ui.input}
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRequest(null)}
                    className={cx(ui.btn, 'flex-1 py-2 text-xs border border-line')}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdating}
                    className={cx(ui.btn, ui.btnPrimary, 'flex-1 py-2 text-xs font-bold')}
                  >
                    {isUpdating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Order Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
