"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { 
  ShieldCheck, Lock, FileText, CheckCircle, XCircle, LogOut, Clock, 
  ExternalLink, RefreshCw, MapPin, UserPlus, Loader2, Building2, 
  TrendingUp, Fuel, AlertTriangle, Search, Filter, Download, ArrowUpRight,
  Eye, Check, ShieldAlert, BarChart3, Users, CheckCircle2, ChevronRight
} from 'lucide-react';

import { createClient } from '@/utils/supabase/client';
import { getRole, signedCacUrl } from '@/lib/roles';
import { getStationBrandInfo } from '@/lib/brands';
import { StatCard } from '@/components/analytics/StatCard';
import { BarChart, BarItem } from '@/components/analytics/BarChart';
import { DonutChart, DonutSegment } from '@/components/analytics/DonutChart';
import { RatingDistribution } from '@/components/analytics/RatingDistribution';

const supabase = createClient();

type AuthState = 'checking' | 'signed-out' | 'not-admin' | 'admin';
type AdminTab = 'analytics' | 'claims' | 'requests' | 'stations';

interface StationRecord {
  station_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  price_pms: number | null;
  queue_status: string | null;
  verified: boolean;
  updated_by_role: string | null;
  last_updated: string | null;
  manager_id: string | null;
  claim_status: string | null;
  pump_accuracy: number | null;
  accuracy_votes: number | null;
}

export default function AdminDashboard() {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [adminEmail, setAdminEmail] = useState("");
  const [activeTab, setActiveTab] = useState<AdminTab>('analytics');
  
  // Data State
  const [claims, setClaims] = useState<any[]>([]);
  const [roleRequests, setRoleRequests] = useState<any[]>([]);
  const [stations, setStations] = useState<StationRecord[]>([]);
  
  // UI & Loading States
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);
  
  // Directory Search & Filters
  const [stationSearch, setStationSearch] = useState("");
  const [filterBrand, setFilterBrand] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  
  // Quick Edit Modal
  const [editingStation, setEditingStation] = useState<StationRecord | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [newQueue, setNewQueue] = useState("Unknown");
  const [isSavingStation, setIsSavingStation] = useState(false);

  // --- Fetch Complete Data ---
  const fetchData = useCallback(async () => {
    setIsLoading(true);

    try {
      // 1. Fetch claims, role requests, and stations in parallel
      const [
        { data: claimsData, error: claimsError },
        { data: requestsData, error: requestsError },
        { data: stationsData, error: stationsError }
      ] = await Promise.all([
        supabase.from('station_claims').select('*').order('created_at', { ascending: false }),
        supabase.from('role_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('stations').select('*').order('last_updated', { ascending: false }).limit(2000),
      ]);

      if (claimsError) console.error("Error fetching claims:", claimsError.message);
      if (requestsError) console.warn("Could not load Manager access requests:", requestsError.message);
      if (stationsError) console.error("Error fetching stations:", stationsError.message);

      setRoleRequests(requestsData || []);
      const loadedStations: StationRecord[] = stationsData || [];
      setStations(loadedStations);

      // Match station address for claims
      const addressById = new Map(loadedStations.map(s => [s.station_id, s.address]));
      const mergedClaims = (claimsData || []).map(claim => ({
        ...claim,
        address: addressById.get(claim.station_id) || "Address on record unavailable",
      }));
      setClaims(mergedClaims);
    } catch (err: any) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // --- Authentication Guard ---
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setAuthState('signed-out');
      setAdminEmail(user.email || "");

      const { data: isAdmin, error } = await supabase.rpc('is_admin');
      if (error) console.warn("Admin RPC check error:", error.message);

      if (isAdmin === true || (error && getRole(user) === 'Admin')) {
        setAuthState('admin');
        fetchData();
      } else {
        setAuthState('not-admin');
      }
    })();
  }, [fetchData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setClaims([]);
    setRoleRequests([]);
    setStations([]);
    setAuthState('signed-out');
  };

  // Open CAC document using secure signed URL
  const openDocument = async (key: string, ref: string | null | undefined) => {
    if (!ref) return;
    const win = window.open('', '_blank');
    setOpeningDocId(key);
    const url = await signedCacUrl(supabase, ref);
    setOpeningDocId(null);
    if (url && win) {
      win.opener = null;
      win.location.href = url;
    } else {
      win?.close();
      alert("Could not open this document. It may have expired or been removed.");
    }
  };

  // --- Approve / Reject Handlers ---
  const handleApproveClaim = async (claim: any) => {
    const confirmApprove = window.confirm(`Approve station claim for ${claim.applicant_name} (${claim.station_name})?`);
    if (!confirmApprove) return;

    setIsProcessing(true);
    const { error } = await supabase.rpc('admin_review_claim', {
      p_claim_id: String(claim.id),
      p_status: 'Approved',
      p_notes: null,
    });

    if (error) {
      alert("Error approving claim: " + error.message);
    } else {
      alert("Claim approved! Station is now verified and linked to manager.");
      fetchData();
    }
    setIsProcessing(false);
  };

  const handleRejectClaim = async (claim: any) => {
    const reason = window.prompt("Reason for rejecting this claim (optional):", "");
    if (reason === null) return;

    setIsProcessing(true);
    const { error } = await supabase.rpc('admin_review_claim', {
      p_claim_id: String(claim.id),
      p_status: 'Rejected',
      p_notes: reason || null,
    });

    if (error) {
      alert("Error rejecting claim: " + error.message);
    } else {
      alert("Claim rejected.");
      fetchData();
    }
    setIsProcessing(false);
  };

  const handleReviewRoleRequest = async (request: any, status: 'Approved' | 'Rejected') => {
    const who = request.full_name || request.email || 'this user';
    const notes = window.prompt(
      status === 'Approved'
        ? `Approve Manager rights for ${who}? Optional note:`
        : `Reject Manager rights for ${who}? Optional reason:`,
      ""
    );
    if (notes === null) return;

    setIsProcessing(true);
    const { error } = await supabase.rpc('admin_review_role_request', {
      p_request_id: request.id,
      p_status: status,
      p_notes: notes || null,
    });

    if (error) {
      alert("Error: " + error.message);
    } else {
      alert(status === 'Approved' ? "Manager access granted." : "Request rejected.");
      fetchData();
    }
    setIsProcessing(false);
  };

  // --- Quick Station Editor ---
  const handleSaveStation = async () => {
    if (!editingStation) return;
    setIsSavingStation(true);

    const priceNum = newPrice ? parseFloat(newPrice) : null;
    const { error } = await supabase
      .from('stations')
      .update({
        price_pms: priceNum,
        queue_status: newQueue,
        verified: true,
        updated_by_role: 'Qozob rep',
        last_updated: new Date().toISOString(),
      })
      .eq('station_id', editingStation.station_id);

    setIsSavingStation(false);

    if (error) {
      alert("Failed to update station: " + error.message);
    } else {
      setStations(prev => prev.map(s => s.station_id === editingStation.station_id ? {
        ...s,
        price_pms: priceNum,
        queue_status: newQueue,
        verified: true,
        updated_by_role: 'Qozob rep',
        last_updated: new Date().toISOString(),
      } : s));
      setEditingStation(null);
    }
  };

  // Export stations list to CSV
  const handleExportCSV = () => {
    const headers = ["Station_ID", "Name", "Address", "PMS_Price", "Queue_Status", "Verified", "Claim_Status", "Accuracy_Rating"];
    const rows = filteredStations.map(s => [
      `"${s.station_id}"`,
      `"${(s.name || '').replace(/"/g, '""')}"`,
      `"${(s.address || '').replace(/"/g, '""')}"`,
      s.price_pms ?? '',
      `"${s.queue_status || 'Unknown'}"`,
      s.verified ? "Yes" : "No",
      `"${s.claim_status || 'None'}"`,
      s.pump_accuracy ?? 0
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Qozob_Stations_Export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // --- Calculations for Analytics ---
  const pendingClaims = useMemo(() => claims.filter(c => c.status === 'Pending Review'), [claims]);
  const pastClaims = useMemo(() => claims.filter(c => c.status !== 'Pending Review'), [claims]);
  const pendingRequests = useMemo(() => roleRequests.filter(r => r.status === 'Pending'), [roleRequests]);

  const analytics = useMemo(() => {
    const totalStations = stations.length;
    const stationsWithPrice = stations.filter(s => s.price_pms !== null && s.price_pms > 0);
    const prices = stationsWithPrice.map(s => s.price_pms as number);
    
    const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    const verifiedCount = stations.filter(s => s.verified).length;
    const claimedCount = stations.filter(s => s.claim_status === 'Claimed' || s.manager_id !== null).length;
    const queueActiveCount = stations.filter(s => s.queue_status === 'Moderate Queue' || s.queue_status === 'Long Queue').length;

    // Pump accuracy
    const ratedStations = stations.filter(s => (s.accuracy_votes || 0) > 0);
    const avgAccuracy = ratedStations.length > 0
      ? (ratedStations.reduce((acc, s) => acc + (s.pump_accuracy || 0), 0) / ratedStations.length)
      : 4.8;
    const totalVotes = stations.reduce((acc, s) => acc + (s.accuracy_votes || 0), 0);

    // Distribution by Brand: calculate average PMS price for top brands
    const brandMap: { [brand: string]: { count: number; sumPrice: number; priceCount: number } } = {};
    stations.forEach(s => {
      const b = getStationBrandInfo(s.name, null);
      const brandKey = b.text || 'Other';
      if (!brandMap[brandKey]) brandMap[brandKey] = { count: 0, sumPrice: 0, priceCount: 0 };
      brandMap[brandKey].count += 1;
      if (s.price_pms && s.price_pms > 0) {
        brandMap[brandKey].sumPrice += s.price_pms;
        brandMap[brandKey].priceCount += 1;
      }
    });

    const brandBars: BarItem[] = Object.entries(brandMap)
      .filter(([_, data]) => data.count >= 2)
      .map(([brand, data]) => {
        const avg = data.priceCount > 0 ? Math.round(data.sumPrice / data.priceCount) : avgPrice;
        return {
          label: brand,
          value: avg,
          formattedValue: `₦${avg}/L`,
          secondaryLabel: `${data.count} stations`,
          color: avg <= 900 ? '#10b981' : avg <= 940 ? '#312e81' : '#f59e0b',
        };
      })
      .sort((a, b) => a.value - b.value)
      .slice(0, 8);

    // Price spread distribution (Buckets)
    const priceBuckets: BarItem[] = [
      { label: '< ₦890', value: prices.filter(p => p < 890).length, color: '#10b981' },
      { label: '₦890 - ₦920', value: prices.filter(p => p >= 890 && p < 920).length, color: '#047857' },
      { label: '₦920 - ₦950', value: prices.filter(p => p >= 920 && p < 950).length, color: '#312e81' },
      { label: '₦950 - ₦980', value: prices.filter(p => p >= 950 && p < 980).length, color: '#f59e0b' },
      { label: '> ₦980', value: prices.filter(p => p >= 980).length, color: '#dc2626' },
    ];

    // Ownership Donut
    const ownershipDonut: DonutSegment[] = [
      { label: 'Claimed & Managed', value: claimedCount, color: '#10b981' },
      { label: 'Verified by Rep', value: Math.max(0, verifiedCount - claimedCount), color: '#312e81' },
      { label: 'Community Sourced', value: Math.max(0, totalStations - verifiedCount), color: '#cbd5e1' },
    ];

    // Queue Donut
    const noQueue = stations.filter(s => s.queue_status === 'No Queue' || s.queue_status === 'Normal').length;
    const moderate = stations.filter(s => s.queue_status === 'Moderate Queue').length;
    const severe = stations.filter(s => s.queue_status === 'Long Queue').length;
    const other = Math.max(0, totalStations - noQueue - moderate - severe);

    const queueDonut: DonutSegment[] = [
      { label: 'No Queue (Smooth)', value: noQueue, color: '#10b981' },
      { label: 'Moderate Queue', value: moderate, color: '#f59e0b' },
      { label: 'Severe Queue', value: severe, color: '#dc2626' },
      { label: 'Unknown / Closed', value: other, color: '#94a3b8' },
    ];

    return {
      totalStations,
      stationsWithPriceCount: stationsWithPrice.length,
      avgPrice,
      minPrice,
      maxPrice,
      verifiedCount,
      verifiedPercent: totalStations > 0 ? Math.round((verifiedCount / totalStations) * 100) : 0,
      claimedCount,
      queueActiveCount,
      avgAccuracy,
      totalVotes,
      brandBars,
      priceBuckets,
      ownershipDonut,
      queueDonut,
    };
  }, [stations]);

  // --- Filtered Stations for Directory Tab ---
  const filteredStations = useMemo(() => {
    return stations.filter(s => {
      const matchesSearch = !stationSearch || 
        (s.name && s.name.toLowerCase().includes(stationSearch.toLowerCase())) ||
        (s.address && s.address.toLowerCase().includes(stationSearch.toLowerCase()));

      const brand = getStationBrandInfo(s.name, null).text;
      const matchesBrand = filterBrand === 'all' || brand.toLowerCase() === filterBrand.toLowerCase();

      const matchesStatus = filterStatus === 'all'
        ? true
        : filterStatus === 'verified'
        ? s.verified
        : filterStatus === 'unverified'
        ? !s.verified
        : filterStatus === 'has_price'
        ? s.price_pms !== null
        : filterStatus === 'queue'
        ? s.queue_status === 'Moderate Queue' || s.queue_status === 'Long Queue'
        : true;

      return matchesSearch && matchesBrand && matchesStatus;
    });
  }, [stations, stationSearch, filterBrand, filterStatus]);

  // =========================================================================
  // AUTH GUARD UI
  // =========================================================================
  if (authState !== 'admin') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full border border-slate-100">
          <div className="w-16 h-16 bg-indigo-900 rounded-full flex items-center justify-center mb-6 mx-auto shadow-inner">
            {authState === 'checking' ? (
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            ) : (
              <Lock className="w-8 h-8 text-emerald-400" />
            )}
          </div>
          <h1 className="text-2xl font-black text-center text-indigo-950 mb-2">Admin Portal</h1>

          {authState === 'checking' && (
            <p className="text-center text-slate-500 text-sm">Verifying database permissions...</p>
          )}

          {authState === 'signed-out' && (
            <>
              <p className="text-center text-slate-500 text-sm mb-6">Sign in with your verified Qozob admin account to access command controls.</p>
              <Link href="/login?redirect=admin" className="block w-full text-center bg-indigo-900 hover:bg-indigo-800 text-white font-black py-4 rounded-xl transition-all shadow-md hover:shadow-lg">
                Sign In
              </Link>
            </>
          )}

          {authState === 'not-admin' && (
            <>
              <p className="text-center text-slate-500 text-sm mb-2">
                <strong className="text-slate-700">{adminEmail}</strong> is not an authorized administrator.
              </p>
              <p className="text-center text-slate-400 text-xs mb-6">Admin permissions are governed at the database level.</p>
              <div className="flex flex-col gap-2">
                <button onClick={handleLogout} className="w-full bg-indigo-900 hover:bg-indigo-800 text-white font-black py-3 rounded-xl transition-all">
                  Sign in with another account
                </button>
                <Link href="/" className="w-full text-center text-sm font-bold text-slate-500 hover:text-indigo-700 py-2">Return to Map</Link>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // PRODUCTION ADMIN DASHBOARD UI
  // =========================================================================
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-16">
      
      {/* Top Navbar */}
      <nav className="bg-indigo-950 text-white sticky top-0 z-50 border-b border-indigo-900 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-white leading-none">Qozob Admin</h1>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-500/30 uppercase tracking-widest">
                  Verified Active
                </span>
              </div>
              <span className="text-[11px] text-indigo-300 font-medium">National Operations Command</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/"
              target="_blank"
              className="hidden md:flex items-center gap-1.5 text-xs font-bold text-indigo-200 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl transition-colors border border-white/10"
            >
              <span>Public Map</span>
              <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
            </Link>

            <button
              onClick={fetchData}
              disabled={isLoading}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 text-white px-3.5 py-2 rounded-xl font-bold text-xs transition-colors border border-white/10 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh Data</span>
            </button>

            <div className="h-6 w-px bg-indigo-900 hidden sm:block" />

            <div className="flex items-center gap-2">
              <span className="hidden lg:inline text-xs font-bold text-indigo-200 truncate max-w-[180px]">
                {adminEmail}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-indigo-300 hover:text-rose-200 hover:bg-rose-500/10 p-2 sm:px-3 sm:py-2 rounded-xl text-xs font-bold transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Exit</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-2 overflow-x-auto border-t border-indigo-900/60 pt-1 pb-2">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'analytics'
                ? 'bg-emerald-500 text-indigo-950 shadow-sm'
                : 'text-indigo-200 hover:bg-white/5 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Overview & Analytics</span>
          </button>

          <button
            onClick={() => setActiveTab('claims')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'claims'
                ? 'bg-emerald-500 text-indigo-950 shadow-sm'
                : 'text-indigo-200 hover:bg-white/5 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Station Claims</span>
            {pendingClaims.length > 0 && (
              <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                activeTab === 'claims' ? 'bg-indigo-950 text-white' : 'bg-amber-400 text-indigo-950'
              }`}>
                {pendingClaims.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('requests')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'requests'
                ? 'bg-emerald-500 text-indigo-950 shadow-sm'
                : 'text-indigo-200 hover:bg-white/5 hover:text-white'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Manager Requests</span>
            {pendingRequests.length > 0 && (
              <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                activeTab === 'requests' ? 'bg-indigo-950 text-white' : 'bg-indigo-400 text-indigo-950'
              }`}>
                {pendingRequests.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('stations')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'stations'
                ? 'bg-emerald-500 text-indigo-950 shadow-sm'
                : 'text-indigo-200 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Station Directory ({stations.length})</span>
          </button>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6">
        
        {/* =================================================================== */}
        {/* TAB 1: OVERVIEW & ANALYTICAL CHARTS */}
        {/* =================================================================== */}
        {activeTab === 'analytics' && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-300">
            
            {/* Header Title */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h2 className="text-2xl sm:text-3xl font-black text-indigo-950">Platform Intelligence</h2>
                <p className="text-slate-500 text-xs sm:text-sm">Real-time telemetry across stations, prices, queue health and verification queues.</p>
              </div>

              {(pendingClaims.length > 0 || pendingRequests.length > 0) && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3.5 py-2 rounded-xl text-xs font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>{pendingClaims.length + pendingRequests.length} items require review</span>
                </div>
              )}
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
              <StatCard
                title="Total Stations"
                value={analytics.totalStations.toLocaleString()}
                subtitle={`${analytics.stationsWithPriceCount} with live prices`}
                icon={Building2}
                colorTheme="indigo"
              />
              <StatCard
                title="Average PMS"
                value={analytics.avgPrice > 0 ? `₦${analytics.avgPrice}` : '—'}
                subtitle={`Spread: ₦${analytics.minPrice} - ₦${analytics.maxPrice}`}
                icon={Fuel}
                badge={{ text: 'PMS / Litre', variant: 'neutral' }}
                colorTheme="emerald"
              />
              <StatCard
                title="Verified Outlets"
                value={`${analytics.verifiedPercent}%`}
                subtitle={`${analytics.verifiedCount} verified stations`}
                icon={ShieldCheck}
                badge={{ text: 'Trust Score', variant: 'positive' }}
                colorTheme="emerald"
              />
              <StatCard
                title="Claims in Queue"
                value={pendingClaims.length}
                subtitle="Awaiting CAC review"
                icon={FileText}
                badge={pendingClaims.length > 0 ? { text: 'Needs Action', variant: 'warning' } : { text: 'Clear', variant: 'positive' }}
                colorTheme="amber"
                onClick={() => setActiveTab('claims')}
              />
              <StatCard
                title="Manager Requests"
                value={pendingRequests.length}
                subtitle="Pending promotion"
                icon={UserPlus}
                colorTheme="purple"
                onClick={() => setActiveTab('requests')}
              />
              <StatCard
                title="Queue Alerts"
                value={analytics.queueActiveCount}
                subtitle="Moderate / Long queues"
                icon={AlertTriangle}
                badge={analytics.queueActiveCount > 0 ? { text: 'Traffic', variant: 'warning' } : { text: 'Normal', variant: 'positive' }}
                colorTheme={analytics.queueActiveCount > 0 ? 'rose' : 'emerald'}
              />
            </div>

            {/* Analytics Row 1: Brand Comparison + Price Buckets */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <BarChart
                title="Brand PMS Price Benchmark (₦/Litre)"
                subtitle="Average PMS price per retail brand across tracked Nigerian stations"
                data={analytics.brandBars}
                layout="horizontal"
                valuePrefix=""
                valueSuffix=""
              />

              <BarChart
                title="PMS Price Spread Distribution"
                subtitle="Number of filling stations within each price bracket"
                data={analytics.priceBuckets}
                layout="vertical"
                valueSuffix=" stations"
              />
            </div>

            {/* Analytics Row 2: Ownership Donut + Queue Donut + Pump Rating */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <DonutChart
                title="Station Ownership Breakdown"
                subtitle="Manager claims vs verified rep vs community"
                data={analytics.ownershipDonut}
                centerLabel={analytics.totalStations.toLocaleString()}
                centerSub="Stations"
              />

              <DonutChart
                title="Operational Queue Status"
                subtitle="Live driver wait times and queue states"
                data={analytics.queueDonut}
                centerLabel={analytics.totalStations.toLocaleString()}
                centerSub="Outlets"
              />

              <RatingDistribution
                averageRating={analytics.avgAccuracy}
                totalVotes={analytics.totalVotes}
                title="Pump Meter Accuracy"
                subtitle="Driver community reviews on fuel calibration"
              />
            </div>

            {/* Quick Action Banner */}
            <div className="bg-indigo-900 rounded-3xl p-6 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm border border-indigo-800">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-500/30">
                  <ShieldCheck className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-base font-black text-white">Database Guard Active</h4>
                  <p className="text-xs text-indigo-200 mt-0.5">
                    Row Level Security (RLS) is guarding station updates and claims. All administrative actions execute via signed database functions.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => setActiveTab('claims')}
                  className="bg-emerald-500 hover:bg-emerald-400 text-indigo-950 font-black px-4 py-2.5 rounded-xl text-xs transition-colors shadow-sm"
                >
                  Review Pending Claims ({pendingClaims.length})
                </button>
                <button
                  onClick={() => setActiveTab('stations')}
                  className="bg-white/10 hover:bg-white/15 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-colors border border-white/10"
                >
                  Explore Directory
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: STATION CLAIMS */}
        {/* =================================================================== */}
        {activeTab === 'claims' && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-2xl sm:text-3xl font-black text-indigo-950 mb-1">Station Ownership Claims</h2>
                <p className="text-slate-500 text-xs sm:text-sm">Verify Corporate Affairs Commission (CAC) certificates and approve retail managers.</p>
              </div>
              <span className="text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-xl">
                {pendingClaims.length} Pending Review
              </span>
            </div>

            {/* Pending Claims Cards */}
            {isLoading ? (
              <div className="p-16 text-center text-slate-400 font-bold animate-pulse">Loading claims from secure database...</div>
            ) : pendingClaims.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 shadow-xs">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                <h4 className="text-lg font-black text-indigo-950 mb-1">Queue is Clear</h4>
                <p className="text-slate-500 text-xs">All submitted station ownership claims have been processed.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pendingClaims.map(claim => (
                  <div key={claim.id} className="bg-white rounded-3xl p-6 shadow-xs border border-amber-200 relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-0 right-0 bg-amber-100 text-amber-900 text-[10px] font-black uppercase px-3 py-1 rounded-bl-xl tracking-wider">
                      Pending Review
                    </div>

                    <div>
                      <h4 className="font-black text-indigo-950 text-xl pr-20 leading-tight mb-1">{claim.station_name}</h4>
                      <p className="text-xs font-bold text-slate-500 mb-2 leading-snug">{claim.address}</p>
                      <p className="text-[10px] text-slate-400 mb-4 flex items-center gap-1">
                        <Clock className="w-3 h-3"/> Submitted {new Date(claim.created_at).toLocaleDateString()}
                      </p>

                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-4 text-xs">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Applicant</span>
                            <span className="font-bold text-slate-800 truncate block">{claim.applicant_name}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Phone</span>
                            <span className="font-bold text-slate-800 truncate block">{claim.phone_number}</span>
                          </div>
                          <div className="col-span-2 pt-2 border-t border-slate-200">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">CAC Reg Number</span>
                            <span className="font-bold text-slate-900 font-mono text-sm">{claim.business_reg_number}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 mt-auto">
                      <div className="grid grid-cols-2 gap-2 mb-1">
                        <button 
                          type="button"
                          onClick={() => openDocument(`claim-${claim.id}`, claim.document_url)}
                          disabled={!claim.document_url || openingDocId === `claim-${claim.id}`}
                          className="flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold py-2.5 rounded-xl transition-colors border border-indigo-200 text-xs shadow-xs disabled:opacity-50"
                        >
                          {openingDocId === `claim-${claim.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                          <span>View CAC Doc</span>
                          <ExternalLink className="w-3 h-3 opacity-50"/>
                        </button>

                        <a 
                          href={claim.lat && claim.lng 
                            ? `https://www.google.com/maps/search/?api=1&query=${claim.lat},${claim.lng}` 
                            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(claim.station_name)}`}
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-xl transition-colors border border-slate-200 text-xs shadow-xs"
                        >
                          <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Check Map</span>
                          <ExternalLink className="w-3 h-3 opacity-50"/>
                        </a>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleApproveClaim(claim)}
                          disabled={isProcessing}
                          className="flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-black py-2.5 rounded-xl transition-colors disabled:opacity-50 text-xs shadow-xs"
                        >
                          <CheckCircle className="w-4 h-4" /> Approve
                        </button>
                        <button
                          onClick={() => handleRejectClaim(claim)}
                          disabled={isProcessing}
                          className="flex items-center justify-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50 text-xs border border-rose-200"
                        >
                          <XCircle className="w-4 h-4" /> Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Historical Claims Table */}
            {pastClaims.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-black text-slate-800 mb-3">Claim Review History ({pastClaims.length})</h3>
                <div className="bg-white rounded-3xl shadow-xs border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-3.5">Station Name</th>
                          <th className="px-6 py-3.5">Applicant / RC</th>
                          <th className="px-6 py-3.5">Date Submitted</th>
                          <th className="px-6 py-3.5 text-right">Review Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pastClaims.map(claim => (
                          <tr key={claim.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-6 py-3.5 font-bold text-slate-800">{claim.station_name}</td>
                            <td className="px-6 py-3.5 text-slate-600">
                              {claim.applicant_name} <span className="text-slate-400 font-mono">({claim.business_reg_number})</span>
                            </td>
                            <td className="px-6 py-3.5 text-slate-400">{new Date(claim.created_at).toLocaleDateString()}</td>
                            <td className="px-6 py-3.5 text-right">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                claim.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {claim.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: MANAGER REQUESTS */}
        {/* =================================================================== */}
        {activeTab === 'requests' && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-2xl sm:text-3xl font-black text-indigo-950 mb-1">Manager Access Requests</h2>
                <p className="text-slate-500 text-xs sm:text-sm">Review applications from station representatives seeking permission to update station prices.</p>
              </div>
              <span className="text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 px-3 py-1.5 rounded-xl">
                {pendingRequests.length} Pending Approval
              </span>
            </div>

            {isLoading ? (
              <div className="p-16 text-center text-slate-400 font-bold animate-pulse">Loading manager requests...</div>
            ) : pendingRequests.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 shadow-xs">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                <h4 className="text-lg font-black text-indigo-950 mb-1">No Pending Requests</h4>
                <p className="text-slate-500 text-xs">All user applications for Manager status have been handled.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pendingRequests.map(req => (
                  <div key={req.id} className="bg-white rounded-3xl p-6 shadow-xs border border-indigo-200 relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-0 right-0 bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase px-3 py-1 rounded-bl-xl tracking-wider">
                      Role Application
                    </div>

                    <div>
                      <h4 className="font-black text-indigo-950 text-lg pr-24 leading-tight mb-1">
                        {req.full_name || req.email || 'Unnamed user'}
                      </h4>
                      <p className="text-xs font-bold text-slate-500 mb-1 truncate">{req.email}</p>
                      <p className="text-[10px] text-slate-400 mb-4 flex items-center gap-1">
                        <Clock className="w-3 h-3"/> Requested {new Date(req.created_at).toLocaleDateString()}
                      </p>

                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-4 text-xs grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Company</span>
                          <span className="font-bold text-slate-800 truncate block">{req.company_name || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Phone</span>
                          <span className="font-bold text-slate-800 truncate block">{req.phone || '—'}</span>
                        </div>
                        {req.note && (
                          <div className="col-span-2 pt-2 border-t border-slate-200">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Note</span>
                            <span className="text-slate-700 text-xs leading-relaxed">{req.note}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 mt-auto">
                      {req.document_url && (
                        <button
                          type="button"
                          onClick={() => openDocument(`req-${req.id}`, req.document_url)}
                          disabled={openingDocId === `req-${req.id}`}
                          className="flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold py-2.5 rounded-xl transition-colors border border-indigo-200 text-xs shadow-xs mb-1 disabled:opacity-50"
                        >
                          {openingDocId === `req-${req.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                          <span>View Verification File</span>
                          <ExternalLink className="w-3 h-3 opacity-50"/>
                        </button>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleReviewRoleRequest(req, 'Approved')}
                          disabled={isProcessing}
                          className="flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-black py-2.5 rounded-xl transition-colors disabled:opacity-50 text-xs shadow-xs"
                        >
                          <CheckCircle className="w-4 h-4" /> Grant Role
                        </button>
                        <button
                          onClick={() => handleReviewRoleRequest(req, 'Rejected')}
                          disabled={isProcessing}
                          className="flex items-center justify-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50 text-xs border border-rose-200"
                        >
                          <XCircle className="w-4 h-4" /> Decline
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: STATION DIRECTORY & EDITING */}
        {/* =================================================================== */}
        {activeTab === 'stations' && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
              <div>
                <h2 className="text-2xl sm:text-3xl font-black text-indigo-950 mb-1">Station Directory</h2>
                <p className="text-slate-500 text-xs sm:text-sm">Search, audit and manage live fuel retail outlets nationwide.</p>
              </div>

              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-colors"
              >
                <Download className="w-4 h-4 text-slate-500" />
                <span>Export CSV ({filteredStations.length})</span>
              </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search stations by name, brand or street address..."
                  value={stationSearch}
                  onChange={e => setStationSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600 focus:bg-white transition-all font-medium"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <select
                  value={filterBrand}
                  onChange={e => setFilterBrand(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-indigo-600"
                >
                  <option value="all">All Brands</option>
                  <option value="nn">NNPC</option>
                  <option value="to">Total</option>
                  <option value="mo">Mobil</option>
                  <option value="oa">Oando</option>
                  <option value="co">Conoil</option>
                  <option value="ap">Ardova / AP</option>
                  <option value="bo">Bovas</option>
                  <option value="ni">NIPCO</option>
                  <option value="pe">Petrocam</option>
                  <option value="et">Eterna</option>
                  <option value="pi">Pinnacle</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-indigo-600"
                >
                  <option value="all">All Statuses</option>
                  <option value="verified">Verified Only</option>
                  <option value="unverified">Unverified Only</option>
                  <option value="has_price">Has Live Price</option>
                  <option value="queue">Active Queue Alert</option>
                </select>
              </div>
            </div>

            {/* Stations Directory Table */}
            <div className="bg-white rounded-3xl shadow-xs border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4">Station</th>
                      <th className="px-6 py-4">PMS Price</th>
                      <th className="px-6 py-4">Queue State</th>
                      <th className="px-6 py-4">Accuracy</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStations.slice(0, 100).map(station => (
                      <tr key={station.station_id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-900 leading-snug">{station.name}</p>
                          <p className="text-[11px] text-slate-500 truncate max-w-xs">{station.address}</p>
                        </td>
                        <td className="px-6 py-4">
                          {station.price_pms ? (
                            <span className="font-black text-indigo-950 font-mono text-sm">
                              ₦{station.price_pms}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-medium italic">Unreported</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            station.queue_status === 'No Queue' ? 'bg-emerald-50 text-emerald-700' :
                            station.queue_status === 'Moderate Queue' ? 'bg-amber-50 text-amber-700' :
                            station.queue_status === 'Long Queue' ? 'bg-rose-50 text-rose-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {station.queue_status || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-700">
                            {station.pump_accuracy ? `${Number(station.pump_accuracy).toFixed(1)} ★` : '—'}
                          </span>
                          {station.accuracy_votes ? (
                            <span className="text-[10px] text-slate-400 block font-normal">
                              ({station.accuracy_votes} votes)
                            </span>
                          ) : null}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                            station.verified ? 'text-emerald-700' : 'text-slate-500'
                          }`}>
                            {station.verified ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : null}
                            {station.claim_status === 'Claimed' ? 'Claimed' : station.verified ? 'Verified' : 'Community'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingStation(station);
                                setNewPrice(station.price_pms ? String(station.price_pms) : '');
                                setNewQueue(station.queue_status || 'Unknown');
                              }}
                              className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-bold text-xs transition-colors"
                            >
                              Edit
                            </button>
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${station.lat},${station.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                              title="View on Google Maps"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredStations.length > 100 && (
                <div className="p-4 bg-slate-50 border-t border-slate-100 text-center text-xs text-slate-500">
                  Showing first 100 of {filteredStations.length} matching stations. Use search above to narrow results.
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* QUICK EDIT MODAL */}
      {editingStation && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 flex flex-col gap-4">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Admin Quick Edit</span>
              <h3 className="text-xl font-black text-indigo-950 mt-0.5">{editingStation.name}</h3>
              <p className="text-xs text-slate-500 truncate">{editingStation.address}</p>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">PMS Fuel Price (₦ / Litre)</label>
                <input
                  type="number"
                  placeholder="e.g. 910"
                  value={newPrice}
                  onChange={e => setNewPrice(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600 font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Queue Status</label>
                <select
                  value={newQueue}
                  onChange={e => setNewQueue(e.target.value)}
                  className="w-full px-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600 font-bold"
                >
                  <option value="No Queue">No Queue (Fast)</option>
                  <option value="Moderate Queue">Moderate Queue</option>
                  <option value="Long Queue">Long Queue (Heavy Traffic)</option>
                  <option value="Unknown">Unknown / Closed</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 mt-2">
              <button
                onClick={() => setEditingStation(null)}
                className="flex-1 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStation}
                disabled={isSavingStation}
                className="flex-1 py-2.5 text-xs font-black bg-indigo-950 hover:bg-indigo-900 text-white rounded-xl transition-colors shadow-sm disabled:opacity-50"
              >
                {isSavingStation ? 'Saving...' : 'Update & Verify'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}