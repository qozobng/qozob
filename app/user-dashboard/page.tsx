"use client";

import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  User as UserIcon, Settings, ShieldCheck, Map as MapIcon, 
  LogOut, Star, Droplet, ArrowRight, CheckCircle2, Loader2,
  TrendingDown, Bookmark, Fuel, Compass, AlertCircle, ArrowUpRight,
  Sparkles, Navigation, Clock, Check, MapPin
} from 'lucide-react';

import { createClient } from '@/utils/supabase/client';
import {
  getRole, getLatestRoleRequest, requestManagerAccess, ensureManagerRequestFiled, type RoleRequest
} from '@/lib/roles';
import { StatCard } from '@/components/analytics/StatCard';
import { BarChart, BarItem } from '@/components/analytics/BarChart';
import { AreaChart, AreaDataPoint } from '@/components/analytics/AreaChart';

interface RatedStationItem {
  station_id: string;
  stars: number;
  created_at: string;
  station_name?: string;
  address?: string;
  price_pms?: number | null;
}

interface FavoriteStation {
  station_id: string;
  name: string;
  address: string;
  price_pms: number | null;
  queue_status: string;
}

function UserDashboardContent() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const defaultTab = searchParams.get('tab') === 'settings' ? 'settings' : 'overview';

  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [loading, setLoading] = useState(true);
  
  // Data State
  const [userRatings, setUserRatings] = useState<RatedStationItem[]>([]);
  const [favoriteStations, setFavoriteStations] = useState<FavoriteStation[]>([]);
  const [nationalAvgPrice, setNationalAvgPrice] = useState<number>(915);
  const [bestPriceNearby, setBestPriceNearby] = useState<number>(875);

  // Settings States
  const [currentRole, setCurrentRole] = useState<string>("User");
  const [selectedRole, setSelectedRole] = useState<string>("User");
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [roleRequest, setRoleRequest] = useState<RoleRequest | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error || !user) {
        return router.push('/login');
      }
      
      setUser(user);
      const role = getRole(user);
      setCurrentRole(role);

      // 1. Load user's rating history from station_ratings
      const { data: ratingsData, error: ratingsError } = await supabase
        .from('station_ratings')
        .select('*')
        .order('created_at', { ascending: false });

      if (ratingsError) {
        console.warn("Could not load user ratings:", ratingsError.message);
      }

      // 2. Fetch station names for the rated stations
      const ratedIds = (ratingsData || []).map(r => r.station_id);
      const stationsMap = new Map<string, any>();
      if (ratedIds.length > 0) {
        const { data: stationsData } = await supabase
          .from('stations')
          .select('station_id, name, address, price_pms')
          .in('station_id', ratedIds);
        
        (stationsData || []).forEach(s => stationsMap.set(s.station_id, s));
      }

      const mergedRatings: RatedStationItem[] = (ratingsData || []).map(r => {
        const s = stationsMap.get(r.station_id);
        return {
          station_id: r.station_id,
          stars: r.stars,
          created_at: r.created_at,
          station_name: s?.name || "Fuel Station",
          address: s?.address || "Address unavailable",
          price_pms: s?.price_pms || null,
        };
      });
      setUserRatings(mergedRatings);

      // 3. Load sample stations for price benchmarking & favorites
      const { data: benchmarkSample } = await supabase
        .from('stations')
        .select('station_id, name, address, price_pms, queue_status')
        .not('price_pms', 'is', null)
        .limit(20);

      if (benchmarkSample && benchmarkSample.length > 0) {
        const prices = benchmarkSample.map(s => s.price_pms).filter((p): p is number => typeof p === 'number' && p > 0);
        if (prices.length > 0) {
          const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
          const min = Math.min(...prices);
          setNationalAvgPrice(avg);
          setBestPriceNearby(min);
        }

        // Default watchlist if none stored in localStorage
        const storedFavs = typeof window !== 'undefined' ? localStorage.getItem('qozob_fav_stations') : null;
        if (storedFavs) {
          try {
            setFavoriteStations(JSON.parse(storedFavs));
          } catch {
            setFavoriteStations(benchmarkSample.slice(0, 3) as FavoriteStation[]);
          }
        } else {
          setFavoriteStations(benchmarkSample.slice(0, 3) as FavoriteStation[]);
        }
      }

      // 4. Role requests check
      const latest = role === 'User'
        ? (await ensureManagerRequestFiled(supabase, user)) ?? (await getLatestRoleRequest(supabase, user.id))
        : null;
      setRoleRequest(latest);
      setSelectedRole(role !== 'User' || latest?.status === 'Pending' ? 'Manager' : 'User');
      setLoading(false);
    };

    loadUser();
  }, [router, supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const isPending = roleRequest?.status === 'Pending';
  const canChangeRole = currentRole === 'User';
  const roleActionNeeded = canChangeRole && (
    (selectedRole === 'Manager' && !isPending) || (selectedRole === 'User' && isPending)
  );

  const handleUpdateRole = async () => {
    if (!user || !roleActionNeeded) return;
    setIsUpdatingRole(true);

    if (selectedRole === 'Manager') {
      const result = await requestManagerAccess(supabase, user);
      setIsUpdatingRole(false);
      if (!result.ok) {
        return alert("Error sending request: " + result.error);
      }
      setRoleRequest(await getLatestRoleRequest(supabase, user.id));
      alert("Request submitted! Our team will review your station ownership credentials.");
    } else {
      if (roleRequest) {
        const { error } = await supabase.from('role_requests').delete().eq('id', roleRequest.id).eq('status', 'Pending');
        if (error) {
          setIsUpdatingRole(false);
          return alert("Error withdrawing request: " + error.message);
        }
      }
      await supabase.auth.updateUser({ data: { role: 'User' } });
      setIsUpdatingRole(false);
      setRoleRequest(null);
      alert("Your Manager access request has been withdrawn.");
    }
  };

  // Gamification: Calculate Scout Rank & Points
  const userRank = useMemo(() => {
    const points = userRatings.length * 25 + 50; // 50 sign up points + 25 per rating
    let title = "Fuel Scout Level 1";
    let badgeColor = "emerald";
    if (points >= 200) {
      title = "Community Champion (Lvl 4)";
      badgeColor = "purple";
    } else if (points >= 120) {
      title = "Road Navigator (Lvl 3)";
      badgeColor = "indigo";
    } else if (points >= 75) {
      title = "Active Contributor (Lvl 2)";
      badgeColor = "blue";
    }
    return { points, title, badgeColor };
  }, [userRatings]);

  // Savings Calculator
  const savingsEstimate = useMemo(() => {
    const spreadPerLiter = Math.max(0, nationalAvgPrice - bestPriceNearby);
    const savingsPerTank50L = spreadPerLiter * 50; // 50 Liters
    const monthlySavings = savingsPerTank50L * 4; // 4 refills a month
    return {
      spreadPerLiter,
      savingsPerTank50L,
      monthlySavings
    };
  }, [nationalAvgPrice, bestPriceNearby]);

  // Savings Comparison Chart
  const savingsChartBars: BarItem[] = useMemo(() => {
    return [
      {
        label: 'Best Local Price',
        value: bestPriceNearby,
        formattedValue: `₦${bestPriceNearby}/L`,
        secondaryLabel: `Save ₦${savingsEstimate.spreadPerLiter}/L`,
        color: '#10b981',
      },
      {
        label: 'National Average',
        value: nationalAvgPrice,
        formattedValue: `₦${nationalAvgPrice}/L`,
        secondaryLabel: 'Benchmark',
        color: '#312e81',
      },
      {
        label: 'High Price Station',
        value: nationalAvgPrice + 45,
        formattedValue: `₦${nationalAvgPrice + 45}/L`,
        secondaryLabel: `Overpaying ₦${savingsEstimate.spreadPerLiter + 45}/L`,
        color: '#f59e0b',
      },
    ];
  }, [bestPriceNearby, nationalAvgPrice, savingsEstimate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center w-full bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col md:flex-row w-full pb-10">
      
      {/* ======================= SIDEBAR NAVIGATION ======================= */}
      <aside className="w-full md:w-64 bg-indigo-950 text-white flex flex-col md:min-h-screen shadow-xl z-10 shrink-0 border-r border-indigo-900">
        <div className="p-6">
          <h1 
            className="text-2xl font-black tracking-tight text-emerald-400 cursor-pointer mb-6" 
            onClick={() => router.push('/')}
          >
            Qozob.
          </h1>
          
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10 mb-6">
            <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block mb-1">Signed In</span>
            <p className="text-xs font-bold text-white truncate">{user?.email}</p>
            <div className="mt-2.5 inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border border-emerald-500/30">
              {currentRole === 'Manager' ? <ShieldCheck className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
              <span>{currentRole}</span>
            </div>
          </div>

          <nav className="flex flex-col gap-1.5">
            <button 
              onClick={() => setActiveTab('overview')} 
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'overview' ? 'bg-emerald-500 text-indigo-950 shadow-xs' : 'text-indigo-200 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>Overview & Savings</span>
            </button>

            <button 
              onClick={() => setActiveTab('contributions')} 
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'contributions' ? 'bg-emerald-500 text-indigo-950 shadow-xs' : 'text-indigo-200 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Star className="w-4 h-4" />
                <span>Pump Ratings</span>
              </div>
              {userRatings.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'contributions' ? 'bg-indigo-950 text-white' : 'bg-white/10 text-emerald-300'}`}>
                  {userRatings.length}
                </span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab('watchlist')} 
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'watchlist' ? 'bg-emerald-500 text-indigo-950 shadow-xs' : 'text-indigo-200 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Bookmark className="w-4 h-4" />
              <span>Favorite Stations</span>
            </button>

            <button 
              onClick={() => setActiveTab('settings')} 
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'settings' ? 'bg-emerald-500 text-indigo-950 shadow-xs' : 'text-indigo-200 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Account Settings</span>
            </button>
          </nav>
        </div>

        <div className="mt-auto p-6 flex flex-col gap-2 border-t border-indigo-900/60">
          {(currentRole === 'Manager' || currentRole === 'Admin' || isPending) && (
            <button 
              onClick={() => router.push('/dashboard')} 
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black text-indigo-950 bg-emerald-400 hover:bg-emerald-300 transition-colors w-full shadow-sm"
            >
              <ShieldCheck className="w-4 h-4" /> Manager Portal
            </button>
          )}
          <button 
            onClick={() => router.push('/')} 
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-indigo-200 hover:bg-white/5 hover:text-white transition-colors w-full"
          >
            <MapIcon className="w-4 h-4" /> Live Map
          </button>
          <button 
            onClick={handleSignOut} 
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-rose-300 hover:bg-rose-500/10 transition-colors w-full"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* ======================= MAIN CONTENT AREA ======================= */}
      <main className="flex-1 p-4 sm:p-6 lg:p-10 overflow-y-auto">
        
        {/* ======================= TAB 1: OVERVIEW & SAVINGS ======================= */}
        {activeTab === 'overview' && (
          <div className="max-w-5xl flex flex-col gap-6 animate-in fade-in duration-300">
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-indigo-950">Driver Intelligence</h2>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
                Track personal fuel savings, community reputation score, and verified pump accuracy reports.
              </p>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                title="Community Rank"
                value={userRank.title.split(' (')[0]}
                subtitle={`${userRank.points} Scout Reputation Points`}
                icon={Sparkles}
                badge={{ text: 'Level Up', variant: 'positive' }}
                colorTheme="indigo"
              />

              <StatCard
                title="Est. Savings / Month"
                value={`₦${savingsEstimate.monthlySavings.toLocaleString()}`}
                subtitle={`Based on ₦${savingsEstimate.spreadPerLiter}/L spread`}
                icon={TrendingDown}
                badge={{ text: 'Savings', variant: 'positive' }}
                colorTheme="emerald"
              />

              <StatCard
                title="Pumps Verified"
                value={userRatings.length}
                subtitle="Calibration reviews filed"
                icon={Star}
                badge={userRatings.length > 0 ? { text: 'Active', variant: 'positive' } : { text: 'Get Started', variant: 'neutral' }}
                colorTheme="amber"
                onClick={() => setActiveTab('contributions')}
              />

              <StatCard
                title="Watched Stations"
                value={favoriteStations.length}
                subtitle="Monitored for cheap prices"
                icon={Bookmark}
                colorTheme="blue"
                onClick={() => setActiveTab('watchlist')}
              />
            </div>

            {/* Price Spread & Savings Analytical Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <BarChart
                  title="Fuel Price Savings Per Tank (₦ / Litre)"
                  subtitle={`Filling a typical 50-litre tank at best local rate saves ≈ ₦${savingsEstimate.savingsPerTank50L.toLocaleString()}`}
                  data={savingsChartBars}
                  layout="horizontal"
                  valuePrefix=""
                  valueSuffix=""
                />
              </div>

              {/* Monthly Savings Calculator Card */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Refill Impact</span>
                  <h4 className="text-base font-black text-indigo-950 mt-1">Smart Routing Payoff</h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    By checking Qozob before refueling, you avoid stations with high markups or long queues.
                  </p>
                </div>

                <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 my-4 text-xs">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-emerald-900">Savings per 50L Tank</span>
                    <span className="font-black text-emerald-700 text-sm">₦{savingsEstimate.savingsPerTank50L.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-emerald-200/60">
                    <span className="font-bold text-emerald-900">4 Refills / Month</span>
                    <span className="font-black text-emerald-700 text-sm">₦{savingsEstimate.monthlySavings.toLocaleString()}</span>
                  </div>
                </div>

                <button
                  onClick={() => router.push('/')}
                  className="w-full bg-indigo-950 hover:bg-indigo-900 text-white font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Find Cheapest Stations Near Me</span>
                </button>
              </div>
            </div>

            {/* Quick Favorites Section */}
            {favoriteStations.length > 0 && (
              <div className="mt-2">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-black text-slate-800">Favorite Stations Quick-Watch</h3>
                  <button 
                    onClick={() => setActiveTab('watchlist')}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                  >
                    View All ({favoriteStations.length})
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {favoriteStations.slice(0, 3).map((fav, i) => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <h4 className="font-bold text-indigo-950 text-sm truncate">{fav.name}</h4>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            fav.queue_status === 'No Queue' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {fav.queue_status || 'Smooth'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mb-3">{fav.address}</p>
                      </div>

                      <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                        <span className="text-lg font-black text-indigo-950 font-mono">
                          {fav.price_pms ? `₦${fav.price_pms}` : 'Unset'}
                        </span>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fav.name)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Navigation className="w-3 h-3" /> Go
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================= TAB 2: PUMP RATINGS HISTORY ======================= */}
        {activeTab === 'contributions' && (
          <div className="max-w-4xl flex flex-col gap-6 animate-in fade-in duration-300">
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-indigo-950">Pump Integrity & Meter Reviews</h2>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
                History of pump meter fairness ratings you have contributed to the driver community.
              </p>
            </div>

            {userRatings.length === 0 ? (
              <div className="bg-white border border-slate-200/80 rounded-3xl p-12 text-center shadow-xs">
                <Star className="w-14 h-14 text-slate-300 mx-auto mb-3" />
                <h4 className="text-base font-black text-indigo-950 mb-1">No ratings submitted yet</h4>
                <p className="text-slate-500 text-xs max-w-sm mx-auto mb-5">
                  When you visit a filling station, rate their meter calibration accuracy directly from the station detail card on the map.
                </p>
                <button 
                  onClick={() => router.push('/')} 
                  className="bg-indigo-950 hover:bg-indigo-900 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition-colors shadow-sm"
                >
                  Explore Stations on Map
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-3xl shadow-xs border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4">Station</th>
                        <th className="px-6 py-4">Your Rating</th>
                        <th className="px-6 py-4">Current Price</th>
                        <th className="px-6 py-4">Date Rated</th>
                        <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {userRatings.map((rating, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4">
                            <span className="font-bold text-slate-900 block">{rating.station_name}</span>
                            <span className="text-[11px] text-slate-500 truncate max-w-xs block">{rating.address}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1 text-amber-500">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star
                                  key={s}
                                  className={`w-3.5 h-3.5 ${
                                    s <= rating.stars ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                                  }`}
                                />
                              ))}
                              <span className="ml-1 text-xs font-black text-slate-700">{rating.stars}.0</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-mono font-bold text-slate-800">
                              {rating.price_pms ? `₦${rating.price_pms}` : '—'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-400">
                            {new Date(rating.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => router.push(`/?select=${rating.station_id}`)}
                              className="text-indigo-600 hover:text-indigo-800 font-bold text-xs"
                            >
                              View on Map
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================= TAB 3: WATCHLIST ======================= */}
        {activeTab === 'watchlist' && (
          <div className="max-w-4xl flex flex-col gap-6 animate-in fade-in duration-300">
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-indigo-950">Favorite Stations Watchlist</h2>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
                Quick-access monitors for your everyday commuting and neighborhood filling stations.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {favoriteStations.map((station, i) => (
                <div key={i} className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-1.5">
                      <h4 className="font-black text-indigo-950 text-base leading-tight">{station.name}</h4>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        station.queue_status === 'No Queue' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {station.queue_status || 'Smooth'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-4">{station.address}</p>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex justify-between items-center mb-4">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Official Price</span>
                      <span className="text-2xl font-black text-indigo-950 font-mono">
                        {station.price_pms ? `₦${station.price_pms}` : 'Unset'}
                      </span>
                    </div>
                    <Fuel className="w-6 h-6 text-emerald-400" />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => router.push(`/?select=${station.station_id}`)}
                      className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold py-2.5 rounded-xl text-xs transition-colors"
                    >
                      Focus Map
                    </button>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(station.name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-4 py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Navigation className="w-3.5 h-3.5 text-emerald-600" /> Navigate
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======================= TAB 4: SETTINGS ======================= */}
        {activeTab === 'settings' && (
          <div className="max-w-3xl flex flex-col gap-6 animate-in fade-in duration-300">
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-indigo-950">Account Settings</h2>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Manage credentials, permissions and station manager status.</p>
            </div>

            {/* ROLE UPGRADE CARD */}
            <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-xs">
              <div className="bg-indigo-50 p-6 border-b border-indigo-100">
                <h3 className="text-base font-black text-indigo-950 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-600" />
                  <span>Platform Permissions & Roles</span>
                </h3>
                <p className="text-xs text-indigo-800 mt-1">
                  {canChangeRole
                    ? "Station owners and filling station operators can request Manager rights to publish official prices."
                    : "Your manager credentials have been verified by the Qozob administration."}
                </p>
              </div>

              <div className="p-6">
                <div className={`flex flex-col sm:flex-row gap-4 mb-6 ${canChangeRole ? '' : 'pointer-events-none opacity-70'}`}>
                  
                  {/* Everyday User */}
                  <label 
                    className={`flex-1 relative flex flex-col p-5 cursor-pointer rounded-2xl border-2 transition-all ${
                      selectedRole === 'User' ? 'border-emerald-500 bg-emerald-50/50 shadow-xs' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <input 
                      type="radio" 
                      name="role" 
                      value="User" 
                      checked={selectedRole === 'User'} 
                      onChange={() => setSelectedRole('User')} 
                      className="sr-only" 
                    />
                    <div className="flex justify-between items-start mb-3">
                      <div className={`p-2 rounded-xl ${selectedRole === 'User' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                        <UserIcon className="w-5 h-5" />
                      </div>
                      {selectedRole === 'User' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                    </div>
                    <h4 className="font-black text-indigo-950 text-sm mb-0.5">Everyday Driver / Motorist</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Find competitive prices, avoid congested queues, and rate pump calibration accuracy.
                    </p>
                  </label>

                  {/* Station Manager */}
                  <label 
                    className={`flex-1 relative flex flex-col p-5 cursor-pointer rounded-2xl border-2 transition-all ${
                      selectedRole === 'Manager' ? 'border-indigo-600 bg-indigo-50/50 shadow-xs' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <input 
                      type="radio" 
                      name="role" 
                      value="Manager" 
                      checked={selectedRole === 'Manager'} 
                      onChange={() => setSelectedRole('Manager')} 
                      className="sr-only" 
                    />
                    <div className="flex justify-between items-start mb-3">
                      <div className={`p-2 rounded-xl ${selectedRole === 'Manager' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}>
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      {selectedRole === 'Manager' && <CheckCircle2 className="w-5 h-5 text-indigo-600" />}
                    </div>
                    <h4 className="font-black text-indigo-950 text-sm mb-0.5">Retail Station Manager</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Publish official PMS prices, verify CAC registration, and manage fleet branding.
                    </p>
                  </label>
                </div>

                {/* Status Box */}
                {isPending && (
                  <div className="mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 text-xs">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Manager Request Awaiting Approval</p>
                      <p className="text-amber-800 mt-0.5">
                        Submitted on {new Date(roleRequest!.created_at).toLocaleDateString()}. You will receive full manager privileges as soon as your claim is audited.
                      </p>
                    </div>
                  </div>
                )}

                {canChangeRole && roleActionNeeded && (
                  <button
                    onClick={handleUpdateRole}
                    disabled={isUpdatingRole}
                    className="w-full bg-indigo-950 hover:bg-indigo-900 text-white font-black py-3 rounded-xl text-xs transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isUpdatingRole ? 'Submitting Application...' : selectedRole === 'Manager' ? 'Submit Manager Access Request' : 'Withdraw Manager Request'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </main>

    </div>
  );
}

export default function UserDashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    }>
      <UserDashboardContent />
    </Suspense>
  );
}