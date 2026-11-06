"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Car, Plus, Radio, AlertTriangle,
  CheckCircle2, Trash2, Loader2, ArrowRight, Clock, Sparkles,
  FolderLock, Bell, BellOff, Upload, ExternalLink, FileCheck2, X, Mail
} from 'lucide-react';

import { createClient } from '@/utils/supabase/client';
import {
  UserVehicle,
  VehicleDocument,
  DocumentType,
  DOCUMENT_TYPE_LABELS,
} from '@/types/services';
import {
  fetchUserVehicles,
  saveUserVehicle,
  deleteUserVehicle,
  toggleVehicleReminder,
  fetchVehicleDocuments,
  saveVehicleDocument,
  deleteVehicleDocument,
} from '@/lib/services';
import { cx, ui } from '@/lib/ui';
import { VehicleFields, EMPTY_VEHICLE, type VehicleValue } from '@/components/forms/VehicleFields';
import {
  formatPlate,
  vehicleTypeLabel,
  vehicleTierLabel,
  inferVehicleTier,
  VEHICLE_TIERS,
  type VehicleTier,
} from '@/lib/vehicles';

function daysUntil(dateString?: string | null): number | null {
  if (!dateString) return null;
  const target = new Date(dateString).getTime();
  if (isNaN(target)) return null;
  const now = new Date().setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function expiryBadge(days: number | null, label: string) {
  if (days === null) {
    return (
      <span className="text-xs text-fg-subtle">
        {label}: <span className="italic">Not set</span>
      </span>
    );
  }
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-danger bg-danger-soft px-2 py-0.5 rounded-md border border-danger-line">
        <AlertTriangle className="w-3 h-3" /> {label} Expired ({Math.abs(days)}d ago)
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-warning bg-warning-soft px-2 py-0.5 rounded-md border border-warning-line">
        <Clock className="w-3 h-3" /> {label} expires in {days}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
      <CheckCircle2 className="w-3 h-3" /> {label} valid ({days}d)
    </span>
  );
}

const DOC_TYPES = Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[];

export function MyGarage({ user }: { user: { id: string; email?: string } | null }) {
  const supabase = createClient();
  const [vehicles, setVehicles] = useState<UserVehicle[]>([]);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [vaultVehicle, setVaultVehicle] = useState<UserVehicle | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add Vehicle Form State
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicle, setVehicle] = useState<VehicleValue>(EMPTY_VEHICLE);
  const [tierOverride, setTierOverride] = useState<VehicleTier | ''>('');
  const [usage, setUsage] = useState<'private' | 'commercial'>('private');
  const [insuranceType, setInsuranceType] = useState<'third_party' | 'comprehensive' | 'none'>('third_party');
  const [insuranceExpiry, setInsuranceExpiry] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [roadworthinessExpiry, setRoadworthinessExpiry] = useState('');
  const [pocExpiry, setPocExpiry] = useState('');
  const [hackneyExpiry, setHackneyExpiry] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [hasTracker, setHasTracker] = useState(false);

  const flash = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    window.setTimeout(() => setNotice(null), 6000);
  };

  const loadGarage = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [vList, dList] = await Promise.all([
      fetchUserVehicles(supabase, user.id),
      fetchVehicleDocuments(supabase, user.id),
    ]);
    setVehicles(vList);
    setDocuments(dList);
    setLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    loadGarage();
  }, [loadGarage]);

  const effectiveTier: VehicleTier = tierOverride || inferVehicleTier(vehicle.type, vehicle.make, vehicle.model);

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!plateNumber.trim()) {
      setErrorMsg('Please enter a vehicle plate number.');
      return;
    }
    if (!vehicle.make.trim()) {
      setErrorMsg('Please choose the make of the vehicle.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const { error } = await saveUserVehicle(supabase, {
      user_id: user.id,
      plate_number: plateNumber,
      vehicle_make: vehicle.make.trim() || null,
      vehicle_model: vehicle.model.trim() || null,
      vehicle_year: vehicle.year || null,
      color: vehicle.colour || null,
      vehicle_type: vehicle.type || null,
      vehicle_tier: effectiveTier,
      vehicle_usage: usage,
      insurance_type: insuranceType,
      insurance_expiry: insuranceExpiry || null,
      license_expiry: licenseExpiry || null,
      roadworthiness_expiry: roadworthinessExpiry || null,
      poc_expiry: pocExpiry || null,
      hackney_expiry: hackneyExpiry || null,
      reminder_enabled: reminderEnabled,
      has_tracker: hasTracker,
    });

    setSaving(false);

    if (error) {
      setErrorMsg(error);
    } else {
      setShowAddModal(false);
      setPlateNumber('');
      setVehicle(EMPTY_VEHICLE);
      setTierOverride('');
      setUsage('private');
      setInsuranceType('third_party');
      setInsuranceExpiry('');
      setLicenseExpiry('');
      setRoadworthinessExpiry('');
      setPocExpiry('');
      setHackneyExpiry('');
      setReminderEnabled(true);
      setHasTracker(false);
      flash(true, 'Vehicle added to your garage with automated expiry tracking.');
      loadGarage();
    }
  };

  const handleDelete = async (vehicleId: string) => {
    if (!user || !confirm('Are you sure you want to remove this vehicle from your garage?')) return;
    await deleteUserVehicle(supabase, vehicleId, user.id);
    setVehicles(prev => prev.filter(v => v.id !== vehicleId));
  };

  const handleToggleReminder = async (v: UserVehicle) => {
    if (!user) return;
    const next = !(v.reminder_enabled ?? true);
    setVehicles(prev => prev.map(item => (item.id === v.id ? { ...item, reminder_enabled: next } : item)));
    const { error } = await toggleVehicleReminder(supabase, v.id, user.id, next);
    if (error) {
      flash(false, error);
      setVehicles(prev => prev.map(item => (item.id === v.id ? { ...item, reminder_enabled: !next } : item)));
    } else {
      flash(true, next ? `Email expiry reminders enabled for ${v.plate_number}.` : `Email expiry reminders paused for ${v.plate_number}.`);
    }
  };

  const handleSendDigestNow = async () => {
    setSendingDigest(true);
    try {
      const res = await fetch('/api/garage/send-reminder', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        flash(false, data.error || 'Could not send reminder email.');
      } else {
        flash(true, data.message || 'Expiry summary sent to your email address.');
      }
    } catch {
      flash(false, 'Network error while sending reminder email.');
    } finally {
      setSendingDigest(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface p-6 rounded-2xl border border-line">
        <div>
          <h2 className="text-xl font-bold text-fg flex items-center gap-2">
            <Car className="w-5 h-5 text-accent" />
            <span>My Garage, Paper Expiry &amp; Digital Document Vault</span>
          </h2>
          <p className="text-xs text-fg-muted mt-1">
            Automated 30 / 14 / 7-day email expiry reminders, digital certificate vault, and 1-click statutory paper renewal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {vehicles.length > 0 && (
            <button
              type="button"
              disabled={sendingDigest}
              onClick={handleSendDigestNow}
              className={cx(ui.btn, ui.btnSoft, 'px-3.5 py-2.5 text-xs font-semibold')}
              title="Email a summary of your vehicle paper expiry dates right now"
            >
              {sendingDigest ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Mail className="w-4 h-4 mr-1.5" />}
              <span>Email Expiry Summary</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className={cx(ui.btn, ui.btnPrimary, 'px-4 py-2.5 text-xs font-bold')}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            <span>Add Vehicle</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className={notice.ok ? ui.alertSuccess : ui.alertError} role="status">
          {notice.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-fg-muted bg-surface rounded-2xl border border-line">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-accent mb-2" />
          <p className="text-xs">Loading garage vehicles &amp; document vault…</p>
        </div>
      ) : vehicles.length === 0 ? (
        <div className="p-10 text-center bg-surface rounded-2xl border border-line space-y-4">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-fg-muted mx-auto">
            <Car className="w-6 h-6" />
          </span>
          <div className="max-w-sm mx-auto">
            <h3 className="text-base font-bold text-fg">Your garage is empty</h3>
            <p className="text-xs text-fg-muted mt-1">
              Add your car, bus, truck, or dispatch motorcycle to get automated email reminders before your papers expire and keep digital copies in your Document Vault.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className={cx(ui.btn, ui.btnPrimary, 'px-5 py-2 text-xs font-bold')}
          >
            <Plus className="w-4 h-4 mr-1" /> Add Your First Vehicle
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vehicles.map((v) => {
            const insDays = daysUntil(v.insurance_expiry);
            const licDays = daysUntil(v.license_expiry);
            const rdwDays = daysUntil(v.roadworthiness_expiry);
            const pocDays = daysUntil(v.poc_expiry);
            const hckDays = daysUntil(v.hackney_expiry);

            const allDays = [insDays, licDays, rdwDays, pocDays, hckDays].filter((d): d is number => d !== null);
            const hasUrgentExpiry = allDays.some(d => d <= 30);
            const vehDocs = documents.filter(d => d.vehicle_id === v.id);
            const alertsOn = v.reminder_enabled ?? true;
            const resolvedTier = v.vehicle_tier || inferVehicleTier((v.vehicle_type || '') as VehicleValue['type'], v.vehicle_make, v.vehicle_model);

            return (
              <div key={v.id} className="bg-surface rounded-2xl p-5 border border-line shadow-sm space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-black text-lg text-fg bg-surface-2 px-2.5 py-1 rounded-lg border border-line inline-block">
                          {v.plate_number}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleReminder(v)}
                          className={cx(
                            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-colors',
                            alertsOn
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                              : 'bg-surface-2 text-fg-subtle border-line'
                          )}
                          title={alertsOn ? 'Automated 30/14/7-day email reminders are ON. Click to pause.' : 'Email reminders are paused. Click to enable.'}
                        >
                          {alertsOn ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                          <span>{alertsOn ? 'Email Alerts ON' : 'Alerts Paused'}</span>
                        </button>
                      </div>
                      <p className="text-sm font-bold text-fg mt-1.5">
                        {v.vehicle_make || ''} {v.vehicle_model || ''} {v.vehicle_year ? `(${v.vehicle_year})` : ''}
                      </p>
                      <p className="text-[11px] text-fg-muted mt-0.5">
                        {[
                          vehicleTierLabel(resolvedTier, true) || vehicleTypeLabel(v.vehicle_type),
                          v.color,
                          v.vehicle_usage === 'commercial' ? 'Commercial' : 'Private',
                          v.insurance_type === 'comprehensive' ? 'Comprehensive Cover' : null,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(v.id)}
                      className="text-fg-subtle hover:text-danger p-1 rounded-lg hover:bg-surface-2 transition-colors"
                      title="Remove vehicle"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mt-4 space-y-2 pt-2 border-t border-line">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-fg-muted">Insurance:</span>
                      {expiryBadge(insDays, 'Insurance')}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-fg-muted">Vehicle License:</span>
                      {expiryBadge(licDays, 'License')}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-fg-muted">Roadworthiness:</span>
                      {expiryBadge(rdwDays, 'Roadworthy')}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-fg-muted">Proof of Ownership (POC):</span>
                      {expiryBadge(pocDays, 'POC')}
                    </div>
                    {(v.vehicle_usage === 'commercial' || v.hackney_expiry) && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-fg-muted">Hackney / Haulage Permit:</span>
                        {expiryBadge(hckDays, 'Permit')}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-fg-muted">GPS Tracker:</span>
                      {v.has_tracker ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <Radio className="w-3 h-3" /> Active 4G Tracker
                        </span>
                      ) : (
                        <Link
                          href={`/services?tab=tracker&vehicle=${encodeURIComponent(v.id)}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline"
                        >
                          Book 4G Tracker →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-3 flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => setVaultVehicle(v)}
                    className={cx(ui.btn, 'flex-1 py-2 text-xs font-semibold justify-center border border-line bg-surface-2 hover:bg-surface-3')}
                  >
                    <FolderLock className="w-3.5 h-3.5 mr-1.5 text-primary" />
                    <span>Document Vault ({vehDocs.length})</span>
                  </button>
                  {hasUrgentExpiry ? (
                    <Link
                      href={`/services?vehicle=${encodeURIComponent(v.id)}`}
                      className={cx(ui.btn, ui.btnAccent, 'flex-1 py-2 text-xs font-bold justify-center')}
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      Renew Papers Now
                    </Link>
                  ) : (
                    <Link
                      href={`/services?vehicle=${encodeURIComponent(v.id)}`}
                      className={cx(ui.btn, ui.btnPrimary, 'flex-1 py-2 text-xs font-semibold justify-center')}
                    >
                      <span>1-Click Renew</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Digital Document Vault Modal */}
      {vaultVehicle && user && (
        <DocumentVaultModal
          vehicle={vaultVehicle}
          docs={documents.filter(d => d.vehicle_id === vaultVehicle.id)}
          onClose={() => setVaultVehicle(null)}
          onChanged={loadGarage}
          flash={flash}
        />
      )}

      {/* Add Vehicle Modal */}
      {showAddModal && (
        <div className={cx(ui.overlay, 'z-50')} onClick={() => setShowAddModal(false)}>
          <div className={cx(ui.modal, 'max-w-lg p-6 max-h-[92vh] overflow-y-auto')} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add vehicle">
            <h3 className="text-lg font-bold text-fg mb-1">Add Vehicle to My Garage</h3>
            <p className="text-xs text-fg-muted mb-4">
              Select your vehicle details for accurate engine/body-type pricing, automated email reminders, and 1-click renewal.
            </p>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl bg-danger-soft text-danger text-xs font-medium border border-danger-line">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveVehicle} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={ui.label} htmlFor="v-plate">Plate Number *</label>
                  <input
                    id="v-plate"
                    type="text"
                    required
                    placeholder="e.g. KSF-123-AA"
                    value={plateNumber}
                    onChange={e => setPlateNumber(formatPlate(e.target.value))}
                    className={cx(ui.input, 'font-mono uppercase tracking-wide')}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className={ui.label} htmlFor="v-tier">Engine / Pricing Category</label>
                  <select
                    id="v-tier"
                    value={effectiveTier}
                    onChange={e => setTierOverride(e.target.value as VehicleTier)}
                    className={ui.select}
                  >
                    {VEHICLE_TIERS.map(t => (
                      <option key={t.key} value={t.key}>{t.short}</option>
                    ))}
                  </select>
                </div>
              </div>

              <VehicleFields
                idPrefix="v"
                value={vehicle}
                onChange={v => {
                  setVehicle(v);
                  setTierOverride('');
                }}
                fields={['type', 'make', 'model', 'year', 'colour']}
                required={['make']}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className={ui.label}>Used as</span>
                  <div className="flex p-1 rounded-xl bg-surface-2 border border-line h-12" role="radiogroup" aria-label="Vehicle use">
                    {(['private', 'commercial'] as const).map(u => (
                      <button key={u} type="button" role="radio" aria-checked={usage === u} onClick={() => setUsage(u)}
                        className={cx('flex-1 rounded-lg text-xs font-bold capitalize transition-colors',
                          usage === u ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg')}>
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={ui.label} htmlFor="v-ins-type">Insurance cover</label>
                  <select id="v-ins-type" value={insuranceType} onChange={e => setInsuranceType(e.target.value as typeof insuranceType)} className={ui.select}>
                    <option value="third_party">Third-party (NIID)</option>
                    <option value="comprehensive">Comprehensive (Full cover)</option>
                    <option value="none">No insurance yet</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 border-t border-line space-y-3">
                <p className="text-xs font-bold text-fg">Document Expiration Dates (Optional — triggers 30/14/7-day email alerts)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className={ui.label} htmlFor="v-ins-exp">Insurance Expiry</label>
                    <input
                      id="v-ins-exp"
                      type="date"
                      value={insuranceExpiry}
                      onChange={e => setInsuranceExpiry(e.target.value)}
                      className={cx(ui.input, 'text-xs')}
                    />
                  </div>
                  <div>
                    <label className={ui.label} htmlFor="v-lic-exp">Vehicle License Expiry</label>
                    <input
                      id="v-lic-exp"
                      type="date"
                      value={licenseExpiry}
                      onChange={e => setLicenseExpiry(e.target.value)}
                      className={cx(ui.input, 'text-xs')}
                    />
                  </div>
                  <div>
                    <label className={ui.label} htmlFor="v-rdw-exp">Roadworthiness Expiry</label>
                    <input
                      id="v-rdw-exp"
                      type="date"
                      value={roadworthinessExpiry}
                      onChange={e => setRoadworthinessExpiry(e.target.value)}
                      className={cx(ui.input, 'text-xs')}
                    />
                  </div>
                  <div>
                    <label className={ui.label} htmlFor="v-poc-exp">Proof of Ownership (POC) Expiry</label>
                    <input
                      id="v-poc-exp"
                      type="date"
                      value={pocExpiry}
                      onChange={e => setPocExpiry(e.target.value)}
                      className={cx(ui.input, 'text-xs')}
                    />
                  </div>
                  {usage === 'commercial' && (
                    <div className="sm:col-span-2">
                      <label className={ui.label} htmlFor="v-hck-exp">Hackney / Haulage / Dispatch Permit Expiry</label>
                      <input
                        id="v-hck-exp"
                        type="date"
                        value={hackneyExpiry}
                        onChange={e => setHackneyExpiry(e.target.value)}
                        className={cx(ui.input, 'text-xs')}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-1 space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-fg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reminderEnabled}
                    onChange={e => setReminderEnabled(e.target.checked)}
                    className="rounded border-line text-accent focus:ring-accent"
                  />
                  <span>Send me automated email reminders 30, 14, and 7 days before any paper expires</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-fg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasTracker}
                    onChange={e => setHasTracker(e.target.checked)}
                    className="rounded border-line text-accent focus:ring-accent"
                  />
                  <span>Vehicle already has a live GPS tracker installed</span>
                </label>
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className={cx(ui.btn, 'flex-1 py-2 text-xs border border-line')}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={cx(ui.btn, ui.btnPrimary, 'flex-1 py-2 text-xs font-bold')}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentVaultModal({
  vehicle,
  docs,
  onClose,
  onChanged,
  flash,
}: {
  vehicle: UserVehicle;
  docs: VehicleDocument[];
  onClose: () => void;
  onChanged: () => void;
  flash: (ok: boolean, msg: string) => void;
}) {
  const supabase = createClient();
  const [docType, setDocType] = useState<DocumentType>('insurance');
  const [title, setTitle] = useState(DOCUMENT_TYPE_LABELS.insurance);
  const [refNumber, setRefNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleTypeChange = (next: DocumentType) => {
    setDocType(next);
    setTitle(DOCUMENT_TYPE_LABELS[next]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 420 * 1024) {
      setErr('Please choose a PDF or image scan under 420 KB, or paste a verification URL below.');
      return;
    }
    setErr(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFileUrl(reader.result);
        setFileName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileUrl.trim()) {
      setErr('Upload a scan (PDF/JPG/PNG) or paste a certificate verification link.');
      return;
    }
    setSaving(true);
    setErr(null);
    const { expiry_synced, error } = await saveVehicleDocument(supabase, {
      vehicle_id: vehicle.id,
      doc_type: docType,
      title: title.trim() || DOCUMENT_TYPE_LABELS[docType],
      file_url: fileUrl.trim(),
      reference_number: refNumber.trim() || null,
      expiry_date: expiryDate || null,
    });
    setSaving(false);
    if (error) {
      setErr(error);
    } else {
      setRefNumber('');
      setExpiryDate('');
      setFileUrl('');
      setFileName('');
      flash(
        true,
        expiry_synced
          ? `Document saved to Vault and ${vehicle.plate_number} expiry date updated automatically.`
          : 'Document saved to your Digital Vault.',
      );
      onChanged();
    }
  };

  const handleRemoveDoc = async (id: string) => {
    if (!confirm('Remove this document from your vault?')) return;
    const ok = await deleteVehicleDocument(supabase, id);
    if (ok) {
      flash(true, 'Document removed from vault.');
      onChanged();
    }
  };

  return (
    <div className={cx(ui.overlay, 'z-50')} onClick={onClose}>
      <div
        className={cx(ui.modal, 'max-w-xl p-0 overflow-hidden')}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Digital Document Vault"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-line">
          <div>
            <h3 className="text-base font-bold text-fg flex items-center gap-2">
              <FolderLock className="w-5 h-5 text-primary" />
              <span>Digital Document Vault · {vehicle.plate_number}</span>
            </h3>
            <p className="text-xs text-fg-muted mt-0.5">
              Keep digital copies of your NIID insurance, vehicle license, roadworthiness, and POC handy for road checks.
            </p>
          </div>
          <button type="button" onClick={onClose} className={ui.modalClose} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 max-h-[78vh] overflow-y-auto space-y-5">
          {/* Stored documents */}
          {docs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong bg-surface-2 p-5 text-center">
              <FileCheck2 className="w-7 h-7 text-fg-subtle mx-auto mb-1.5" />
              <p className="text-xs font-bold text-fg">No certificates stored for {vehicle.plate_number} yet</p>
              <p className="text-[11px] text-fg-muted mt-0.5">
                Upload a scan or paste your NIID / licensing verification link below. Papers renewed through Qozob are also added here automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs font-bold text-fg uppercase tracking-wider">Saved Certificates ({docs.length})</p>
              {docs.map(d => {
                const days = daysUntil(d.expiry_date);
                return (
                  <div key={d.id} className="rounded-xl border border-line bg-surface-2 p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-xs font-bold text-fg truncate">{d.title}</p>
                        {d.uploaded_by_role !== 'user' && (
                          <span className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-bold">
                            Verified by Qozob
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-fg-muted mt-0.5">
                        {[
                          DOCUMENT_TYPE_LABELS[d.doc_type] ?? d.doc_type,
                          d.reference_number ? `Ref: ${d.reference_number}` : null,
                          d.expiry_date ? `Expires: ${d.expiry_date}${days !== null ? ` (${days >= 0 ? `${days}d left` : 'expired'})` : ''}` : null,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={d.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={d.file_url.startsWith('data:') ? `${vehicle.plate_number}-${d.doc_type}` : undefined}
                        className={cx(ui.btn, ui.btnSm, ui.btnPrimary, 'h-8 px-3 text-xs')}
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1" />
                        <span>Open</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => handleRemoveDoc(d.id)}
                        className="p-1.5 rounded-lg text-fg-subtle hover:text-danger hover:bg-surface transition-colors"
                        title="Delete document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Upload / Add form */}
          <form onSubmit={handleSaveDoc} className="rounded-2xl border border-line bg-surface p-4 space-y-3">
            <p className="text-xs font-bold text-fg">Add Certificate or Renewal Scan to Vault</p>
            {err && (
              <div className="p-2.5 rounded-xl bg-danger-soft text-danger text-xs border border-danger-line">
                {err}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={ui.label} htmlFor="dv-type">Document Type *</label>
                <select
                  id="dv-type"
                  value={docType}
                  onChange={e => handleTypeChange(e.target.value as DocumentType)}
                  className={ui.select}
                >
                  {DOC_TYPES.map(k => (
                    <option key={k} value={k}>{DOCUMENT_TYPE_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={ui.label} htmlFor="dv-title">Label *</label>
                <input
                  id="dv-title"
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className={ui.input}
                  maxLength={120}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={ui.label} htmlFor="dv-ref">Policy / Certificate No. (optional)</label>
                <input
                  id="dv-ref"
                  type="text"
                  placeholder="e.g. NIID-2026-88412"
                  value={refNumber}
                  onChange={e => setRefNumber(e.target.value)}
                  className={cx(ui.input, 'font-mono uppercase')}
                />
              </div>
              <div>
                <label className={ui.label} htmlFor="dv-exp">Expiry Date (auto-syncs tracker)</label>
                <input
                  id="dv-exp"
                  type="date"
                  value={expiryDate}
                  onChange={e => setExpiryDate(e.target.value)}
                  className={ui.input}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className={ui.label} htmlFor="dv-file">Upload Scan (PDF / Image ≤ 420 KB) or Paste Verification Link *</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <label className={cx(ui.btn, ui.btnSoft, 'h-11 px-4 text-xs font-semibold cursor-pointer shrink-0 justify-center')}>
                  <Upload className="w-4 h-4 mr-1.5" />
                  <span>{fileName ? `Loaded: ${fileName.slice(0, 20)}` : 'Choose PDF / Image'}</span>
                  <input id="dv-file" type="file" accept=".pdf,image/*" onChange={handleFileUpload} className="hidden" />
                </label>
                <input
                  type="text"
                  placeholder="Or paste https://askniid.org/... or certificate link"
                  value={fileUrl.startsWith('data:') ? '' : fileUrl}
                  onChange={e => { setFileUrl(e.target.value); setFileName(''); }}
                  className={cx(ui.input, 'flex-1 text-xs')}
                />
              </div>
            </div>

            <div className="pt-1 flex justify-end">
              <button type="submit" disabled={saving} className={cx(ui.btn, ui.btnPrimary, 'px-5 py-2 text-xs font-bold')}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save to Document Vault'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
