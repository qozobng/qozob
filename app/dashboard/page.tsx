"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { 
  LogOut, ShieldCheck, MapPin, Edit3, Image as ImageIcon, 
  UploadCloud, CheckCircle2, AlertCircle, Loader2, Droplet, Clock
} from 'lucide-react';

// --- Supabase Setup ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export default function ManagerDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [stations, setStations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Edit Modal State
  const [editingStation, setEditingStation] = useState<any>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editQueue, setEditQueue] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  
  // Status States
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  // 1. Authenticate & Fetch Data
  useEffect(() => {
    async function loadDashboard() {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        router.push('/login'); // Boot unauthorized users
        return;
      }
      
      setUser(session.user);

      // Fetch stations (For this MVP, we fetch a few stations to let you test the edit feature)
      // In production, you would add `.eq('owner_id', session.user.id)` to only show THEIR stations.
      const { data: stationData } = await supabase.from('stations').select('*').limit(5);
      if (stationData) setStations(stationData);
      
      setLoading(false);
    }
    loadDashboard();
  }, [router]);

  // 2. Handle Logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // 3. Handle Saving Station Updates (Including Logo Upload)
  const handleSaveStation = async () => {
    if (!editingStation) return;
    setIsSaving(true);
    setMessage({ type: "", text: "" });

    try {
      let customLogoUrl = editingStation.custom_logo_url; // Keep existing if no new file

      // A. If a new logo was selected, upload it to Supabase Storage first
      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `logo_${editingStation.station_id}_${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('station_logos') // We will create this bucket next!
          .upload(fileName, logoFile, { upsert: true });

        if (uploadError) throw new Error("Logo upload failed: " + uploadError.message);

        // Get the public URL of the uploaded image
        const { data: publicUrlData } = supabase.storage
          .from('station_logos')
          .getPublicUrl(fileName);
          
        customLogoUrl = publicUrlData.publicUrl;
      }

      // B. Update the Station Record in the database
      const { error: dbError } = await supabase.from('stations').update({
        price_pms: editPrice ? parseInt(editPrice) : editingStation.price_pms,
        queue_status: editQueue || editingStation.queue_status,
        custom_logo_url: customLogoUrl,
        last_updated: new Date().toISOString(),
        updated_by_role: 'Owner',
        verified: true // Managers saving this implies verified pricing
      }).eq('station_id', editingStation.station_id);

      if (dbError) throw new Error("Database update failed: " + dbError.message);

      setMessage({ type: "success", text: "Station updated successfully!" });
      
      // Update local state so UI reflects changes instantly
      setStations(stations.map(s => s.station_id === editingStation.station_id 
        ? { ...s, price_pms: editPrice, queue_status: editQueue, custom_logo_url: customLogoUrl } 
        : s
      ));
      
      setTimeout(() => { setEditingStation(null); setLogoFile(null); }, 1500);

    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      
      {/* Top Navigation */}
      <nav className="bg-indigo-950 text-white p-4 sticky top-0 z-40 shadow-md">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
            <h1 className="text-xl font-black tracking-tighter">Qozob <span className="font-medium text-indigo-300">Manager</span></h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-indigo-200 hidden md:block">{user?.email}</span>
            <button onClick={handleLogout} className="flex items-center gap-2 bg-indigo-900 hover:bg-indigo-800 px-4 py-2 rounded-lg text-sm font-bold transition-colors border border-indigo-700">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 md:p-8">
        
        {/* Header Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-black text-slate-800">My Stations</h2>
          <p className="text-slate-500 mt-1">Manage pricing, queue status, and branding for your verified locations.</p>
        </div>

        {/* Station List Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {stations.map((station) => (
            <div key={station.station_id} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row gap-6 items-start md:items-center">
              
              {/* Logo Preview */}
              <div className="w-20 h-20 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-inner">
                {station.custom_logo_url ? (
                  <img src={station.custom_logo_url} alt="Logo" className="w-full h-full object-contain p-2" />
                ) : (
                  <ImageIcon className="w-8 h-8 text-slate-300" />
                )}
              </div>

              {/* Station Info */}
              <div className="flex-1 w-full">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg text-slate-800">{station.name}</h3>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" /> {station.address}</p>
                  </div>
                  {station.verified && <span className="bg-blue-50 text-blue-600 border border-blue-200 text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Verified</span>}
                </div>

                <div className="flex items-center gap-4 mt-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">PMS Price</p>
                    <p className="font-black text-indigo-900">₦{station.price_pms || "---"}</p>
                  </div>
                  <div className="w-px h-8 bg-slate-200"></div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Queue</p>
                    <p className="font-bold text-slate-700 text-sm">{station.queue_status}</p>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button 
                onClick={() => {
                  setEditingStation(station);
                  setEditPrice(station.price_pms || "");
                  setEditQueue(station.queue_status || "Moderate");
                  setMessage({ type: "", text: "" });
                  setLogoFile(null);
                }}
                className="w-full md:w-auto bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Edit3 className="w-4 h-4" /> Manage
              </button>
            </div>
          ))}

          {stations.length === 0 && (
            <div className="col-span-full bg-white p-12 rounded-3xl border border-slate-200 text-center border-dashed">
              <Droplet className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-800">No Stations Found</h3>
              <p className="text-slate-500 mt-2 max-w-sm mx-auto">You haven't claimed any stations yet, or your claims are pending admin approval.</p>
            </div>
          )}
        </div>
      </main>

      {/* EDIT MODAL */}
      {editingStation && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl overflow-y-auto max-h-[90vh]">
            <h2 className="text-2xl font-black text-slate-800 mb-1">Edit Station</h2>
            <p className="text-sm text-slate-500 mb-6">{editingStation.name}</p>

            {message.text && (
              <div className={`p-3 rounded-lg text-sm font-bold mb-4 flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {message.text}
              </div>
            )}

            <div className="space-y-4">
              {/* Price & Queue */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Price (₦)</label>
                  <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-black text-lg outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Queue</label>
                  <select value={editQueue} onChange={e => setEditQueue(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 appearance-none">
                    <option value="No Queue">No Queue</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Heavy">Heavy Queue</option>
                    <option value="No Fuel">No Fuel</option>
                  </select>
                </div>
              </div>

              {/* Logo Override Upload */}
              <div className="pt-2">
                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2 mb-2">
                  <UploadCloud className="w-4 h-4" /> Override Map Logo
                </label>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:bg-slate-50 transition-colors">
                  <input 
                    type="file" 
                    accept="image/png, image/jpeg" 
                    onChange={e => setLogoFile(e.target.files ? e.target.files[0] : null)}
                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                  />
                  {logoFile && <p className="text-[10px] text-emerald-600 font-bold mt-2">Ready to upload: {logoFile.name}</p>}
                </div>
                <p className="text-[10px] text-slate-400 mt-2">Uploading a logo here will override the default map icon for this specific station branch.</p>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={() => setEditingStation(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-xl transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveStation} disabled={isSaving} className="flex-1 bg-indigo-900 hover:bg-indigo-800 text-white font-black py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}