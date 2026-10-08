"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Building2, MapPin, Tag, Image as ImageIcon, 
  LogOut, CheckCircle2, ShieldCheck, Loader2, X, Navigation,
  LayoutGrid, List, FileDown, FileUp, AlertCircle, Menu, Settings, 
  Map as MapIcon, Clock, TrendingUp, Star, Fuel, Check, ArrowUpRight
} from 'lucide-react';

import { createClient } from '@/utils/supabase/client';
import { getRole, hasRequestedManager, ensureManagerRequestFiled } from '@/lib/roles';
import { BrandLogo } from '@/components/BrandLogo';
import { StatCard } from '@/components/analytics/StatCard';
import { BarChart, BarItem } from '@/components/analytics/BarChart';
import { DonutChart, DonutSegment } from '@/components/analytics/DonutChart';
import { RatingDistribution } from '@/components/analytics/RatingDistribution';

// =========================================================================
// TYPES
// =========================================================================

interface Station {
  id: string; 
  station_id: string; 
  name: string;
  address: string;
  lat: number;
  lng: number;
  price_pms: number | null;
  queue_status?: string | null;
  custom_logo_url: string | null;
  manager_id: string;
  claim_status?: string;
  pump_accuracy?: number | null;
  accuracy_votes?: number | null;
  last_updated?: string | null;
}

function generateStationCode(stationId: string) {
  if (!stationId) return "QZB-XXXX";
  return `QZB-${stationId.slice(-6).toUpperCase()}`;
}

function parseCSV(str: string) {
  const arr: string[][] = [];
  let quote = false;
  let row = 0, col = 0;
  for (let c = 0; c < str.length; c++) {
    let cc = str[c], nc = str[c+1];
    arr[row] = arr[row] || [];
    arr[row][col] = arr[row][col] || '';
    if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; continue; }
    if (cc == '"') { quote = !quote; continue; }
    if (cc == ',' && !quote) { ++col; continue; }
    if (cc == '\r' && nc == '\n' && !quote) { ++row; col = 0; ++c; continue; }
    if (cc == '\n' && !quote) { ++row; col = 0; continue; }
    if (cc == '\r' && !quote) { ++row; col = 0; continue; }
    arr[row][col] += cc;
  }
  return arr;
}

// =========================================================================
// MANAGER DASHBOARD COMPONENT
// =========================================================================

export default function DashboardPage() {
  const supabase = createClient();
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [marketAveragePrice, setMarketAveragePrice] = useState<number>(915);
  const [loading, setLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [accessPending, setAccessPending] = useState(false);

  // Quick Inline Price Editing
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [inlinePriceVal, setInlinePriceVal] = useState<string>('');
  const [isSavingInline, setIsSavingInline] = useState(false);

  // Modal Fields
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editQueue, setEditQueue] = useState("Unknown");
  const [editLogoUrl, setEditLogoUrl] = useState("");

  useEffect(() => {
    const loadDashboard = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        return router.push('/login');
      }

      const role = getRole(user);
      if (role !== 'Manager' && role !== 'Admin' && !hasRequestedManager(user)) {
        return router.push('/user-dashboard');
      }
      if (role === 'User') {
        setAccessPending(true);
        ensureManagerRequestFiled(supabase, user);
      }
      
      setUser(user);

      const phone = user.user_metadata?.full_phone;
      const claimFilters = [`user_id.eq.${user.id}`];
      if (user.email) claimFilters.push(`official_email.eq."${user.email}"`);
      if (phone) claimFilters.push(`phone_number.eq."${phone}"`);

      // Parallel fetch: Verified Stations + User's Claims + Market Average sample
      const [
        { data: verifiedStations }, 
        { data: pendingClaims },
        { data: marketSample }
      ] = await Promise.all([
        supabase.from('stations').select('*').eq('manager_id', user.id),
        supabase.from('station_claims').select('*').eq('status', 'Pending Review').or(claimFilters.join(',')),
        supabase.from('stations').select('price_pms').not('price_pms', 'is', null).limit(100),
      ]);
      
      // Calculate market benchmark
      if (marketSample && marketSample.length > 0) {
        const valid = marketSample.map(s => s.price_pms).filter((p): p is number => typeof p === 'number' && p > 0);
        if (valid.length > 0) {
          const avg = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
          setMarketAveragePrice(avg);
        }
      }

      const userClaims = (pendingClaims || []).filter(
        c => c.user_id === user.id || c.official_email === user.email || c.phone_number === phone
      );

      const mergedView = [
        ...(verifiedStations || []).map(s => ({ ...s, claim_status: 'Approved' })),
        ...userClaims.map(c => ({
          id: c.id,
          station_id: c.station_id,
          name: c.station_name,
          address: 'Address pending verification',
          lat: c.lat,
          lng: c.lng,
          price_pms: null,
          queue_status: 'Unknown',
          custom_logo_url: null,
          manager_id: user.id,
          claim_status: 'Pending Review',
          pump_accuracy: 0,
          accuracy_votes: 0,
        }))
      ];

      setStations(mergedView as Station[]);
      setLoading(false);
    };

    loadDashboard();
  }, [router, supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const openEditModal = (station: Station) => {
    if (station.claim_status === 'Pending Review') {
      return alert("This station is awaiting verification. You can modify details once approved.");
    }
    setEditingStation(station);
    setEditName(station.name || "");
    setEditAddress(station.address || "");
    setEditPrice(station.price_pms ? station.price_pms.toString() : "");
    setEditQueue(station.queue_status || "Unknown");
    setEditLogoUrl(station.custom_logo_url || "");
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploadingLogo(true);
      const file = e.target.files?.[0];
      if (!file) return;

      const fileExt = file.name.split('.').pop();
      const fileName = `logo_${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('station_logos').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('station_logos').getPublicUrl(filePath);
      setEditLogoUrl(data.publicUrl);
    } catch (error: any) { 
      alert('Error uploading logo: ' + error.message); 
    } finally { 
      setUploadingLogo(false); 
    }
  };

  // Full Station Save (from Modal)
  const saveStationUpdates = async () => {
    if (!editingStation) return;
    setIsSaving(true);

    const priceNum = editPrice ? parseFloat(editPrice) : null;
    const { error } = await supabase
      .from('stations')
      .update({
        name: editName,
        address: editAddress,
        price_pms: priceNum,
        queue_status: editQueue,
        custom_logo_url: editLogoUrl,
        updated_by_role: 'Owner', 
        verified: true,           
        last_updated: new Date().toISOString()
      })
      .eq('station_id', editingStation.station_id)
      .eq('manager_id', user.id); 

    setIsSaving(false);

    if (error) { 
      alert("Error saving updates: " + error.message); 
    } else {
      const savedId = editingStation.station_id;
      setEditingStation(null);
      setStations(prev => prev.map(s => s.station_id === savedId ? {
        ...s, 
        name: editName, 
        address: editAddress, 
        price_pms: priceNum, 
        queue_status: editQueue,
        custom_logo_url: editLogoUrl,
        last_updated: new Date().toISOString()
      } : s));
    }
  };

  // Quick Inline Price Save
  const handleInlinePriceSave = async (station: Station) => {
    if (!inlinePriceVal) {
      setEditingPriceId(null);
      return;
    }
    const parsed = parseFloat(inlinePriceVal);
    if (!Number.isFinite(parsed) || parsed < 300 || parsed > 3000) {
      alert("Please enter a realistic fuel price between ₦300 and ₦3,000.");
      return;
    }

    setIsSavingInline(true);
    const { error } = await supabase
      .from('stations')
      .update({
        price_pms: parsed,
        updated_by_role: 'Owner',
        verified: true,
        last_updated: new Date().toISOString()
      })
      .eq('station_id', station.station_id)
      .eq('manager_id', user.id);

    setIsSavingInline(false);
    if (error) {
      alert("Failed to update price: " + error.message);
    } else {
      setStations(prev => prev.map(s => s.station_id === station.station_id ? {
        ...s,
        price_pms: parsed,
        last_updated: new Date().toISOString()
      } : s));
      setEditingPriceId(null);
    }
  };

  // Quick Queue Status Toggle
  const handleQueueChange = async (station: Station, newQueue: string) => {
    const { error } = await supabase
      .from('stations')
      .update({
        queue_status: newQueue,
        updated_by_role: 'Owner',
        last_updated: new Date().toISOString()
      })
      .eq('station_id', station.station_id)
      .eq('manager_id', user.id);

    if (error) {
      alert("Failed to update queue: " + error.message);
    } else {
      setStations(prev => prev.map(s => s.station_id === station.station_id ? {
        ...s,
        queue_status: newQueue
      } : s));
    }
  };

  // Bulk CSV Actions
  const downloadBulkTemplate = () => {
    const approved = stations.filter(s => s.claim_status === 'Approved');
    const headers = ["System_ID", "Station_Code", "Name", "Address", "PMS_Price"];
    
    const rows = approved.map(s => [ 
      s.station_id, 
      generateStationCode(s.station_id), 
      `"${(s.name || "").replace(/"/g, '""')}"`, 
      `"${(s.address || "").replace(/"/g, '""')}"`, 
      s.price_pms || "" 
    ]);
    
    const csvBody = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csvBody], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Qozob_Bulk_Template_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBulkProcessing(true);
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const data = parseCSV(text);
        let successCount = 0; 
        let errorCount = 0;
        const timestamp = new Date().toISOString();

        const updates: { systemId: string; name: string; address: string; price: number | null }[] = [];
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (row.length < 5 || !row[0]) continue; 
          
          const systemId = row[0].trim();
          const newName = row[2].trim();
          const newAddress = row[3].trim();
          const newPriceRaw = row[4].trim();
          const newPrice = newPriceRaw ? parseFloat(newPriceRaw.replace(/[₦,\s]/g, '')) : null;

          if (newPrice !== null && !Number.isFinite(newPrice)) { errorCount++; continue; }
          updates.push({ systemId, name: newName, address: newAddress, price: newPrice });
        }

        const BATCH_SIZE = 10;
        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
          const batch = updates.slice(i, i + BATCH_SIZE);
          const results = await Promise.all(batch.map(u =>
            supabase.from('stations').update({
                name: u.name, 
                address: u.address, 
                price_pms: u.price, 
                updated_by_role: 'Owner', 
                verified: true, 
                last_updated: timestamp
            }).eq('station_id', u.systemId).eq('manager_id', user.id)
          ));
          results.forEach(({ error }) => { if (error) errorCount++; else successCount++; });
        }
        alert(`Bulk Update Complete!\n\nSuccessfully updated: ${successCount} stations.\nFailed: ${errorCount} stations.`);
        window.location.reload();
      } catch (err) { 
        alert("Error processing CSV."); 
      } finally { 
        setBulkProcessing(false); 
        setShowBulkModal(false); 
      }
    };
    reader.readAsText(file);
  };

  // --- Manager Analytics Calculations ---
  const managerAnalytics = useMemo(() => {
    const approved = stations.filter(s => s.claim_status === 'Approved');
    const pending = stations.filter(s => s.claim_status === 'Pending Review');
    const priced = approved.filter(s => typeof s.price_pms === 'number' && s.price_pms > 0);
    
    const avgPrice = priced.length > 0 
      ? Math.round(priced.reduce((acc, s) => acc + (s.price_pms || 0), 0) / priced.length)
      : 0;

    const diffVsMarket = avgPrice > 0 ? avgPrice - marketAveragePrice : 0;

    // Pump accuracy
    const rated = approved.filter(s => (s.accuracy_votes || 0) > 0);
    const avgAccuracy = rated.length > 0
      ? rated.reduce((acc, s) => acc + (s.pump_accuracy || 0), 0) / rated.length
      : 4.8;
    const totalVotes = approved.reduce((acc, s) => acc + (s.accuracy_votes || 0), 0);

    // Queue distribution across managed stations
    const noQueue = approved.filter(s => s.queue_status === 'No Queue' || s.queue_status === 'Normal').length;
    const moderate = approved.filter(s => s.queue_status === 'Moderate Queue').length;
    const severe = approved.filter(s => s.queue_status === 'Long Queue').length;
    const other = approved.length - noQueue - moderate - severe;

    const queueDonut: DonutSegment[] = [
      { label: 'No Queue (Smooth)', value: noQueue, color: '#10b981' },
      { label: 'Moderate Queue', value: moderate, color: '#f59e0b' },
      { label: 'Long Queue', value: severe, color: '#dc2626' },
      { label: 'Unspecified', value: Math.max(0, other), color: '#94a3b8' },
    ];

    // Price comparison bars for each station vs market benchmark
    const priceBars: BarItem[] = approved.map(s => ({
      label: s.name.length > 20 ? s.name.slice(0, 18) + '...' : s.name,
      value: s.price_pms || 0,
      formattedValue: s.price_pms ? `₦${s.price_pms}` : 'Not set',
      secondaryLabel: s.price_pms 
        ? s.price_pms <= marketAveragePrice 
          ? `₦${marketAveragePrice - s.price_pms} below market` 
          : `₦${s.price_pms - marketAveragePrice} above market`
        : 'Unset',
      color: s.price_pms 
        ? s.price_pms <= marketAveragePrice ? '#10b981' : '#f59e0b'
        : '#cbd5e1'
    }));

    return {
      totalCount: stations.length,
      approvedCount: approved.length,
      pendingCount: pending.length,
      avgPrice,
      diffVsMarket,
      avgAccuracy,
      totalVotes,
      queueDonut,
      priceBars,
      queueAlertCount: moderate + severe,
    };
  }, [stations, marketAveragePrice]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-16">
      
      {/* ======================= NAVBAR ======================= */}
      <nav className="bg-indigo-950 text-white sticky top-0 z-50 border-b border-indigo-900 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 
              className="text-2xl font-black tracking-tight text-emerald-400 cursor-pointer" 
              onClick={() => router.push('/')}
            >
              Qozob.
            </h1>
            <span className="bg-white/10 text-[10px] font-black px-2.5 py-1 rounded-full text-indigo-200 border border-white/10 uppercase tracking-widest hidden sm:inline-block">
              Station Manager Console
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="hidden md:flex items-center gap-1.5 text-xs font-bold text-indigo-200 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl transition-colors border border-white/10"
            >
              <span>View Live Map</span>
              <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
            </button>

            <button
              onClick={() => setShowBulkModal(true)}
              className="bg-emerald-500 hover:bg-emerald-400 text-indigo-950 font-black text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <FileUp className="w-3.5 h-3.5" />
              <span>Bulk Excel</span>
            </button>

            <div className="relative">
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)} 
                className="flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/10 px-3.5 py-2 rounded-xl transition-all"
              >
                <span className="text-xs font-bold truncate max-w-[120px] hidden sm:inline-block">{user.email}</span>
                <Menu className="w-4 h-4 text-emerald-400" />
              </button>
              
              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50 text-slate-800 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-3.5 bg-indigo-50 border-b border-indigo-100">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">Manager Account</span>
                    <span className="text-xs font-bold text-indigo-950 truncate block mt-0.5">{user.email}</span>
                  </div>
                  <div className="p-2 flex flex-col gap-1">
                    <button 
                      onClick={() => router.push('/')} 
                      className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 rounded-xl flex items-center gap-2"
                    >
                      <MapIcon className="w-4 h-4 text-emerald-600" /> Public Map
                    </button>
                    <button 
                      onClick={() => { setShowBulkModal(true); setIsMenuOpen(false); }} 
                      className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 rounded-xl flex items-center gap-2"
                    >
                      <FileUp className="w-4 h-4 text-indigo-600" /> Bulk Excel Update
                    </button>
                    <div className="h-px bg-slate-100 my-1" />
                    <button 
                      onClick={handleSignOut} 
                      className="w-full text-left px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* ======================= MAIN CONTENT ======================= */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 flex flex-col gap-6">
        
        {/* Pending Access Notification */}
        {accessPending && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 shadow-xs">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <p className="font-black text-sm">Manager Access Application Under Review</p>
              <p className="text-amber-800 mt-0.5">
                Your application for station management rights has been sent to the Qozob administration team. 
                You can submit station claims right now from the map. Once reviewed, full control features will unlock.
              </p>
            </div>
          </div>
        )}

        {/* Manager Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-indigo-950 flex items-center gap-2">
              <ShieldCheck className="text-emerald-500 w-8 h-8" />
              <span>Retail Portfolio Overview</span>
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              Monitor pump prices, meter accuracy, and queue traffic across your verified retail filling stations.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/')}
              className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs px-3.5 py-2 rounded-xl transition-colors shadow-xs"
            >
              + Claim Another Station
            </button>
            <div className="flex bg-slate-200 p-1 rounded-xl">
              <button 
                onClick={() => setViewMode('card')} 
                className={`p-1.5 rounded-lg transition-colors ${viewMode === 'card' ? 'bg-white shadow-xs text-indigo-950' : 'text-slate-500 hover:text-slate-800'}`}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode('list')} 
                className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white shadow-xs text-indigo-950' : 'text-slate-500 hover:text-slate-800'}`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ======================= ANALYTICS KPI CARDS ======================= */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Managed Stations"
            value={managerAnalytics.totalCount}
            subtitle={`${managerAnalytics.approvedCount} approved • ${managerAnalytics.pendingCount} pending`}
            icon={Building2}
            colorTheme="indigo"
          />

          <StatCard
            title="Fleet Average PMS"
            value={managerAnalytics.avgPrice > 0 ? `₦${managerAnalytics.avgPrice}` : '—'}
            subtitle={
              managerAnalytics.diffVsMarket < 0 
                ? `₦${Math.abs(managerAnalytics.diffVsMarket)} below market (₦${marketAveragePrice})`
                : managerAnalytics.diffVsMarket > 0
                ? `₦${managerAnalytics.diffVsMarket} above market (₦${marketAveragePrice})`
                : `Matches market average (₦${marketAveragePrice})`
            }
            icon={Fuel}
            badge={{
              text: managerAnalytics.diffVsMarket <= 0 ? 'Competitive' : 'Above Avg',
              variant: managerAnalytics.diffVsMarket <= 0 ? 'positive' : 'warning'
            }}
            colorTheme="emerald"
          />

          <StatCard
            title="Pump Accuracy"
            value={managerAnalytics.totalVotes > 0 ? `${managerAnalytics.avgAccuracy.toFixed(1)} ★` : '5.0 ★'}
            subtitle={`${managerAnalytics.totalVotes} customer reviews`}
            icon={Star}
            badge={{ text: 'Calibrated', variant: 'positive' }}
            colorTheme="amber"
          />

          <StatCard
            title="Queue Alerts"
            value={managerAnalytics.queueAlertCount}
            subtitle={managerAnalytics.queueAlertCount === 0 ? 'Smooth traffic across all stations' : 'High driver wait time reported'}
            icon={AlertCircle}
            badge={managerAnalytics.queueAlertCount > 0 ? { text: 'Queues Active', variant: 'warning' } : { text: 'Optimal', variant: 'positive' }}
            colorTheme={managerAnalytics.queueAlertCount > 0 ? 'rose' : 'emerald'}
          />
        </div>

        {/* ======================= ANALYTICAL CHARTS ======================= */}
        {managerAnalytics.approvedCount > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <BarChart
                title="Outlet Price Comparison vs Market"
                subtitle={`Benchmark: Nationwide regional average is ₦${marketAveragePrice}/Litre`}
                data={managerAnalytics.priceBars}
                layout="horizontal"
                valuePrefix=""
                valueSuffix=""
              />
            </div>

            <DonutChart
              title="Operational Queue Breakdown"
              subtitle="Current congestion level at your outlets"
              data={managerAnalytics.queueDonut}
              centerLabel={managerAnalytics.approvedCount.toString()}
              centerSub="Outlets"
            />
          </div>
        )}

        {/* ======================= STATIONS MANAGEMENT GRID ======================= */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-black text-slate-800">Your Retail Outlets</h3>
            <span className="text-xs text-slate-500 font-medium">{stations.length} total stations registered</span>
          </div>

          {stations.length === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-12 text-center shadow-xs">
              <Building2 className="w-14 h-14 text-slate-300 mx-auto mb-3" />
              <h4 className="text-base font-black text-indigo-950 mb-1">No stations claimed yet</h4>
              <p className="text-slate-500 text-xs max-w-sm mx-auto mb-5">
                Locate your retail stations on the public map and tap &quot;Claim Station&quot; with your CAC incorporation certificate.
              </p>
              <button
                onClick={() => router.push('/')}
                className="bg-indigo-950 hover:bg-indigo-900 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-colors shadow-sm"
              >
                Go to Public Map
              </button>
            </div>
          ) : (
            <div className={viewMode === 'card' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "flex flex-col gap-4"}>
              {stations.map(station => {
                const stationCode = generateStationCode(station.station_id);
                const isPending = station.claim_status === 'Pending Review';
                const isEditingThisPrice = editingPriceId === station.station_id;

                return (
                  <div 
                    key={station.id} 
                    className={`bg-white border ${isPending ? 'border-amber-200' : 'border-slate-200/80'} rounded-3xl p-6 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden flex ${viewMode === 'card' ? 'flex-col justify-between' : 'flex-col lg:flex-row lg:items-center gap-4 lg:gap-6'}`}
                  >
                    <div className={`absolute top-0 left-0 ${isPending ? 'bg-amber-400' : 'bg-emerald-500'} ${viewMode === 'card' ? 'w-full h-1.5' : 'w-full h-1.5 lg:w-1.5 lg:h-full'}`} />
                    
                    {/* Header: Logo + Station Name */}
                    <div className={`flex items-center gap-3.5 ${viewMode === 'card' ? 'mb-4 mt-1' : 'flex-1 pt-3 lg:pt-0'}`}>
                      <div className={`w-14 h-14 rounded-full border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-xs relative ${isPending ? 'opacity-60' : ''}`}>
                        <BrandLogo name={station.name} customLogoUrl={station.custom_logo_url} size={56} imgClassName="p-1" textClassName="text-lg" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <h4 className="font-black text-indigo-950 text-base leading-tight truncate">{station.name}</h4>
                        </div>
                        <span className="inline-block bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-slate-200 mb-1">
                          ID: {stationCode}
                        </span>
                        <p className="text-xs text-slate-500 flex items-center gap-1 truncate max-w-[220px]">
                          <MapPin className="w-3 h-3 shrink-0 text-slate-400" /> {station.address}
                        </p>
                      </div>
                    </div>

                    {/* Middle: Price & Queue Controls */}
                    {isPending ? (
                      <div className={`bg-amber-50 rounded-2xl p-4 border border-amber-100 flex items-center gap-2.5 ${viewMode === 'card' ? 'mb-4' : 'w-full lg:w-56 shrink-0'}`}>
                        <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="text-xs font-bold text-amber-800">Claim Under Admin Review</span>
                      </div>
                    ) : (
                      <div className={`bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col gap-2.5 ${viewMode === 'card' ? 'mb-4' : 'w-full lg:w-64 shrink-0'}`}>
                        {/* Price Inline */}
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Live PMS Price</span>
                          {isEditingThisPrice ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={inlinePriceVal}
                                onChange={e => setInlinePriceVal(e.target.value)}
                                className="w-20 px-2 py-1 text-xs font-black bg-white border border-indigo-500 rounded-lg outline-none font-mono"
                                autoFocus
                              />
                              <button
                                onClick={() => handleInlinePriceSave(station)}
                                disabled={isSavingInline}
                                className="p-1 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingPriceId(null)}
                                className="p-1 text-slate-400 hover:text-slate-600"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-xl font-black text-indigo-950 font-mono">
                                {station.price_pms ? `₦${station.price_pms}` : 'Not Set'}
                              </span>
                              <button
                                onClick={() => {
                                  setEditingPriceId(station.station_id);
                                  setInlinePriceVal(station.price_pms ? String(station.price_pms) : '');
                                }}
                                className="text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200 transition-colors"
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Queue Selector */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-xs">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Queue</span>
                          <select
                            value={station.queue_status || 'Unknown'}
                            onChange={e => handleQueueChange(station, e.target.value)}
                            className="text-[11px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-slate-700 outline-none cursor-pointer focus:border-indigo-600"
                          >
                            <option value="No Queue">No Queue</option>
                            <option value="Moderate Queue">Moderate Queue</option>
                            <option value="Long Queue">Long Queue</option>
                            <option value="Unknown">Unknown</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Bottom Action Buttons */}
                    <div className={`flex gap-2 ${viewMode === 'card' ? 'mt-auto' : 'w-full lg:w-auto shrink-0'}`}>
                      <button 
                        onClick={() => openEditModal(station)} 
                        disabled={isPending} 
                        className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold py-2.5 px-3 rounded-xl transition-colors border border-indigo-100 text-xs disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                      >
                        Full Details
                      </button>
                      <a 
                        href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold py-2.5 px-3 rounded-xl transition-colors border border-emerald-100 text-xs flex items-center justify-center gap-1 shadow-xs"
                      >
                        <Navigation className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Map</span>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* ======================= BULK UPLOAD MODAL ======================= */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full relative shadow-2xl border border-slate-100">
            <button 
              onClick={() => setShowBulkModal(false)} 
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-2xl font-black text-indigo-950 mb-1">Bulk Excel Manager</h3>
            <p className="text-xs text-slate-500 mb-6">Synchronize pricing for all your managed stations at once.</p>
            
            <div className="bg-indigo-50 rounded-2xl p-5 mb-5 border border-indigo-100 flex flex-col gap-4">
              <div className="flex gap-3">
                <div className="bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center shrink-0 font-black text-[11px] mt-0.5">1</div>
                <div>
                  <h4 className="text-xs font-bold text-indigo-950">Download prefilled template</h4>
                  <p className="text-[11px] text-indigo-700/80 mt-0.5 mb-2.5">Contains your stations and unique system codes.</p>
                  <button 
                    onClick={downloadBulkTemplate} 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-3.5 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <FileDown className="w-3.5 h-3.5" /> Download CSV
                  </button>
                </div>
              </div>

              <div className="h-px bg-indigo-200/60 w-full" />

              <div className="flex gap-3">
                <div className="bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center shrink-0 font-black text-[11px] mt-0.5">2</div>
                <div className="w-full">
                  <h4 className="text-xs font-bold text-indigo-950">Upload updated CSV</h4>
                  <label className="w-full bg-white border border-dashed border-indigo-300 hover:border-indigo-500 hover:bg-indigo-50/50 transition-colors rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer group mt-2">
                    <FileUp className="w-5 h-5 text-indigo-500 group-hover:scale-110 transition-transform mb-1" />
                    <span className="text-xs font-bold text-indigo-700">Choose CSV Spreadsheet</span>
                    <input type="file" accept=".csv" className="hidden" onChange={handleBulkUpload} disabled={bulkProcessing} />
                  </label>
                  {bulkProcessing && (
                    <p className="text-[11px] text-emerald-600 font-bold mt-2 flex items-center gap-1 animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Updating database in parallel...
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-start gap-2 bg-amber-50 p-3 rounded-xl border border-amber-100 text-amber-900 text-xs">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="leading-snug"><strong>Note:</strong> Please keep the &quot;System_ID&quot; column intact to ensure accurate station matching.</p>
            </div>
          </div>
        </div>
      )}

      {/* ======================= SINGLE EDIT MODAL ======================= */}
      {editingStation && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full relative shadow-2xl max-h-[90vh] overflow-y-auto border border-slate-100">
            <button 
              onClick={() => setEditingStation(null)} 
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-2xl font-black text-indigo-950 mb-0.5">Edit Station Details</h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-5">
              Code: {generateStationCode(editingStation.station_id)}
            </span>

            <div className="flex flex-col gap-3.5">
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">Station Name</label>
                <input 
                  type="text" 
                  value={editName} 
                  onChange={(e) => setEditName(e.target.value)} 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-600 font-bold text-slate-800 text-sm" 
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">Address</label>
                <textarea 
                  value={editAddress} 
                  onChange={(e) => setEditAddress(e.target.value)} 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-600 text-xs text-slate-700 resize-none h-18" 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">PMS Price (₦)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={editPrice} 
                    onChange={(e) => setEditPrice(e.target.value)} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-lg font-black outline-none focus:border-emerald-500 text-indigo-950 font-mono" 
                    placeholder="950" 
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">Queue State</label>
                  <select
                    value={editQueue}
                    onChange={(e) => setEditQueue(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold outline-none focus:border-indigo-600 text-slate-700 h-[52px]"
                  >
                    <option value="No Queue">No Queue</option>
                    <option value="Moderate Queue">Moderate</option>
                    <option value="Long Queue">Long Queue</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">Custom Brand Logo</label>
                <div className="flex items-center gap-3 bg-indigo-50/60 p-3.5 rounded-xl border border-indigo-100">
                  {editLogoUrl ? (
                    <img src={editLogoUrl} alt="Preview" className="w-10 h-10 rounded-full border border-slate-200 object-contain bg-white" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-slate-200">
                      <ImageIcon className="w-4 h-4 text-slate-300" />
                    </div>
                  )}
                  <div className="flex-1">
                    <input 
                      type="file" 
                      accept="image/png, image/jpeg" 
                      onChange={handleLogoUpload} 
                      disabled={uploadingLogo} 
                      className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer disabled:opacity-50" 
                    />
                    {uploadingLogo && <p className="text-[10px] text-indigo-600 mt-1 font-bold animate-pulse">Uploading logo...</p>}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2.5 mt-6">
              <button 
                onClick={() => setEditingStation(null)} 
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition-all text-xs"
              >
                Cancel
              </button>
              <button 
                onClick={saveStationUpdates} 
                disabled={isSaving || uploadingLogo || !editName} 
                className="flex-[2] bg-emerald-500 hover:bg-emerald-600 text-white font-black py-3 rounded-xl transition-all disabled:opacity-50 flex justify-center items-center gap-1.5 text-xs shadow-sm"
              >
                {isSaving ? "Publishing..." : <><CheckCircle2 className="w-4 h-4" /> Save & Broadcast</>}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}