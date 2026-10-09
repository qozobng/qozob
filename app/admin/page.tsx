"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ShieldCheck, Lock, FileText, CheckCircle, XCircle, LogOut, Clock,
  ExternalLink, RefreshCw, MapPin, UserPlus, Loader2, Building2,
  Fuel, AlertTriangle, Download, ArrowUpRight,
  BarChart3, CheckCircle2, Megaphone, Mail, Trophy, Hourglass, Wrench, Crown, X,
} from 'lucide-react';

import { createClient } from '@/utils/supabase/client';
import { getRole, signedCacUrl } from '@/lib/roles';
import { brandName } from '@/lib/brands';
import { normaliseQueue } from '@/lib/queue';
import { fetchAllRows, isMissingFunction } from '@/lib/fetchAll';
import { downloadXlsx, formatWat } from '@/lib/xlsx';
import { cx } from '@/lib/ui';
import { StatCard } from '@/components/analytics/StatCard';
import { BarChart, BarItem } from '@/components/analytics/BarChart';
import { DonutChart, DonutSegment } from '@/components/analytics/DonutChart';
import { RatingDistribution } from '@/components/analytics/RatingDistribution';
import { Wordmark } from '@/components/Wordmark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AdsManager } from '@/components/admin/AdsManager';
import { MailingManager } from '@/components/admin/MailingManager';
import { RewardsManager } from '@/components/admin/RewardsManager';
import { ServicesManager } from '@/components/admin/ServicesManager';
import { StationsDirectory } from '@/components/admin/StationsDirectory';
import { PriceReviews } from '@/components/admin/PriceReviews';
import { AdminsManager } from '@/components/admin/AdminsManager';
import { ReportTable, type ReportColumn } from '@/components/admin/ReportTable';

const supabase = createClient();

type AuthState = 'checking' | 'signed-out' | 'not-admin' | 'admin';
type AdminTab = 'analytics' | 'claims' | 'requests' | 'stations' | 'prices' | 'ads' | 'mailing' | 'rewards' | 'services' | 'admins';
type Module = 'claims' | 'requests' | 'stations' | 'prices' | 'ads' | 'mailing' | 'rewards' | 'services';
const ALL_MODULES: Module[] = ['claims', 'requests', 'stations', 'prices', 'ads', 'mailing', 'rewards', 'services'];

interface Access { is_admin: boolean; is_master: boolean; modules: Module[]; legacy?: boolean }

interface StationRecord {
  station_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  price_pms: number | null;
  queue_status: string | null;
  verified: boolean;
  manager_id: string | null;
  claim_status: string | null;
  pump_accuracy: number | null;
  accuracy_votes: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export default function AdminDashboard() {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [adminEmail, setAdminEmail] = useState("");
  const [access, setAccess] = useState<Access | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('analytics');

  // Data
  const [claims, setClaims] = useState<Row[]>([]);
  const [roleRequests, setRoleRequests] = useState<Row[]>([]);
  const [stations, setStations] = useState<StationRecord[]>([]);
  const [heldCount, setHeldCount] = useState(0);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  // UI
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const can = useCallback((m: Module) => !!access?.modules.includes(m), [access]);
  const canPrices = can('prices') || can('rewards');

  const flash = useCallback((ok: boolean, text: string) => {
    setToast({ ok, text });
    window.setTimeout(() => setToast(null), 6000);
  }, []);

  // --- Fetch data the visible sections need ---
  const fetchData = useCallback(async (acc: Access | null = access) => {
    if (!acc) return;
    setIsLoading(true);
    const has = (m: Module) => acc.modules.includes(m);
    try {
      const [claimsRes, requestsRes, stationsRes, heldRes] = await Promise.all([
        has('claims') ? supabase.from('station_claims').select('*').order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
        has('requests') ? supabase.from('role_requests').select('*').order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
        fetchAllRows<StationRecord>((from, to) =>
          supabase.from('stations')
            .select('station_id, name, address, lat, lng, price_pms, queue_status, verified, manager_id, claim_status, pump_accuracy, accuracy_votes')
            .order('station_id').range(from, to)),
        has('prices') || has('rewards')
          ? supabase.from('price_reports').select('id', { count: 'exact', head: true }).eq('status', 'held')
          : Promise.resolve({ count: 0, error: null }),
      ]);

      if (claimsRes.error) console.error('Error fetching claims:', claimsRes.error.message);
      if (requestsRes.error) console.warn('Could not load Manager access requests:', requestsRes.error.message);
      if (stationsRes.error) console.error('Error fetching stations:', stationsRes.error.message);

      setRoleRequests((requestsRes.data as Row[]) || []);
      setStations(stationsRes.rows);
      setHeldCount((heldRes as { count: number | null }).count ?? 0);

      const addressById = new Map(stationsRes.rows.map(s => [s.station_id, s.address]));
      setClaims(((claimsRes.data as Row[]) || []).map(claim => ({
        ...claim,
        address: addressById.get(claim.station_id) || 'Address on record unavailable',
      })));
      setLoadedAt(new Date());
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [access]);

  // --- Authentication + access level ---
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setAuthState('signed-out');
      setAdminEmail(user.email || "");

      let acc: Access | null = null;
      const { data, error } = await supabase.rpc('my_admin_access');
      if (!error && data) {
        const d = data as Access;
        acc = d.is_admin ? { is_admin: true, is_master: !!d.is_master, modules: (d.modules || []).filter((m): m is Module => ALL_MODULES.includes(m)) } : null;
      } else if (isMissingFunction(error)) {
        // Database update (20261014) not run yet: every admin keeps full access, as before.
        const { data: isAdmin, error: e2 } = await supabase.rpc('is_admin');
        if (isAdmin === true || (e2 && getRole(user) === 'Admin')) acc = { is_admin: true, is_master: false, modules: ALL_MODULES, legacy: true };
      } else if (error) {
        console.warn('Admin access check error:', error.message);
      }

      if (acc) {
        setAccess(acc);
        setAuthState('admin');
        fetchData(acc);
      } else {
        setAuthState('not-admin');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setClaims([]);
    setRoleRequests([]);
    setStations([]);
    setAccess(null);
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
      flash(false, 'Could not open this document. It may have expired or been removed.');
    }
  };

  // --- Approve / Reject Handlers ---
  const handleApproveClaim = async (claim: Row) => {
    if (!window.confirm(`Approve station claim for ${claim.applicant_name} (${claim.station_name})?`)) return;
    setIsProcessing(true);
    const { error } = await supabase.rpc('admin_review_claim', { p_claim_id: String(claim.id), p_status: 'Approved', p_notes: null });
    setIsProcessing(false);
    if (error) return flash(false, 'Error approving claim: ' + error.message);
    flash(true, 'Claim approved. The station is verified and linked to its owner.');
    fetchData();
  };

  const handleRejectClaim = async (claim: Row) => {
    const reason = window.prompt("Reason for rejecting this claim (optional):", "");
    if (reason === null) return;
    setIsProcessing(true);
    const { error } = await supabase.rpc('admin_review_claim', { p_claim_id: String(claim.id), p_status: 'Rejected', p_notes: reason || null });
    setIsProcessing(false);
    if (error) return flash(false, 'Error rejecting claim: ' + error.message);
    flash(true, 'Claim rejected.');
    fetchData();
  };

  const handleReviewRoleRequest = async (request: Row, status: 'Approved' | 'Rejected') => {
    const who = request.full_name || request.email || 'this user';
    const notes = window.prompt(
      status === 'Approved' ? `Approve Manager rights for ${who}? Optional note:` : `Reject Manager rights for ${who}? Optional reason:`,
      ""
    );
    if (notes === null) return;
    setIsProcessing(true);
    const { error } = await supabase.rpc('admin_review_role_request', { p_request_id: request.id, p_status: status, p_notes: notes || null });
    setIsProcessing(false);
    if (error) return flash(false, 'Error: ' + error.message);
    flash(true, status === 'Approved' ? 'Manager access granted.' : 'Request rejected.');
    fetchData();
  };

  // --- Calculations for Analytics ---
  const pendingClaims = useMemo(() => claims.filter(c => c.status === 'Pending Review'), [claims]);
  const pendingRequests = useMemo(() => roleRequests.filter(r => r.status === 'Pending'), [roleRequests]);

  const analytics = useMemo(() => {
    const totalStations = stations.length;
    const stationsWithPrice = stations.filter(s => s.price_pms !== null && Number(s.price_pms) > 0);
    const prices = stationsWithPrice.map(s => Number(s.price_pms));

    const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    const isClaimed = (s: StationRecord) => s.claim_status === 'Claimed' || s.manager_id !== null;
    const verifiedCount = stations.filter(s => s.verified).length;
    const claimedCount = stations.filter(isClaimed).length;

    const q = { 'No Queue': 0, Moderate: 0, Heavy: 0, 'No Fuel': 0, Unknown: 0 } as Record<string, number>;
    stations.forEach(s => { q[normaliseQueue(s.queue_status)] += 1; });
    const queueActiveCount = q.Moderate + q.Heavy + q['No Fuel'];

    // Pump accuracy (no made-up default when nobody has rated yet)
    const ratedStations = stations.filter(s => (s.accuracy_votes || 0) > 0);
    const avgAccuracy = ratedStations.length > 0
      ? ratedStations.reduce((acc, s) => acc + Number(s.pump_accuracy || 0), 0) / ratedStations.length
      : 0;
    const totalVotes = stations.reduce((acc, s) => acc + (s.accuracy_votes || 0), 0);

    // Average PMS price by real brand
    const brandMap = new Map<string, { count: number; sum: number; priced: number }>();
    stations.forEach(s => {
      const b = brandName(s.name);
      const e = brandMap.get(b) || { count: 0, sum: 0, priced: 0 };
      e.count += 1;
      if (s.price_pms && Number(s.price_pms) > 0) { e.sum += Number(s.price_pms); e.priced += 1; }
      brandMap.set(b, e);
    });
    const brandRows = [...brandMap.entries()]
      .map(([brand, d]) => ({ brand, stations: d.count, priced: d.priced, avg: d.priced ? Math.round(d.sum / d.priced) : null }))
      .sort((a, b) => b.stations - a.stations);
    const brandBars: BarItem[] = brandRows
      .filter(b => b.avg !== null && b.priced >= 2)
      .map(b => ({
        label: b.brand,
        value: b.avg as number,
        formattedValue: `₦${(b.avg as number).toLocaleString('en-NG')}/L`,
        secondaryLabel: `${b.priced} priced of ${b.stations}`,
        color: (b.avg as number) <= avgPrice * 0.99 ? 'var(--chart-pos)' : (b.avg as number) <= avgPrice * 1.01 ? 'var(--chart-1)' : 'var(--chart-warn)',
      }))
      .sort((a, b) => a.value - b.value)
      .slice(0, 8);

    // Price bands that follow the real market (5 equal bands between today's low and high)
    const priceBuckets: BarItem[] = [];
    if (prices.length) {
      const lo = Math.floor(minPrice / 10) * 10;
      const hi = Math.max(lo + 10, Math.ceil((maxPrice + 0.01) / 10) * 10);
      const width = Math.max(10, Math.ceil((hi - lo) / 5 / 10) * 10);
      const colors = ['var(--chart-pos)', 'var(--chart-pos)', 'var(--chart-1)', 'var(--chart-warn)', 'var(--chart-neg)'];
      for (let i = 0; i < 5; i++) {
        const a = lo + i * width;
        const b = a + width;
        if (a > maxPrice) break;
        const last = i === 4 || b > maxPrice;
        priceBuckets.push({
          label: `₦${a.toLocaleString('en-NG')}–₦${(last ? Math.ceil(maxPrice) : b - 1).toLocaleString('en-NG')}`,
          value: prices.filter(p => p >= a && (last ? true : p < b)).length,
          color: colors[i],
        });
        if (last) break;
      }
    }

    const ownershipDonut: DonutSegment[] = [
      { label: 'Claimed & managed', value: claimedCount, color: 'var(--chart-pos)' },
      { label: 'Verified by Qozob', value: stations.filter(s => s.verified && !isClaimed(s)).length, color: 'var(--chart-1)' },
      { label: 'Community sourced', value: stations.filter(s => !s.verified && !isClaimed(s)).length, color: 'var(--chart-neutral)' },
    ];
    const queueDonut: DonutSegment[] = [
      { label: 'No queue', value: q['No Queue'], color: 'var(--chart-pos)' },
      { label: 'Moderate', value: q.Moderate, color: 'var(--chart-warn)' },
      { label: 'Heavy queue', value: q.Heavy, color: 'var(--chart-neg)' },
      { label: 'No fuel', value: q['No Fuel'], color: 'var(--danger)' },
      { label: 'Not reported', value: q.Unknown, color: 'var(--chart-neutral)' },
    ];

    return {
      totalStations, stationsWithPriceCount: stationsWithPrice.length, avgPrice, minPrice, maxPrice,
      verifiedCount, verifiedPercent: totalStations > 0 ? Math.round((verifiedCount / totalStations) * 100) : 0,
      claimedCount, queueActiveCount, queueCounts: q, avgAccuracy, ratedCount: ratedStations.length, totalVotes,
      brandRows, brandBars, priceBuckets, ownershipDonut, queueDonut,
    };
  }, [stations]);

  const exportOverview = async () => {
    const { data } = await supabase.auth.getSession();
    const asOf = `Data as of: ${formatWat(loadedAt)} WAT`;
    const a = analytics;
    downloadXlsx('qozob-overview', [
      {
        name: 'Summary', title: 'Qozob · Overview summary', meta: [asOf],
        columns: [{ header: 'Measure', width: 36 }, { header: 'Value', type: 'number', width: 16 }, { header: 'Notes', width: 40 }],
        rows: [
          ['Total stations', a.totalStations, ''],
          ['Stations with a live price', a.stationsWithPriceCount, ''],
          ['Average PMS price (₦/L)', a.avgPrice || null, ''],
          ['Lowest PMS price (₦/L)', a.minPrice || null, ''],
          ['Highest PMS price (₦/L)', a.maxPrice || null, ''],
          ['Verified stations', a.verifiedCount, `${a.verifiedPercent}% of all stations`],
          ['Claimed by owners', a.claimedCount, ''],
          ['Queue / no-fuel alerts', a.queueActiveCount, 'Moderate, heavy or no fuel'],
          ['Average pump rating (1–5)', a.ratedCount ? Number(a.avgAccuracy.toFixed(2)) : null, `${a.ratedCount} rated stations, ${a.totalVotes} votes`],
          ...(can('claims') ? [['Station claims waiting', pendingClaims.length, ''] as [string, number, string]] : []),
          ...(can('requests') ? [['Manager requests waiting', pendingRequests.length, ''] as [string, number, string]] : []),
          ...(canPrices ? [['Prices waiting for review', heldCount, 'Not on the map until approved'] as [string, number, string]] : []),
        ],
      },
      {
        name: 'Brands', title: 'Average PMS price by brand', meta: [asOf],
        columns: [{ header: 'Brand', width: 22 }, { header: 'Stations', type: 'integer' }, { header: 'With a price', type: 'integer' }, { header: 'Average price (₦/L)', type: 'money' }],
        rows: a.brandRows.map(b => [b.brand, b.stations, b.priced, b.avg]),
      },
      {
        name: 'Price bands', title: 'Stations by price band', meta: [asOf],
        columns: [{ header: 'Band (₦/L)', width: 22 }, { header: 'Stations', type: 'integer' }],
        rows: a.priceBuckets.map(b => [b.label, b.value]),
      },
      {
        name: 'Queue & ownership', title: 'Queue status and who reports prices', meta: [asOf],
        columns: [{ header: 'Group', width: 14 }, { header: 'Category', width: 24 }, { header: 'Stations', type: 'integer' }],
        rows: [
          ...a.queueDonut.map(s => ['Queue', s.label, s.value]),
          ...a.ownershipDonut.map(s => ['Ownership', s.label, s.value]),
        ],
      },
    ], { generatedBy: data.session?.user?.email });
  };

  // =========================================================================
  // AUTH GUARD UI
  // =========================================================================
  if (authState !== 'admin' || !access) {
    return (
      <div className="min-h-screen bg-surface-2 flex items-center justify-center p-4">
        <div className="bg-surface p-8 rounded-xl shadow-lg max-w-sm w-full border border-line">
          <div className="w-16 h-16 bg-brand rounded-full flex items-center justify-center mb-6 mx-auto shadow-inner">
            {authState === 'checking' ? <Loader2 className="w-8 h-8 text-brand-accent animate-spin" /> : <Lock className="w-8 h-8 text-brand-accent" />}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-center text-fg mb-2">Admin sign in</h1>

          {authState === 'checking' && <p className="text-center text-fg-muted text-sm">Checking your access…</p>}

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
  // DASHBOARD
  // =========================================================================
  const tabs: { key: AdminTab; label: string; icon: React.ElementType; show: boolean; count?: number }[] = [
    { key: 'analytics', label: 'Overview', icon: BarChart3, show: true },
    { key: 'claims', label: 'Station claims', icon: FileText, show: can('claims'), count: pendingClaims.length },
    { key: 'requests', label: 'Manager requests', icon: UserPlus, show: can('requests'), count: pendingRequests.length },
    { key: 'stations', label: 'Stations', icon: Building2, show: can('stations'), count: stations.length },
    { key: 'prices', label: 'Price reviews', icon: Hourglass, show: canPrices, count: heldCount },
    { key: 'ads', label: 'Adverts', icon: Megaphone, show: can('ads') },
    { key: 'mailing', label: 'Mailing', icon: Mail, show: can('mailing') },
    { key: 'rewards', label: 'Rewards', icon: Trophy, show: can('rewards') },
    { key: 'services', label: 'Auto services', icon: Wrench, show: can('services') },
    { key: 'admins', label: 'Admins', icon: Crown, show: access.is_master },
  ];
  const visibleTabs = tabs.filter(t => t.show);
  const tab: AdminTab = visibleTabs.some(t => t.key === activeTab) ? activeTab : 'analytics';

  const tabClass = (active: boolean) =>
    `relative flex items-center gap-2 px-3.5 h-10 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
      active ? 'bg-accent-solid text-on-accent' : 'text-on-brand-muted hover:bg-on-brand/5 hover:text-on-brand'
    }`;
  const countClass = (active: boolean) =>
    `min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full text-xs font-semibold tabular ${
      active ? 'bg-brand text-on-brand' : 'bg-brand-accent text-brand'
    }`;

  const waitingTotal = (can('claims') ? pendingClaims.length : 0) + (can('requests') ? pendingRequests.length : 0) + (canPrices ? heldCount : 0);

  return (
    <div className="min-h-screen bg-canvas font-sans text-fg pb-16">

      {/* Top Navbar */}
      <nav className="bg-brand-grad text-on-brand sticky top-0 z-50 border-b border-brand-line">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" aria-label="Qozob home" className="rounded-md shrink-0">
              <Wordmark tone="brand" size="md" />
            </Link>
            <span className="h-6 w-px bg-brand-line hidden sm:block" aria-hidden />
            <div className="hidden sm:block min-w-0">
              <p className="text-sm font-semibold text-on-brand leading-tight">Admin{access.is_master && ' · Master'}</p>
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
              onClick={() => fetchData()}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium text-on-brand border border-on-brand/15 bg-on-brand/5 hover:bg-on-brand/10 transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <ThemeToggle tone="brand" />

            <span className="h-6 w-px bg-brand-line hidden sm:block" aria-hidden />

            <span className="hidden lg:inline text-sm text-on-brand-muted truncate max-w-[180px]">{adminEmail}</span>
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

        {/* Tab Navigation Bar (only the sections this admin may open) */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-1.5 overflow-x-auto border-t border-brand-line py-2 [scrollbar-width:none]" role="tablist">
          {visibleTabs.map(({ key, label, icon: Icon, count }) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setActiveTab(key)} className={tabClass(tab === key)}>
              <Icon className="w-4 h-4" aria-hidden />
              <span>{label}</span>
              {!!count && count > 0 && <span className={countClass(tab === key)}>{count}</span>}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6">
        {access.legacy && (
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-warning-line bg-warning-soft text-on-warning-soft p-3 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
            <span>Admin access levels, price reviews and the full reports need the latest database update. Run <code>20261014_admin_access_price_moderation.sql</code> in the Supabase SQL editor.</span>
          </div>
        )}

        {/* =================================================================== */}
        {/* OVERVIEW */}
        {/* =================================================================== */}
        {tab === 'analytics' && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-fg">Overview</h2>
                <p className="text-fg-muted text-sm mt-1">
                  Stations, prices, queues and items waiting for review.
                  {loadedAt && <span className="text-fg-subtle"> · Data as of {formatWat(loadedAt)} WAT</span>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {waitingTotal > 0 && (
                  <div className="flex items-center gap-2 bg-warning-soft border border-warning-line text-on-warning-soft px-3.5 py-2 rounded-lg text-xs font-semibold">
                    <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                    <span>{waitingTotal} item{waitingTotal === 1 ? '' : 's'} waiting for review</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={exportOverview}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-surface border border-line-strong text-fg text-sm font-semibold hover:bg-surface-2 transition-colors disabled:opacity-60"
                >
                  <Download className="w-4 h-4" aria-hidden /> Excel summary
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
              <StatCard
                title="Total Stations"
                value={analytics.totalStations.toLocaleString()}
                subtitle={`${analytics.stationsWithPriceCount.toLocaleString()} with live prices`}
                icon={Building2}
                colorTheme="indigo"
                onClick={can('stations') ? () => setActiveTab('stations') : undefined}
              />
              <StatCard
                title="Average PMS"
                value={analytics.avgPrice > 0 ? `₦${analytics.avgPrice.toLocaleString('en-NG')}` : '—'}
                subtitle={analytics.avgPrice > 0 ? `Spread: ₦${analytics.minPrice.toLocaleString('en-NG')} – ₦${analytics.maxPrice.toLocaleString('en-NG')}` : 'No prices yet'}
                icon={Fuel}
                badge={{ text: 'PMS / Litre', variant: 'neutral' }}
                colorTheme="emerald"
              />
              <StatCard
                title="Verified Outlets"
                value={`${analytics.verifiedPercent}%`}
                subtitle={`${analytics.verifiedCount.toLocaleString()} verified stations`}
                icon={ShieldCheck}
                badge={{ text: 'Trust Score', variant: 'positive' }}
                colorTheme="emerald"
              />
              {can('claims') && (
                <StatCard
                  title="Claims in Queue"
                  value={pendingClaims.length}
                  subtitle="Awaiting CAC review"
                  icon={FileText}
                  badge={pendingClaims.length > 0 ? { text: 'Needs Action', variant: 'warning' } : { text: 'Clear', variant: 'positive' }}
                  colorTheme="amber"
                  onClick={() => setActiveTab('claims')}
                />
              )}
              {can('requests') && (
                <StatCard
                  title="Manager Requests"
                  value={pendingRequests.length}
                  subtitle="Pending promotion"
                  icon={UserPlus}
                  colorTheme="purple"
                  onClick={() => setActiveTab('requests')}
                />
              )}
              {canPrices && (
                <StatCard
                  title="Price Reviews"
                  value={heldCount}
                  subtitle="Not on the map until approved"
                  icon={Hourglass}
                  badge={heldCount > 0 ? { text: 'Needs Action', variant: 'warning' } : { text: 'Clear', variant: 'positive' }}
                  colorTheme="blue"
                  onClick={() => setActiveTab('prices')}
                />
              )}
              <StatCard
                title="Queue Alerts"
                value={analytics.queueActiveCount}
                subtitle="Moderate, heavy or no fuel"
                icon={AlertTriangle}
                badge={analytics.queueActiveCount > 0 ? { text: 'Traffic', variant: 'warning' } : { text: 'Normal', variant: 'positive' }}
                colorTheme={analytics.queueActiveCount > 0 ? 'rose' : 'emerald'}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <BarChart
                title="Average PMS price by brand (₦/L)"
                subtitle="Brands with at least two priced stations"
                data={analytics.brandBars}
                layout="horizontal"
                valuePrefix=""
                valueSuffix=""
              />
              <BarChart
                title="Price ranges"
                subtitle="Stations in each band, from today's lowest to highest price"
                data={analytics.priceBuckets}
                layout="vertical"
                valueSuffix=" stations"
              />
            </div>

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
                subtitle="Latest reports"
                data={analytics.queueDonut}
                centerLabel={analytics.totalStations.toLocaleString()}
                centerSub="Outlets"
              />
              <RatingDistribution
                averageRating={analytics.avgAccuracy}
                totalVotes={analytics.totalVotes}
                title="Pump accuracy"
                subtitle={analytics.ratedCount ? `Average across ${analytics.ratedCount.toLocaleString()} rated stations` : 'No ratings yet'}
              />
            </div>

            <div className="bg-brand-grad rounded-3xl p-6 text-on-brand flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-brand-line">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-brand-2 rounded-lg flex items-center justify-center shrink-0 border border-brand-line">
                  <ShieldCheck className="w-5 h-5 text-brand-accent" aria-hidden />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-on-brand">Data protection is on</h4>
                  <p className="text-sm text-on-brand-muted mt-0.5">
                    Database rules control who can change prices and claims. Unusual prices wait for review, and admin actions are logged.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {can('claims') && (
                  <button onClick={() => setActiveTab('claims')} className="h-10 px-4 rounded-lg bg-accent-solid hover:bg-accent-hover text-on-accent text-sm font-semibold transition-colors">
                    Review claims ({pendingClaims.length})
                  </button>
                )}
                {canPrices && (
                  <button onClick={() => setActiveTab('prices')} className="h-10 px-4 rounded-lg bg-on-brand/5 hover:bg-on-brand/10 text-on-brand text-sm font-medium transition-colors border border-on-brand/15">
                    Price reviews ({heldCount})
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* STATION CLAIMS */}
        {/* =================================================================== */}
        {tab === 'claims' && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-end gap-3">
              <div>
                <h2 className="text-2xl sm:text-3xl font-semibold text-fg mb-1">Station claims</h2>
                <p className="text-fg-muted text-xs sm:text-sm">Check CAC certificates and approve station owners.</p>
              </div>
              <span className="text-xs font-semibold bg-warning-soft text-on-warning-soft border border-warning-line px-3 py-1.5 rounded-lg whitespace-nowrap">
                {pendingClaims.length} Pending Review
              </span>
            </div>

            {isLoading && claims.length === 0 ? (
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
                        <Clock className="w-3 h-3" /> Submitted {formatWat(claim.created_at)}
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
                          <ExternalLink className="w-3 h-3 opacity-50" />
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
                          <ExternalLink className="w-3 h-3 opacity-50" />
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

            <div>
              <h3 className="text-lg font-semibold text-fg mb-3">All claims ({claims.length})</h3>
              <ReportTable id="admin-claims" title="Station claims" rows={claims} columns={CLAIM_COLUMNS}
                rowKey={(r) => String(r.id)} loading={isLoading} loadedAt={loadedAt} onRefresh={() => fetchData()}
                initialSort={{ key: 'created_at', dir: 'desc' }} searchPlaceholder="Search station, applicant, CAC number…"
                emptyText="No station claims yet." />
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* MANAGER REQUESTS */}
        {/* =================================================================== */}
        {tab === 'requests' && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-end gap-3">
              <div>
                <h2 className="text-2xl sm:text-3xl font-semibold text-fg mb-1">Manager access requests</h2>
                <p className="text-fg-muted text-xs sm:text-sm">Review applications from station representatives seeking permission to update station prices.</p>
              </div>
              <span className="text-xs font-semibold bg-accent-soft text-on-accent-soft border border-accent-line px-3 py-1.5 rounded-lg whitespace-nowrap">
                {pendingRequests.length} Pending Approval
              </span>
            </div>

            {isLoading && roleRequests.length === 0 ? (
              <div className="p-16 text-center text-fg-subtle font-semibold animate-pulse">Loading manager requests…</div>
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
                      <h4 className="font-semibold text-fg text-lg pr-24 leading-tight mb-1">{req.full_name || req.email || 'Unnamed user'}</h4>
                      <p className="text-xs font-semibold text-fg-muted mb-1 truncate">{req.email}</p>
                      <p className="text-xs text-fg-subtle mb-4 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Requested {formatWat(req.created_at)}
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
                          <ExternalLink className="w-3 h-3 opacity-50" />
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

            <div>
              <h3 className="text-lg font-semibold text-fg mb-3">All requests ({roleRequests.length})</h3>
              <ReportTable id="admin-role-requests" title="Manager requests" rows={roleRequests} columns={REQUEST_COLUMNS}
                rowKey={(r) => String(r.id)} loading={isLoading} loadedAt={loadedAt} onRefresh={() => fetchData()}
                initialSort={{ key: 'created_at', dir: 'desc' }} searchPlaceholder="Search name, email, company…"
                emptyText="No manager requests yet." />
            </div>
          </div>
        )}

        {tab === 'stations' && <StationsDirectory onChanged={() => fetchData()} />}
        {tab === 'prices' && <PriceReviews onChanged={() => fetchData()} />}
        {tab === 'ads' && <AdsManager />}
        {tab === 'mailing' && <MailingManager />}
        {tab === 'rewards' && <RewardsManager />}
        {tab === 'services' && <ServicesManager />}
        {tab === 'admins' && <AdminsManager />}
      </main>

      {toast && (
        <div
          role="status"
          className={cx(
            'fixed bottom-5 right-5 left-5 sm:left-auto sm:max-w-md z-[200] flex items-start gap-2 rounded-2xl border p-3.5 text-sm shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200',
            toast.ok ? 'bg-success-soft border-success-line text-on-success-soft' : 'bg-danger-soft border-danger-line text-on-danger-soft',
          )}
        >
          {toast.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />}
          <span className="flex-1">{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} className="p-0.5 rounded hover:bg-surface/40" aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report columns for claims and manager requests
// ---------------------------------------------------------------------------
const statusPill = (s: string | null | undefined) => (
  <span className={cx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap',
    s === 'Approved' ? 'bg-success-soft text-on-success-soft'
      : s === 'Rejected' ? 'bg-danger-soft text-on-danger-soft'
      : 'bg-warning-soft text-on-warning-soft')}>
    {s || 'Pending'}
  </span>
);

const CLAIM_COLUMNS: ReportColumn<Row>[] = [
  { key: 'station', header: 'Station', get: (r) => r.station_name, width: 30 },
  { key: 'address', header: 'Address', get: (r) => r.address, defaultVisible: false, width: 40 },
  { key: 'applicant', header: 'Applicant', get: (r) => r.applicant_name },
  { key: 'phone', header: 'Phone', get: (r) => r.phone_number },
  { key: 'email', header: 'Email', get: (r) => r.official_email, width: 28 },
  { key: 'cac', header: 'CAC number', get: (r) => r.business_reg_number },
  { key: 'status', header: 'Status', get: (r) => r.status, render: (r) => statusPill(r.status) },
  { key: 'created_at', header: 'Submitted', get: (r) => r.created_at, type: 'datetime' },
  { key: 'reviewed_at', header: 'Reviewed', get: (r) => r.reviewed_at, type: 'datetime', defaultVisible: false },
  { key: 'notes', header: 'Admin notes', get: (r) => r.admin_notes, defaultVisible: false, width: 40 },
  { key: 'role', header: 'Applicant role', get: (r) => r.applicant_role, defaultVisible: false },
  { key: 'doc', header: 'CAC document on file', get: (r) => !!r.document_url, type: 'boolean', defaultVisible: false },
  { key: 'lat', header: 'Latitude', get: (r) => r.lat, type: 'number', defaultVisible: false },
  { key: 'lng', header: 'Longitude', get: (r) => r.lng, type: 'number', defaultVisible: false },
  { key: 'station_id', header: 'Station ID', get: (r) => r.station_id, defaultVisible: false },
  { key: 'id', header: 'Claim ID', get: (r) => String(r.id), defaultVisible: false },
];

const REQUEST_COLUMNS: ReportColumn<Row>[] = [
  { key: 'name', header: 'Name', get: (r) => r.full_name },
  { key: 'email', header: 'Email', get: (r) => r.email, width: 28 },
  { key: 'company', header: 'Company', get: (r) => r.company_name },
  { key: 'phone', header: 'Phone', get: (r) => r.phone },
  { key: 'status', header: 'Status', get: (r) => r.status, render: (r) => statusPill(r.status) },
  { key: 'created_at', header: 'Requested', get: (r) => r.created_at, type: 'datetime' },
  { key: 'reviewed_at', header: 'Reviewed', get: (r) => r.reviewed_at, type: 'datetime', defaultVisible: false },
  { key: 'note', header: 'Applicant note', get: (r) => r.note, defaultVisible: false, width: 40 },
  { key: 'admin_notes', header: 'Admin notes', get: (r) => r.admin_notes, defaultVisible: false, width: 40 },
  { key: 'doc', header: 'Document on file', get: (r) => !!r.document_url, type: 'boolean', defaultVisible: false },
  { key: 'id', header: 'Request ID', get: (r) => String(r.id), defaultVisible: false },
];