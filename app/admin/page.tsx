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
import { Wordmark } from '@/components/Wordmark';
import { ThemeToggle } from '@/components/ThemeToggle';

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
          color: avg <= 900 ? 'var(--chart-pos)' : avg <= 940 ? 'var(--chart-1)' : 'var(--chart-warn)',
        };
      })
      .sort((a, b) => a.value - b.value)
      .slice(0, 8);

    // Price spread distribution (Buckets)
    const priceBuckets: BarItem[] = [
      { label: '< ₦890', value: prices.filter(p => p < 890).length, color: 'var(--chart-pos)' },
      { label: '₦890 - ₦920', value: prices.filter(p => p >= 890 && p < 920).length, color: 'var(--chart-pos)' },
      { label: '₦920 - ₦950', value: prices.filter(p => p >= 920 && p < 950).length, color: 'var(--chart-1)' },
      { label: '₦950 - ₦980', value: prices.filter(p => p >= 950 && p < 980).length, color: 'var(--chart-warn)' },
      { label: '> ₦980', value: prices.filter(p => p >= 980).length, color: 'var(--chart-neg)' },
    ];

    // Ownership Donut
    const ownershipDonut: DonutSegment[] = [
      { label: 'Claimed & Managed', value: claimedCount, color: 'var(--chart-pos)' },
      { label: 'Verified by Rep', value: Math.max(0, verifiedCount - claimedCount), color: 'var(--chart-1)' },
      { label: 'Community Sourced', value: Math.max(0, totalStations - verifiedCount), color: 'var(--chart-neutral)' },
    ];

    // Queue Donut
    const noQueue = stations.filter(s => s.queue_status === 'No Queue' || s.queue_status === 'Normal').length;
    const moderate = stations.filter(s => s.queue_status === 'Moderate Queue').length;
    const severe = stations.filter(s => s.queue_status === 'Long Queue').length;
    const other = Math.max(0, totalStations - noQueue - moderate - severe);

    const queueDonut: DonutSegment[] = [
      { label: 'No Queue (Smooth)', value: noQueue, color: 'var(--chart-pos)' },
      { label: 'Moderate Queue', value: moderate, color: 'var(--chart-warn)' },
      { label: 'Severe Queue', value: severe, color: 'var(--chart-neg)' },
      { label: 'Unknown / Closed', value: other, color: 'var(--chart-neutral)' },
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
      <div className="min-h-screen bg-surface-2 flex items-center justify-center p-4">
        <div className="bg-surface p-8 rounded-xl shadow-lg max-w-sm w-full border border-line">
          <div className="w-16 h-16 bg-brand rounded-full flex items-center justify-center mb-6 mx-auto shadow-inner">
            {authState === 'checking' ? (
              <Loader2 className="w-8 h-8 text-brand-accent animate-spin" />
            ) : (
              <Lock className="w-8 h-8 text-brand-accent" />
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-center text-fg mb-2">Admin sign in</h1>

          {authState === 'checking' && (
            <p className="text-center text-fg-muted text-sm">Checking your access…</p>
          )}

          {authState === 'signed-out' && (
            <>
              <p className="text-center text-fg-muted text-sm mb-6">Sign in with your Qozob admin account to continue.</p>
              <Link href="/login?redirect=admin" className="block w-full text-center bg-primary hover:bg-primary-hover text-on-primary font-semibold py-4 rounded-lg transition-all shadow-md hover:shadow-lg">
                Sign In
              </Link>
            </>
          )}

          {authState === 'not-admin' && (
            <>
              <p className="text-center text-fg-muted text-sm mb-2">
                <strong className="text-fg">{adminEmail}</strong> is not an authorized administrator.
              </p>
              <p className="text-center text-fg-subtle text-xs mb-6">Admin permissions are governed at the database level.</p>
              <div className="flex flex-col gap-2">
                <button onClick={handleLogout} className="w-full bg-primary hover:bg-primary-hover text-on-primary font-semibold py-3 rounded-lg transition-all">
                  Sign in with another account
                </button>
                <Link href="/" className="w-full text-center text-sm font-semibold text-fg-muted hover:text-fg py-2">Back to map</Link>
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
  const tabClass = (active: boolean) =>
    `relative flex items-center gap-2 px-3.5 h-10 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
      active ? 'bg-accent-solid text-on-accent' : 'text-on-brand-muted hover:bg-on-brand/5 hover:text-on-brand'
    }`;
  const countClass = (active: boolean) =>
    `min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full text-xs font-semibold tabular ${
      active ? 'bg-brand text-on-brand' : 'bg-brand-accent text-brand'
    }`;

  return (
    <div className="min-h-screen bg-canvas font-sans text-fg pb-16">
      
      {/* Top Navbar */}
      <nav className="bg-brand text-on-brand sticky top-0 z-50 border-b border-brand-line">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" aria-label="Qozob home" className="rounded-md shrink-0">
              <Wordmark tone="brand" size="md" />
            </Link>
            <span className="h-6 w-px bg-brand-line hidden sm:block" aria-hidden />
            <div className="hidden sm:block min-w-0">
              <p className="text-sm font-semibold text-on-brand leading-tight">Admin</p>
              <p className="text-xs text-on-brand-muted leading-tight">Platform operations</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              target="_blank"
              className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium text-on-brand-muted hover:text-on-brand hover:bg-on-brand/5 border border-on-brand/15 transition-colors"
            >
              Public map
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden />
            </Link>

            <button
              onClick={fetchData}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium text-on-brand border border-on-brand/15 bg-on-brand/5 hover:bg-on-brand/10 transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <ThemeToggle tone="brand" />

            <span className="h-6 w-px bg-brand-line hidden sm:block" aria-hidden />

            <span className="hidden lg:inline text-sm text-on-brand-muted truncate max-w-[180px]">
              {adminEmail}
            </span>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-lg text-sm font-medium text-on-brand-muted hover:text-on-brand hover:bg-on-brand/5 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-1.5 overflow-x-auto border-t border-brand-line py-2" role="tablist">
          <button role="tab" aria-selected={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} className={tabClass(activeTab === 'analytics')}>
            <BarChart3 className="w-4 h-4" aria-hidden />
            <span>Overview</span>
          </button>

          <button role="tab" aria-selected={activeTab === 'claims'} onClick={() => setActiveTab('claims')} className={tabClass(activeTab === 'claims')}>
            <FileText className="w-4 h-4" aria-hidden />
            <span>Station claims</span>
            {pendingClaims.length > 0 && <span className={countClass(activeTab === 'claims')}>{pendingClaims.length}</span>}
          </button>

          <button role="tab" aria-selected={activeTab === 'requests'} onClick={() => setActiveTab('requests')} className={tabClass(activeTab === 'requests')}>
            <UserPlus className="w-4 h-4" aria-hidden />
            <span>Manager requests</span>
            {pendingRequests.length > 0 && <span className={countClass(activeTab === 'requests')}>{pendingRequests.length}</span>}
          </button>

          <button role="tab" aria-selected={activeTab === 'stations'} onClick={() => setActiveTab('stations')} className={tabClass(activeTab === 'stations')}>
            <Building2 className="w-4 h-4" aria-hidden />
            <span>Stations</span>
            <span className={countClass(activeTab === 'stations')}>{stations.length}</span>
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
                <h2 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-fg">Overview</h2>
                <p className="text-fg-muted text-sm mt-1">Stations, prices, queues and items waiting for review.</p>
              </div>

              {(pendingClaims.length > 0 || pendingRequests.length > 0) && (
                <div className="flex items-center gap-2 bg-warning-soft border border-warning-line text-on-warning-soft px-3.5 py-2 rounded-lg text-xs font-semibold">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
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
                title="Average PMS price by brand (₦/L)"
                subtitle="Across all tracked stations"
                data={analytics.brandBars}
                layout="horizontal"
                valuePrefix=""
                valueSuffix=""
              />

              <BarChart
                title="Price ranges"
                subtitle="Number of stations in each price band"
                data={analytics.priceBuckets}
                layout="vertical"
                valueSuffix=" stations"
              />
            </div>

            {/* Analytics Row 2: Ownership Donut + Queue Donut + Pump Rating */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <DonutChart
                title="Who reports prices"
                subtitle="Station owners, Qozob reps and the community"
                data={analytics.ownershipDonut}
                centerLabel={analytics.totalStations.toLocaleString()}
                centerSub="Stations"
              />

              <DonutChart
                title="Queue status"
                subtitle="Latest reports from drivers"
                data={analytics.queueDonut}
                centerLabel={analytics.totalStations.toLocaleString()}
                centerSub="Outlets"
              />

              <RatingDistribution
                averageRating={analytics.avgAccuracy}
                totalVotes={analytics.totalVotes}
                title="Pump accuracy"
                subtitle="Average driver rating across all stations"
              />
            </div>

            {/* Quick Action Banner */}
            <div className="bg-brand rounded-xl p-6 text-on-brand flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-brand-line">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-brand-2 rounded-lg flex items-center justify-center shrink-0 border border-brand-line">
                  <ShieldCheck className="w-5 h-5 text-brand-accent" aria-hidden />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-on-brand">Data protection is on</h4>
                  <p className="text-sm text-on-brand-muted mt-0.5">
                    Database rules control who can change prices and claims. Admin actions run through secure, audited functions.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setActiveTab('claims')}
                  className="h-10 px-4 rounded-lg bg-accent-solid hover:bg-accent-hover text-on-accent text-sm font-semibold transition-colors"
                >
                  Review claims ({pendingClaims.length})
                </button>
                <button
                  onClick={() => setActiveTab('stations')}
                  className="h-10 px-4 rounded-lg bg-on-brand/5 hover:bg-on-brand/10 text-on-brand text-sm font-medium transition-colors border border-on-brand/15"
                >
                  View stations
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
                <h2 className="text-2xl sm:text-3xl font-semibold text-fg mb-1">Station claims</h2>
                <p className="text-fg-muted text-xs sm:text-sm">Check CAC certificates and approve station owners.</p>
              </div>
              <span className="text-xs font-semibold bg-warning-soft text-on-warning-soft border border-warning-line px-3 py-1.5 rounded-lg">
                {pendingClaims.length} Pending Review
              </span>
            </div>

            {/* Pending Claims Cards */}
            {isLoading ? (
              <div className="p-16 text-center text-fg-subtle font-semibold animate-pulse">Loading claims…</div>
            ) : pendingClaims.length === 0 ? (
              <div className="bg-surface rounded-xl p-12 text-center border border-line shadow-xs">
                <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" />
                <h4 className="text-lg font-semibold text-fg mb-1">All caught up</h4>
                <p className="text-fg-muted text-xs">All submitted station ownership claims have been processed.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pendingClaims.map(claim => (
                  <div key={claim.id} className="bg-surface rounded-xl p-6 shadow-xs border border-warning-line relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-0 right-0 bg-warning-soft text-on-warning-soft text-xs font-semibold uppercase px-3 py-1 rounded-bl-lg tracking-wider">
                      Pending Review
                    </div>

                    <div>
                      <h4 className="font-semibold text-fg text-xl pr-20 leading-tight mb-1">{claim.station_name}</h4>
                      <p className="text-xs font-semibold text-fg-muted mb-2 leading-snug">{claim.address}</p>
                      <p className="text-xs text-fg-subtle mb-4 flex items-center gap-1">
                        <Clock className="w-3 h-3"/> Submitted {new Date(claim.created_at).toLocaleDateString()}
                      </p>

                      <div className="bg-surface-2 rounded-xl p-4 border border-line mb-4 text-xs">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <span className="text-xs font-semibold text-fg-subtle uppercase tracking-wider block">Applicant</span>
                            <span className="font-semibold text-fg truncate block">{claim.applicant_name}</span>
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-fg-subtle uppercase tracking-wider block">Phone</span>
                            <span className="font-semibold text-fg truncate block">{claim.phone_number}</span>
                          </div>
                          <div className="col-span-2 pt-2 border-t border-line">
                            <span className="text-xs font-semibold text-fg-subtle uppercase tracking-wider block">CAC Reg Number</span>
                            <span className="font-semibold text-fg font-mono text-sm">{claim.business_reg_number}</span>
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
                          className="flex items-center justify-center gap-1.5 bg-accent-soft hover:bg-surface-2 text-on-accent-soft font-semibold py-2.5 rounded-lg transition-colors border border-accent-line text-xs shadow-xs disabled:opacity-50"
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
                          className="flex items-center justify-center gap-1.5 bg-surface-2 hover:bg-surface-3 text-fg font-semibold py-2.5 rounded-lg transition-colors border border-line text-xs shadow-xs"
                        >
                          <MapPin className="w-3.5 h-3.5 text-success" />
                          <span>Check Map</span>
                          <ExternalLink className="w-3 h-3 opacity-50"/>
                        </a>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleApproveClaim(claim)}
                          disabled={isProcessing}
                          className="flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-hover text-on-primary font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 text-xs shadow-xs"
                        >
                          <CheckCircle className="w-4 h-4" /> Approve
                        </button>
                        <button
                          onClick={() => handleRejectClaim(claim)}
                          disabled={isProcessing}
                          className="flex items-center justify-center gap-1.5 bg-danger-soft hover:bg-danger-soft text-on-danger-soft font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 text-xs border border-danger-line"
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
                <h3 className="text-lg font-semibold text-fg mb-3">Claim Review History ({pastClaims.length})</h3>
                <div className="bg-surface rounded-xl shadow-xs border border-line overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-2 text-fg-muted font-semibold uppercase text-xs tracking-wider border-b border-line">
                        <tr>
                          <th className="px-6 py-3.5">Station Name</th>
                          <th className="px-6 py-3.5">Applicant / RC</th>
                          <th className="px-6 py-3.5">Date Submitted</th>
                          <th className="px-6 py-3.5 text-right">Review Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {pastClaims.map(claim => (
                          <tr key={claim.id} className="hover:bg-surface-2 transition-colors">
                            <td className="px-6 py-3.5 font-semibold text-fg">{claim.station_name}</td>
                            <td className="px-6 py-3.5 text-fg-muted">
                              {claim.applicant_name} <span className="text-fg-subtle font-mono">({claim.business_reg_number})</span>
                            </td>
                            <td className="px-6 py-3.5 text-fg-subtle">{new Date(claim.created_at).toLocaleDateString()}</td>
                            <td className="px-6 py-3.5 text-right">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                                claim.status === 'Approved' ? 'bg-success-soft text-on-success-soft' : 'bg-danger-soft text-on-danger-soft'
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
                <h2 className="text-2xl sm:text-3xl font-semibold text-fg mb-1">Manager Access Requests</h2>
                <p className="text-fg-muted text-xs sm:text-sm">Review applications from station representatives seeking permission to update station prices.</p>
              </div>
              <span className="text-xs font-semibold bg-accent-soft text-on-accent-soft border border-accent-line px-3 py-1.5 rounded-lg">
                {pendingRequests.length} Pending Approval
              </span>
            </div>

            {isLoading ? (
              <div className="p-16 text-center text-fg-subtle font-semibold animate-pulse">Loading manager requests...</div>
            ) : pendingRequests.length === 0 ? (
              <div className="bg-surface rounded-xl p-12 text-center border border-line shadow-xs">
                <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" />
                <h4 className="text-lg font-semibold text-fg mb-1">No Pending Requests</h4>
                <p className="text-fg-muted text-xs">All user applications for Manager status have been handled.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pendingRequests.map(req => (
                  <div key={req.id} className="bg-surface rounded-xl p-6 shadow-xs border border-accent-line relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-0 right-0 bg-accent-soft text-on-accent-soft text-xs font-semibold uppercase px-3 py-1 rounded-bl-lg tracking-wider">
                      Role Application
                    </div>

                    <div>
                      <h4 className="font-semibold text-fg text-lg pr-24 leading-tight mb-1">
                        {req.full_name || req.email || 'Unnamed user'}
                      </h4>
                      <p className="text-xs font-semibold text-fg-muted mb-1 truncate">{req.email}</p>
                      <p className="text-xs text-fg-subtle mb-4 flex items-center gap-1">
                        <Clock className="w-3 h-3"/> Requested {new Date(req.created_at).toLocaleDateString()}
                      </p>

                      <div className="bg-surface-2 rounded-xl p-4 border border-line mb-4 text-xs grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-xs font-semibold text-fg-subtle uppercase tracking-wider block">Company</span>
                          <span className="font-semibold text-fg truncate block">{req.company_name || '—'}</span>
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-fg-subtle uppercase tracking-wider block">Phone</span>
                          <span className="font-semibold text-fg truncate block">{req.phone || '—'}</span>
                        </div>
                        {req.note && (
                          <div className="col-span-2 pt-2 border-t border-line">
                            <span className="text-xs font-semibold text-fg-subtle uppercase tracking-wider block">Note</span>
                            <span className="text-fg text-xs leading-relaxed">{req.note}</span>
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
                          className="flex items-center justify-center gap-1.5 bg-accent-soft hover:bg-surface-2 text-on-accent-soft font-semibold py-2.5 rounded-lg transition-colors border border-accent-line text-xs shadow-xs mb-1 disabled:opacity-50"
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
                          className="flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-hover text-on-primary font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 text-xs shadow-xs"
                        >
                          <CheckCircle className="w-4 h-4" /> Grant Role
                        </button>
                        <button
                          onClick={() => handleReviewRoleRequest(req, 'Rejected')}
                          disabled={isProcessing}
                          className="flex items-center justify-center gap-1.5 bg-danger-soft hover:bg-danger-soft text-on-danger-soft font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 text-xs border border-danger-line"
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
                <h2 className="text-2xl sm:text-3xl font-semibold text-fg mb-1">Station Directory</h2>
                <p className="text-fg-muted text-xs sm:text-sm">Search, audit and manage live fuel retail outlets nationwide.</p>
              </div>

              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 bg-surface hover:bg-surface-2 border border-line text-fg font-semibold text-xs px-4 py-2.5 rounded-lg shadow-xs transition-colors"
              >
                <Download className="w-4 h-4 text-fg-muted" />
                <span>Export CSV ({filteredStations.length})</span>
              </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-surface rounded-xl p-4 border border-line shadow-xs flex flex-col md:flex-row gap-3 items-center">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-fg-subtle absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search stations by name, brand or street address..."
                  value={stationSearch}
                  onChange={e => setStationSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-xs bg-surface-2 border border-line rounded-lg focus:outline-none focus:border-primary focus:bg-surface transition-all font-medium"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <select
                  value={filterBrand}
                  onChange={e => setFilterBrand(e.target.value)}
                  className="text-xs bg-surface-2 border border-line rounded-lg px-3 py-2 font-medium focus:outline-none focus:border-primary"
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
                  className="text-xs bg-surface-2 border border-line rounded-lg px-3 py-2 font-medium focus:outline-none focus:border-primary"
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
            <div className="bg-surface rounded-xl shadow-xs border border-line overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-fg-muted font-semibold uppercase text-xs tracking-wider border-b border-line">
                    <tr>
                      <th className="px-6 py-4">Station</th>
                      <th className="px-6 py-4">PMS Price</th>
                      <th className="px-6 py-4">Queue State</th>
                      <th className="px-6 py-4">Accuracy</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredStations.slice(0, 100).map(station => (
                      <tr key={station.station_id} className="hover:bg-surface-2 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-semibold text-fg leading-snug">{station.name}</p>
                          <p className="text-xs text-fg-muted truncate max-w-xs">{station.address}</p>
                        </td>
                        <td className="px-6 py-4">
                          {station.price_pms ? (
                            <span className="font-semibold text-fg font-mono text-sm">
                              ₦{station.price_pms}
                            </span>
                          ) : (
                            <span className="text-fg-subtle font-medium italic">Unreported</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            station.queue_status === 'No Queue' ? 'bg-success-soft text-on-success-soft' :
                            station.queue_status === 'Moderate Queue' ? 'bg-warning-soft text-on-warning-soft' :
                            station.queue_status === 'Long Queue' ? 'bg-danger-soft text-on-danger-soft' :
                            'bg-surface-2 text-fg-muted'
                          }`}>
                            {station.queue_status || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-semibold text-fg">
                            {station.pump_accuracy ? `${Number(station.pump_accuracy).toFixed(1)} ★` : '—'}
                          </span>
                          {station.accuracy_votes ? (
                            <span className="text-xs text-fg-subtle block font-normal">
                              ({station.accuracy_votes} votes)
                            </span>
                          ) : null}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
                            station.verified ? 'text-success' : 'text-fg-muted'
                          }`}>
                            {station.verified ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : null}
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
                              className="text-on-accent-soft hover:text-on-accent-soft bg-accent-soft hover:bg-surface-2 px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors"
                            >
                              Edit
                            </button>
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${station.lat},${station.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-fg-subtle hover:text-fg-muted hover:bg-surface-3 rounded-lg transition-colors"
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
                <div className="p-4 bg-surface-2 border-t border-line text-center text-xs text-fg-muted">
                  Showing first 100 of {filteredStations.length} matching stations. Use search above to narrow results.
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* QUICK EDIT MODAL */}
      {editingStation && (
        <div className="fixed inset-0 bg-[var(--overlay)] backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-surface rounded-xl p-6 max-w-md w-full shadow-xl border border-line flex flex-col gap-4">
            <div>
              <span className="text-xs uppercase font-semibold text-fg-subtle tracking-wider">Admin Quick Edit</span>
              <h3 className="text-xl font-semibold text-fg mt-0.5">{editingStation.name}</h3>
              <p className="text-xs text-fg-muted truncate">{editingStation.address}</p>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-fg block mb-1">PMS Fuel Price (₦ / Litre)</label>
                <input
                  type="number"
                  placeholder="e.g. 910"
                  value={newPrice}
                  onChange={e => setNewPrice(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm bg-surface-2 border border-line rounded-lg focus:outline-none focus:border-primary font-mono font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-fg block mb-1">Queue Status</label>
                <select
                  value={newQueue}
                  onChange={e => setNewQueue(e.target.value)}
                  className="w-full px-4 py-2.5 text-xs bg-surface-2 border border-line rounded-lg focus:outline-none focus:border-primary font-semibold"
                >
                  <option value="No Queue">No Queue (Fast)</option>
                  <option value="Moderate Queue">Moderate Queue</option>
                  <option value="Long Queue">Long Queue (Heavy Traffic)</option>
                  <option value="Unknown">Unknown / Closed</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-line mt-2">
              <button
                onClick={() => setEditingStation(null)}
                className="flex-1 py-2.5 text-xs font-semibold text-fg-muted hover:bg-surface-3 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStation}
                disabled={isSavingStation}
                className="flex-1 py-2.5 text-xs font-semibold bg-primary hover:bg-primary-hover text-on-primary rounded-lg transition-colors shadow-sm disabled:opacity-50"
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