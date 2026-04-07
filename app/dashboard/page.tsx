"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Building2, MapPin, Tag, Image as ImageIcon, 
  LogOut, CheckCircle2, ShieldCheck, Loader2, X, Navigation,
  LayoutGrid, List // <-- Added icons for view toggle
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

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
  custom_logo_url: string | null;
  manager_id: string;
}

// =========================================================================
// BRAND LOGO HELPER 
// =========================================================================

function getStationBrandInfo(name: string | null | undefined, customLogoUrl: string | null | undefined) {
  const lowerName = name?.toLowerCase() || "";
  let logoUrl = customLogoUrl || null; 
  let color = "#10b981"; 
  let text = name ? name.substring(0, 2).toUpperCase() : "GS";
  
  if (!logoUrl) {
    if (lowerName.includes("nnpc")) { logoUrl = "/logos/nnpc.png"; color = "#00a94d"; }
    else if (lowerName.includes("total")) { logoUrl = "/logos/total.png"; color = "#1e3a8a"; }
    else if (lowerName.includes("mobil")) { logoUrl = "/logos/mobil.png"; color = "#2563eb"; }
    else if (lowerName.includes("oando")) { logoUrl = "/logos/oando.png"; color = "#dc2626"; }
    else if (lowerName.includes("conoil")) { logoUrl = "/logos/conoil.png"; color = "#eab308"; }
    else if (
      lowerName.includes("ardova") || 
      lowerName === "ap" || 
      lowerName.startsWith("ap ") || 
      lowerName.includes(" ap ") || 
      lowerName.includes("a.p") || 
      lowerName.includes("a p ")
    ) { logoUrl = "/logos/ap-brand.png"; color = "#ea580c"; }
    else if (lowerName.includes("shell")) { logoUrl = "/logos/shell.png"; color = "#facc15"; }
    else if (lowerName.includes("rainoil")) { logoUrl = "/logos/rainoil.png"; color = "#0ea5e9"; }
    else if (lowerName.includes("bovas")) { logoUrl = "/logos/bovas.png"; color = "#f43f5e"; }
    else if (lowerName.includes("mrs")) { logoUrl = "/logos/mrs.png"; color = "#712539"; }
    else if (lowerName.includes("11plc") || /\b11\b/.test(lowerName)) { logoUrl = "/logos/11.png"; color = "#0759ad"; }
    else if (lowerName.includes("shafa")) { logoUrl = "/logos/shafa.png"; color = "#e63035"; }
    else if (lowerName.includes("heyden")) { logoUrl = "/logos/heyden.png"; color = "#f76300"; }
    else if (lowerName.includes("nipco")) { logoUrl = "/logos/nipco.png"; color = "#f50002"; }
    else if (lowerName.includes("techno")) { logoUrl = "/logos/techno.png"; color = "#ee161f"; }
    else if (lowerName.includes("enyo")) { logoUrl = "/logos/enyo.png"; color = "#313864"; }
    else if (lowerName.includes("matrix")) { logoUrl = "/logos/matrix.png"; color = "#5dc0e5"; }
    else if (lowerName.includes("fatgbems")) { logoUrl = "/logos/fatgbems.png"; color = "#a13227"; }
    else if (lowerName.includes("forte")) { logoUrl = "/logos/forte.png"; color = "#a3bc01"; }
  }
  return { logoUrl, color, text };
}

// =========================================================================
// MANAGER DASHBOARD COMPONENT
// =========================================================================

export default function DashboardPage() {
  const supabase = createClient();
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  
  // View Toggle State (Card vs List)
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');

  // Form State
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editLogoUrl, setEditLogoUrl] = useState("");

  // --- AUTH & DATA FETCHING ---
  useEffect(() => {
    const loadDashboard = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        router.push('/login');
        return;
      }
      
      setUser(user);

      const { data: managerStations, error: dbError } = await supabase
        .from('stations')
        .select('*')
        .eq('manager_id', user.id);

      if (!dbError && managerStations) {
        setStations(managerStations as Station[]);
      }
      setLoading(false);
    };

    loadDashboard();
  }, [router, supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // --- EDIT & SAVE LOGIC ---
  const openEditModal = (station: Station) => {
    setEditingStation(station);
    setEditName(station.name || "");
    setEditAddress(station.address || "");
    setEditPrice(station.price_pms ? station.price_pms.toString() : "");
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

      const { error: uploadError } = await supabase.storage
        .from('station_logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('station_logos').getPublicUrl(filePath);
      setEditLogoUrl(data.publicUrl);

    } catch (error: any) {
      alert('Error uploading logo: ' + error.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  const saveStationUpdates = async () => {
    if (!editingStation) return;
    setIsSaving(true);

    const { error } = await supabase
      .from('stations')
      .update({
        name: editName,
        address: editAddress,
        price_pms: editPrice ? parseFloat(editPrice) : null,
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
      alert("Station details updated successfully! Live on map.");
      setEditingStation(null);
      setStations(stations.map(s => s.station_id === editingStation.station_id ? {
        ...s, name: editName, address: editAddress, price_pms: parseFloat(editPrice), custom_logo_url: editLogoUrl
      } : s));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* NAVBAR */}
      <nav className="bg-indigo-900 text-white p-4 shadow-md">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tighter text-emerald-400">Qozob.</h1>
            <span className="bg-white/10 text-xs font-bold px-3 py-1 rounded-full text-indigo-200 border border-white/10 hidden sm:inline-block">
              Supplier Control Center
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-indigo-200">{user?.email}</span>
            <button onClick={handleSignOut} className="flex items-center gap-2 text-xs font-black bg-white/10 hover:bg-white/20 border border-white/10 px-4 py-2 rounded-xl transition-all">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        
        {/* HEADER & VIEW CONTROLS */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-indigo-950 flex items-center gap-2">
              <ShieldCheck className="text-emerald-500 w-8 h-8" /> Your Claimed Stations
            </h2>
            <p className="text-slate-500 mt-2">Updates made here will instantly override community data and apply the "Official Verified" badge to your stations on the public map.</p>
          </div>
          
          {/* View Toggle */}
          {stations.length > 0 && (
            <div className="flex bg-slate-200 p-1 rounded-lg w-fit flex-shrink-0">
              <button 
                onClick={() => setViewMode('card')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'card' ? 'bg-white shadow-sm text-indigo-900' : 'text-slate-500 hover:text-slate-700'}`}
                title="Card View"
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-900' : 'text-slate-500 hover:text-slate-700'}`}
                title="List View"
              >
                <List className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {stations.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-sm">
            <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-800 mb-2">No stations claimed yet</h3>
            <p className="text-slate-500 max-w-md mx-auto">You currently do not have management access to any stations. Claim a station on the public map to manage it here.</p>
          </div>
        ) : (
          <div className={viewMode === 'card' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "flex flex-col gap-4"}>
            {stations.map(station => {
              const { logoUrl, color, text } = getStationBrandInfo(station.name, station.custom_logo_url);

              return (
                <div key={station.id} className={`bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex ${viewMode === 'card' ? 'flex-col' : 'flex-col lg:flex-row lg:items-center gap-4 lg:gap-6'}`}>
                  {/* Status Strip */}
                  <div className={`absolute top-0 left-0 bg-emerald-500 ${viewMode === 'card' ? 'w-full h-2' : 'w-full h-2 lg:w-2 lg:h-full'}`}></div>
                  
                  {/* Identity Section */}
                  <div className={`flex items-center gap-4 ${viewMode === 'card' ? 'mb-4 mt-2' : 'flex-1 pt-4 lg:pt-0'}`}>
                    <div className="w-16 h-16 rounded-full border border-slate-200 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
                      {logoUrl ? (
                        <img src={logoUrl} alt={station.name} className="w-full h-full object-contain p-1" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: color }}>
                          <span className="text-white font-black text-xl tracking-tighter leading-none">{text}</span>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-indigo-950 text-lg leading-tight truncate">{station.name}</h3>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-1 truncate max-w-[200px] xl:max-w-[300px]" title={station.address}>
                        <MapPin className="w-3 h-3 flex-shrink-0" /> {station.address}
                      </p>
                    </div>
                  </div>

                  {/* Price Section */}
                  <div className={`bg-slate-50 rounded-xl p-4 border border-slate-100 flex justify-between items-center ${viewMode === 'card' ? 'mb-6 flex-grow' : 'w-full lg:w-48 flex-shrink-0'}`}>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Official Price</p>
                      <p className="text-2xl font-black text-indigo-900">{station.price_pms ? `₦${station.price_pms}` : 'Not Set'}</p>
                    </div>
                    <Tag className="w-6 h-6 text-emerald-400" />
                  </div>

                  {/* Actions Section */}
                  <div className={`flex gap-2 ${viewMode === 'card' ? 'mt-auto flex-col sm:flex-row' : 'flex-col sm:flex-row w-full lg:w-auto'}`}>
                    <button 
                      onClick={() => openEditModal(station)}
                      className={`bg-indigo-900 hover:bg-indigo-800 text-white font-bold py-3 px-4 rounded-xl transition-colors text-sm ${viewMode === 'card' ? 'w-full sm:flex-[2]' : 'w-full sm:w-auto'}`}
                    >
                      Manage Details
                    </button>
                    {/* FIXED: Reverted to external Google Maps URL for directions */}
                    <a 
                      href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold py-3 px-4 rounded-xl transition-colors border border-emerald-100 text-sm flex items-center justify-center gap-2 ${viewMode === 'card' ? 'w-full sm:flex-1' : 'w-full sm:w-auto'}`}
                    >
                      <Navigation className="w-4 h-4" /> Map
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* EDIT MODAL */}
      {editingStation && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full relative shadow-2xl max-h-[90vh] overflow-y-auto">
            <button onClick={() => setEditingStation(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-800">
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-2xl font-black text-indigo-950 mb-6">Edit Station</h2>

            {/* Station Name */}
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Station Name</label>
            <input 
              type="text" 
              value={editName} 
              onChange={(e) => setEditName(e.target.value)} 
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4 outline-none focus:border-indigo-500 font-bold text-slate-800" 
            />

            {/* Address */}
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Address</label>
            <textarea 
              value={editAddress} 
              onChange={(e) => setEditAddress(e.target.value)} 
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4 outline-none focus:border-indigo-500 text-sm text-slate-600 resize-none h-20" 
            />

            {/* Price */}
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Current PMS Price (₦)</label>
            <input 
              type="number" 
              step="0.01" 
              value={editPrice} 
              onChange={(e) => setEditPrice(e.target.value)} 
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 text-2xl font-black outline-none focus:border-emerald-500 transition-colors text-indigo-900" 
              placeholder="e.g. 950" 
            />

            {/* Logo Upload */}
            <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Brand Logo (Overrides map default)</label>
            <div className="flex items-center gap-4 mb-8 bg-indigo-50 p-4 rounded-xl border border-indigo-100">
              {editLogoUrl ? (
                <img src={editLogoUrl} alt="Preview" className="w-12 h-12 rounded-full border border-slate-200 object-contain bg-white" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center border border-slate-200">
                  <ImageIcon className="w-5 h-5 text-slate-300" />
                </div>
              )}
              <div className="flex-1">
                <input 
                  type="file" 
                  accept="image/png, image/jpeg" 
                  onChange={handleLogoUpload}
                  disabled={uploadingLogo}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer disabled:opacity-50" 
                />
                {uploadingLogo && <p className="text-[10px] text-indigo-600 mt-1 font-bold animate-pulse">Uploading image...</p>}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button 
                onClick={() => setEditingStation(null)} 
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-4 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={saveStationUpdates} 
                disabled={isSaving || uploadingLogo || !editName} 
                className="flex-[2] bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-xl transition-all disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {isSaving ? "Publishing..." : <><CheckCircle2 className="w-5 h-5" /> Publish to Map</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}