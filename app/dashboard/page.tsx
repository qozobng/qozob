"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Building2, MapPin, Tag, Image as ImageIcon, 
  LogOut, UploadCloud, CheckCircle2, ShieldCheck, Loader2
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

// =========================================================================
// TYPES
// =========================================================================

interface Station {
  id: string; // The Supabase row ID
  station_id: string; // The Google Place ID
  name: string;
  address: string;
  price_pms: number | null;
  custom_logo_url: string | null;
  manager_id: string;
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

      // Fetch ONLY the stations where the current user is the manager
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

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('station_logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get Public URL
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
        updated_by_role: 'Owner', // Flags this as an official price on the map
        verified: true,           // Adds the blue checkmark on the map
        last_updated: new Date().toISOString()
      })
      .eq('id', editingStation.id)
      .eq('manager_id', user.id); // Double security check

    setIsSaving(false);

    if (error) {
      alert("Error saving updates: " + error.message);
    } else {
      alert("Station details updated successfully! Live on map.");
      setEditingStation(null);
      // Refresh local state to show new data
      setStations(stations.map(s => s.id === editingStation.id ? {
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
        <div className="mb-8">
          <h2 className="text-3xl font-black text-indigo-950 flex items-center gap-2">
            <ShieldCheck className="text-emerald-500 w-8 h-8" /> Your Claimed Stations
          </h2>
          <p className="text-slate-500 mt-2">Updates made here will instantly override community data and apply the "Official Verified" badge to your stations on the public map.</p>
        </div>

        {stations.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-sm">
            <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-800 mb-2">No stations claimed yet</h3>
            <p className="text-slate-500 max-w-md mx-auto">You currently do not have management access to any stations. Claim a station on the public map to manage it here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stations.map(station => (
              <div key={station.id} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500"></div>
                
                <div className="flex items-center gap-4 mb-6 mt-2">
                  {station.custom_logo_url ? (
                    <img src={station.custom_logo_url} alt="Logo" className="w-16 h-16 rounded-full border border-slate-200 object-contain p-1" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 text-slate-400">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-extrabold text-indigo-950 text-lg leading-tight">{station.name}</h3>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-1 truncate max-w-[200px]">
                      <MapPin className="w-3 h-3 flex-shrink-0" /> {station.address}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Official Price</p>
                    <p className="text-2xl font-black text-indigo-900">{station.price_pms ? `₦${station.price_pms}` : 'Not Set'}</p>
                  </div>
                  <Tag className="w-6 h-6 text-emerald-400" />
                </div>

                <button 
                  onClick={() => openEditModal(station)}
                  className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-3 rounded-xl transition-colors border border-indigo-100"
                >
                  Manage Details & Pricing
                </button>
              </div>
            ))}
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