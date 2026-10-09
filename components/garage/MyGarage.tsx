"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Car, Plus, Calendar, ShieldCheck, Radio, AlertTriangle,
  CheckCircle2, Trash2, Edit2, Loader2, ArrowRight, Clock,
  FileText, Sparkles
} from 'lucide-react';

import { createClient } from '@/utils/supabase/client';
import { UserVehicle } from '@/types/services';
import { fetchUserVehicles, saveUserVehicle, deleteUserVehicle } from '@/lib/services';
import { cx, ui } from '@/lib/ui';

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

export function MyGarage({ user }: { user: any }) {
  const supabase = createClient();
  const [vehicles, setVehicles] = useState<UserVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [color, setColor] = useState('');
  const [insuranceType, setInsuranceType] = useState<'third_party' | 'comprehensive'>('third_party');
  const [insuranceExpiry, setInsuranceExpiry] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [roadworthinessExpiry, setRoadworthinessExpiry] = useState('');
  const [hasTracker, setHasTracker] = useState(false);

  const loadVehicles = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const data = await fetchUserVehicles(supabase, user.id);
    setVehicles(data);
    setLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plateNumber.trim()) {
      setErrorMsg('Please enter a vehicle plate number.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const { error } = await saveUserVehicle(supabase, {
      user_id: user.id,
      plate_number: plateNumber,
      vehicle_make: vehicleMake || null,
      vehicle_model: vehicleModel || null,
      vehicle_year: vehicleYear || null,
      color: color || null,
      insurance_type: insuranceType,
      insurance_expiry: insuranceExpiry || null,
      license_expiry: licenseExpiry || null,
      roadworthiness_expiry: roadworthinessExpiry || null,
      has_tracker: hasTracker,
    });

    setSaving(false);

    if (error) {
      setErrorMsg(error);
    } else {
      setShowAddModal(false);
      // Reset form
      setPlateNumber('');
      setVehicleMake('');
      setVehicleModel('');
      setVehicleYear('');
      setColor('');
      setInsuranceExpiry('');
      setLicenseExpiry('');
      setRoadworthinessExpiry('');
      setHasTracker(false);
      loadVehicles();
    }
  };

  const handleDelete = async (vehicleId: string) => {
    if (!confirm('Are you sure you want to remove this vehicle from your garage?')) return;
    await deleteUserVehicle(supabase, vehicleId, user.id);
    setVehicles(prev => prev.filter(v => v.id !== vehicleId));
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface p-6 rounded-2xl border border-line">
        <div>
          <h2 className="text-xl font-bold text-fg flex items-center gap-2">
            <Car className="w-5 h-5 text-accent" />
            <span>My Garage & Paper Expiry Tracker</span>
          </h2>
          <p className="text-xs text-fg-muted mt-1">
            Keep your vehicle papers up-to-date and get alerts before police or VIO stop you.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className={cx(ui.btn, ui.btnPrimary, 'px-4 py-2.5 text-xs font-bold shrink-0')}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          <span>Add Vehicle</span>
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-fg-muted bg-surface rounded-2xl border border-line">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-accent mb-2" />
          <p className="text-xs">Loading garage vehicles…</p>
        </div>
      ) : vehicles.length === 0 ? (
        <div className="p-10 text-center bg-surface rounded-2xl border border-line space-y-4">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-fg-muted mx-auto">
            <Car className="w-6 h-6" />
          </span>
          <div className="max-w-sm mx-auto">
            <h3 className="text-base font-bold text-fg">Your garage is empty</h3>
            <p className="text-xs text-fg-muted mt-1">
              Add your car or motorcycle to track insurance, license, and roadworthiness expiry dates automatically.
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

            const hasUrgentExpiry = (insDays !== null && insDays <= 30) || (licDays !== null && licDays <= 30) || (rdwDays !== null && rdwDays <= 30);

            return (
              <div key={v.id} className="bg-surface rounded-2xl p-5 border border-line shadow-sm space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="font-mono font-black text-lg text-fg bg-surface-2 px-2.5 py-1 rounded-lg border border-line inline-block">
                        {v.plate_number}
                      </span>
                      <p className="text-sm font-bold text-fg mt-1.5">
                        {v.vehicle_make || ''} {v.vehicle_model || ''} {v.vehicle_year ? `(${v.vehicle_year})` : ''}
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
                      <span className="text-xs text-fg-muted">License:</span>
                      {expiryBadge(licDays, 'License')}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-fg-muted">Roadworthiness:</span>
                      {expiryBadge(rdwDays, 'Roadworthy')}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-fg-muted">GPS Tracker:</span>
                      {v.has_tracker ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <Radio className="w-3 h-3" /> Active 4G Tracker
                        </span>
                      ) : (
                        <Link
                          href="/services"
                          className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline"
                        >
                          Book 4G Tracker →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  {hasUrgentExpiry ? (
                    <Link
                      href="/services"
                      className={cx(ui.btn, ui.btnAccent, 'w-full py-2 text-xs font-bold justify-center')}
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      Renew Expiring Papers Now
                    </Link>
                  ) : (
                    <Link
                      href="/services"
                      className={cx(ui.btn, 'w-full py-2 text-xs font-semibold justify-center border border-line bg-surface-2 hover:bg-surface-3')}
                    >
                      <span>Order Additional Services</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Vehicle Modal */}
      {showAddModal && (
        <div className={cx(ui.overlay, 'z-50')} onClick={() => setShowAddModal(false)}>
          <div className={cx(ui.modal, 'max-w-lg p-6')} onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-fg mb-1">Add Vehicle to My Garage</h3>
            <p className="text-xs text-fg-muted mb-4">
              Enter your vehicle details to track expiry dates and unlock 1-click renewal.
            </p>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl bg-danger-soft text-danger text-xs font-medium border border-danger-line">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveVehicle} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={ui.label} htmlFor="v-plate">Plate Number *</label>
                  <input
                    id="v-plate"
                    type="text"
                    required
                    placeholder="e.g. KSF-123-AA"
                    value={plateNumber}
                    onChange={e => setPlateNumber(e.target.value.toUpperCase())}
                    className={ui.input}
                  />
                </div>
                <div>
                  <label className={ui.label} htmlFor="v-make">Make</label>
                  <input
                    id="v-make"
                    type="text"
                    placeholder="e.g. Toyota, Honda"
                    value={vehicleMake}
                    onChange={e => setVehicleMake(e.target.value)}
                    className={ui.input}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={ui.label} htmlFor="v-model">Model</label>
                  <input
                    id="v-model"
                    type="text"
                    placeholder="e.g. Corolla, Civic"
                    value={vehicleModel}
                    onChange={e => setVehicleModel(e.target.value)}
                    className={ui.input}
                  />
                </div>
                <div>
                  <label className={ui.label} htmlFor="v-year">Year</label>
                  <input
                    id="v-year"
                    type="text"
                    placeholder="e.g. 2015"
                    value={vehicleYear}
                    onChange={e => setVehicleYear(e.target.value)}
                    className={ui.input}
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-line space-y-3">
                <p className="text-xs font-bold text-fg">Document Expiration Dates (Optional)</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className={ui.label} htmlFor="v-ins-exp">Insurance</label>
                    <input
                      id="v-ins-exp"
                      type="date"
                      value={insuranceExpiry}
                      onChange={e => setInsuranceExpiry(e.target.value)}
                      className={cx(ui.input, 'text-xs')}
                    />
                  </div>
                  <div>
                    <label className={ui.label} htmlFor="v-lic-exp">License</label>
                    <input
                      id="v-lic-exp"
                      type="date"
                      value={licenseExpiry}
                      onChange={e => setLicenseExpiry(e.target.value)}
                      className={cx(ui.input, 'text-xs')}
                    />
                  </div>
                  <div>
                    <label className={ui.label} htmlFor="v-rdw-exp">Roadworthy</label>
                    <input
                      id="v-rdw-exp"
                      type="date"
                      value={roadworthinessExpiry}
                      onChange={e => setRoadworthinessExpiry(e.target.value)}
                      className={cx(ui.input, 'text-xs')}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-1 flex items-center gap-2">
                <input
                  id="v-tracker"
                  type="checkbox"
                  checked={hasTracker}
                  onChange={e => setHasTracker(e.target.checked)}
                  className="rounded border-line text-accent focus:ring-accent"
                />
                <label htmlFor="v-tracker" className="text-xs font-medium text-fg cursor-pointer">
                  Vehicle already has a live GPS tracker installed
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
