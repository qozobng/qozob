"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Fuel, Plus, Download, Trash2, Calendar, Gauge, Clock,
  TrendingDown, TrendingUp, DollarSign, Loader2, Sparkles, AlertCircle
} from 'lucide-react';

import { createClient } from '@/utils/supabase/client';
import { FuelLog, FuelType, FuelLogType } from '@/types/services';
import { fetchUserFuelLogs, saveFuelLog, deleteFuelLog } from '@/lib/services';
import { cx, ui } from '@/lib/ui';

export function FuelLogbook({ user }: { user: any }) {
  const supabase = createClient();
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form Fields
  const [logType, setLogType] = useState<FuelLogType>('vehicle');
  const [label, setLabel] = useState('');
  const [fuelType, setFuelType] = useState<FuelType>('pms');
  const [pricePerLitre, setPricePerLitre] = useState('');
  const [litresBought, setLitresBought] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [stationName, setStationName] = useState('');
  const [odometerKm, setOdometerKm] = useState('');
  const [engineHours, setEngineHours] = useState('');
  const [loggedAt, setLoggedAt] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const loadLogs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const data = await fetchUserFuelLogs(supabase, user.id);
    setLogs(data);
    setLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Auto-calculate Total Amount when Price or Litres changes
  const handlePriceChange = (val: string) => {
    setPricePerLitre(val);
    const p = parseFloat(val);
    const l = parseFloat(litresBought);
    if (!isNaN(p) && !isNaN(l) && p > 0 && l > 0) {
      setTotalAmount((p * l).toFixed(0));
    }
  };

  const handleLitresChange = (val: string) => {
    setLitresBought(val);
    const l = parseFloat(val);
    const p = parseFloat(pricePerLitre);
    if (!isNaN(p) && !isNaN(l) && p > 0 && l > 0) {
      setTotalAmount((p * l).toFixed(0));
    }
  };

  const handleTotalChange = (val: string) => {
    setTotalAmount(val);
    const tot = parseFloat(val);
    const p = parseFloat(pricePerLitre);
    if (!isNaN(tot) && !isNaN(p) && tot > 0 && p > 0) {
      setLitresBought((tot / p).toFixed(2));
    }
  };

  // Metrics
  const metrics = useMemo(() => {
    const currentMonthPrefix = new Date().toISOString().slice(0, 7);
    const monthLogs = logs.filter(l => l.logged_at.startsWith(currentMonthPrefix));

    const totalSpend = monthLogs.reduce((acc, curr) => acc + Number(curr.total_amount), 0);
    const totalLitres = monthLogs.reduce((acc, curr) => acc + Number(curr.litres_bought), 0);
    const avgPrice = totalLitres > 0 ? (totalSpend / totalLitres) : 0;

    return {
      totalSpend,
      totalLitres,
      avgPrice,
      fillCount: monthLogs.length,
    };
  }, [logs]);

  const handleSaveLog = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseFloat(pricePerLitre);
    const l = parseFloat(litresBought);
    const tot = parseFloat(totalAmount);

    if (isNaN(p) || p <= 0 || isNaN(l) || l <= 0 || isNaN(tot) || tot <= 0) {
      setErrorMsg('Please enter valid positive numbers for price, litres, and total amount.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const { error } = await saveFuelLog(supabase, {
      user_id: user.id,
      log_type: logType,
      label: label.trim() || (logType === 'vehicle' ? 'Vehicle' : 'Generator'),
      fuel_type: fuelType,
      price_per_litre: p,
      litres_bought: l,
      total_amount: tot,
      station_name: stationName.trim() || null,
      odometer_km: odometerKm ? parseFloat(odometerKm) : null,
      engine_hours: engineHours ? parseFloat(engineHours) : null,
      notes: notes.trim() || null,
      logged_at: loggedAt,
    });

    setSaving(false);

    if (error) {
      setErrorMsg(error);
    } else {
      setShowAddModal(false);
      // Reset
      setPricePerLitre('');
      setLitresBought('');
      setTotalAmount('');
      setStationName('');
      setOdometerKm('');
      setEngineHours('');
      setNotes('');
      loadLogs();
    }
  };

  const handleDelete = async (logId: string) => {
    if (!confirm('Are you sure you want to delete this fuel purchase record?')) return;
    await deleteFuelLog(supabase, logId, user.id);
    setLogs(prev => prev.filter(l => l.id !== logId));
  };

  const handleExportCSV = () => {
    if (logs.length === 0) return;
    const headers = ['Date', 'Type', 'Label', 'Fuel Type', 'Price/L (NGN)', 'Litres', 'Total (NGN)', 'Station', 'Odometer (km)', 'Engine Hours', 'Notes'];
    const rows = logs.map(l => [
      l.logged_at,
      l.log_type,
      `"${(l.label || '').replace(/"/g, '""')}"`,
      l.fuel_type.toUpperCase(),
      l.price_per_litre,
      l.litres_bought,
      l.total_amount,
      `"${(l.station_name || '').replace(/"/g, '""')}"`,
      l.odometer_km || '',
      l.engine_hours || '',
      `"${(l.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `qozob_fuel_log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface p-6 rounded-2xl border border-line">
        <div>
          <h2 className="text-xl font-bold text-fg flex items-center gap-2">
            <Fuel className="w-5 h-5 text-accent" />
            <span>Fuel & Expense Logbook</span>
          </h2>
          <p className="text-xs text-fg-muted mt-1">
            Track fuel expenses for vehicles, generator sets, and fleets. Spot cost leaks and measure fuel economy.
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {logs.length > 0 && (
            <button
              type="button"
              onClick={handleExportCSV}
              className={cx(ui.btn, 'px-3 py-2 text-xs font-semibold border border-line bg-surface-2 hover:bg-surface-3')}
              title="Download Excel / CSV"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              <span>Export CSV</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className={cx(ui.btn, ui.btnPrimary, 'px-4 py-2 text-xs font-bold shrink-0')}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            <span>Log Fuel Purchase</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-surface p-4 rounded-xl border border-line">
          <span className="text-[11px] font-semibold text-fg-muted uppercase block">This Month's Spend</span>
          <span className="text-xl sm:text-2xl font-black text-fg mt-1 block tabular">
            ₦{metrics.totalSpend.toLocaleString()}
          </span>
          <span className="text-[10px] text-fg-subtle">{metrics.fillCount} fuel purchase{metrics.fillCount === 1 ? '' : 's'}</span>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-line">
          <span className="text-[11px] font-semibold text-fg-muted uppercase block">Litres Purchased</span>
          <span className="text-xl sm:text-2xl font-black text-fg mt-1 block tabular">
            {metrics.totalLitres.toFixed(1)} L
          </span>
          <span className="text-[10px] text-fg-subtle">PMS & AGO combined</span>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-line">
          <span className="text-[11px] font-semibold text-fg-muted uppercase block">Avg. Price Paid</span>
          <span className="text-xl sm:text-2xl font-black text-accent mt-1 block tabular">
            ₦{metrics.avgPrice > 0 ? metrics.avgPrice.toFixed(1) : '---'}
          </span>
          <span className="text-[10px] text-fg-subtle">Per Litre</span>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-line">
          <span className="text-[11px] font-semibold text-fg-muted uppercase block">Total Log Entries</span>
          <span className="text-xl sm:text-2xl font-black text-fg mt-1 block tabular">
            {logs.length}
          </span>
          <span className="text-[10px] text-fg-subtle">All time records</span>
        </div>
      </div>

      {/* Logs Table / List */}
      {loading ? (
        <div className="p-12 text-center text-fg-muted bg-surface rounded-2xl border border-line">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-accent mb-2" />
          <p className="text-xs">Loading fuel records…</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="p-10 text-center bg-surface rounded-2xl border border-line space-y-4">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-fg-muted mx-auto">
            <Fuel className="w-6 h-6" />
          </span>
          <div className="max-w-sm mx-auto">
            <h3 className="text-base font-bold text-fg">No fuel purchases logged yet</h3>
            <p className="text-xs text-fg-muted mt-1">
              Start recording your vehicle or generator fuel top-ups to track consumption and monthly costs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className={cx(ui.btn, ui.btnPrimary, 'px-5 py-2 text-xs font-bold')}
          >
            <Plus className="w-4 h-4 mr-1" /> Log Your First Fuel Purchase
          </button>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-line overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 border-b border-line text-fg-muted font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Vehicle / Generator</th>
                  <th className="px-4 py-3">Fuel Type</th>
                  <th className="px-4 py-3">Price / L</th>
                  <th className="px-4 py-3">Volume</th>
                  <th className="px-4 py-3">Total Amount</th>
                  <th className="px-4 py-3">Station</th>
                  <th className="px-4 py-3">Odometer / Hours</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-2/60 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-fg font-medium">{log.logged_at}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-bold text-fg">{log.label || (log.log_type === 'vehicle' ? 'Car' : 'Generator')}</span>
                      <span className="text-[10px] text-fg-subtle block uppercase">{log.log_type}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-bold uppercase text-accent">
                      {log.fuel_type}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular text-fg">₦{Number(log.price_per_litre).toLocaleString()}</td>
                    <td className="px-4 py-3 whitespace-nowrap tabular text-fg">{Number(log.litres_bought).toFixed(1)} L</td>
                    <td className="px-4 py-3 whitespace-nowrap tabular font-bold text-fg">
                      ₦{Number(log.total_amount).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-fg-muted truncate max-w-[140px]">
                      {log.station_name || '---'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-fg-muted tabular">
                      {log.odometer_km ? `${Number(log.odometer_km).toLocaleString()} km` : log.engine_hours ? `${log.engine_hours} hrs` : '---'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(log.id)}
                        className="text-fg-subtle hover:text-danger p-1 rounded transition-colors"
                        title="Delete log"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Fuel Purchase Modal */}
      {showAddModal && (
        <div className={cx(ui.overlay, 'z-50')} onClick={() => setShowAddModal(false)}>
          <div className={cx(ui.modal, 'max-w-lg p-6')} onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-fg mb-1">Log Fuel Purchase</h3>
            <p className="text-xs text-fg-muted mb-4">
              Enter details from your pump receipt to track expense and consumption.
            </p>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl bg-danger-soft text-danger text-xs font-medium border border-danger-line">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveLog} className="space-y-4">
              {/* Type toggle */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-surface-2 rounded-xl border border-line">
                <button
                  type="button"
                  onClick={() => setLogType('vehicle')}
                  className={cx(
                    'py-1.5 rounded-lg text-xs font-bold transition-colors',
                    logType === 'vehicle' ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg'
                  )}
                >
                  🚗 Vehicle
                </button>
                <button
                  type="button"
                  onClick={() => setLogType('generator')}
                  className={cx(
                    'py-1.5 rounded-lg text-xs font-bold transition-colors',
                    logType === 'generator' ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg'
                  )}
                >
                  ⚡ Generator
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={ui.label} htmlFor="fl-label">
                    {logType === 'vehicle' ? 'Vehicle Name / Plate' : 'Generator Description'}
                  </label>
                  <input
                    id="fl-label"
                    type="text"
                    placeholder={logType === 'vehicle' ? 'e.g. Corolla / KSF-123' : 'e.g. 20kVA Lister'}
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    className={ui.input}
                  />
                </div>
                <div>
                  <label className={ui.label} htmlFor="fl-fuel">Fuel Type</label>
                  <select
                    id="fl-fuel"
                    value={fuelType}
                    onChange={e => setFuelType(e.target.value as FuelType)}
                    className={ui.select}
                  >
                    <option value="pms">PMS (Petrol)</option>
                    <option value="ago">AGO (Diesel)</option>
                    <option value="dpk">DPK (Kerosene)</option>
                    <option value="cng">CNG (Gas)</option>
                    <option value="lpg">LPG (Cooking Gas)</option>
                  </select>
                </div>
              </div>

              {/* Price & Litres Calculation */}
              <div className="grid grid-cols-3 gap-2.5 bg-surface-2 p-3 rounded-2xl border border-line">
                <div>
                  <label className={ui.label} htmlFor="fl-price">Price / Litre (₦) *</label>
                  <input
                    id="fl-price"
                    type="number"
                    step="any"
                    required
                    placeholder="950"
                    value={pricePerLitre}
                    onChange={e => handlePriceChange(e.target.value)}
                    className={ui.input}
                  />
                </div>
                <div>
                  <label className={ui.label} htmlFor="fl-litres">Litres Bought *</label>
                  <input
                    id="fl-litres"
                    type="number"
                    step="any"
                    required
                    placeholder="40"
                    value={litresBought}
                    onChange={e => handleLitresChange(e.target.value)}
                    className={ui.input}
                  />
                </div>
                <div>
                  <label className={ui.label} htmlFor="fl-tot">Total Amount (₦) *</label>
                  <input
                    id="fl-tot"
                    type="number"
                    step="any"
                    required
                    placeholder="38000"
                    value={totalAmount}
                    onChange={e => handleTotalChange(e.target.value)}
                    className={cx(ui.input, 'font-bold text-accent')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={ui.label} htmlFor="fl-station">Station Name / Brand</label>
                  <input
                    id="fl-station"
                    type="text"
                    placeholder="e.g. TotalEnergies Lekki"
                    value={stationName}
                    onChange={e => setStationName(e.target.value)}
                    className={ui.input}
                  />
                </div>
                <div>
                  <label className={ui.label} htmlFor="fl-date">Date</label>
                  <input
                    id="fl-date"
                    type="date"
                    value={loggedAt}
                    onChange={e => setLoggedAt(e.target.value)}
                    className={ui.input}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={ui.label} htmlFor="fl-odo">
                    {logType === 'vehicle' ? 'Odometer Reading (km)' : 'Engine Run Hours'}
                  </label>
                  <input
                    id="fl-odo"
                    type="number"
                    step="any"
                    placeholder={logType === 'vehicle' ? 'e.g. 125400' : 'e.g. 450'}
                    value={logType === 'vehicle' ? odometerKm : engineHours}
                    onChange={e => logType === 'vehicle' ? setOdometerKm(e.target.value) : setEngineHours(e.target.value)}
                    className={ui.input}
                  />
                </div>
                <div>
                  <label className={ui.label} htmlFor="fl-notes">Notes (Optional)</label>
                  <input
                    id="fl-notes"
                    type="text"
                    placeholder="e.g. Full tank, AC on"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className={ui.input}
                  />
                </div>
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
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

