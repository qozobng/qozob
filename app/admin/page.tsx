"use client";
import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, Lock, FileText, CheckCircle, XCircle, LogOut, Clock, ExternalLink, RefreshCw, MapPin
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// --- Supabase Setup ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- Prototype Master Password ---
const ADMIN_PASSCODE = "qozob-admin-2026";

export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [loginError, setLoginError] = useState("");
  
  const [claims, setClaims] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // --- Auth Handlers ---
  const handleLogin = (e) => {
    e.preventDefault();
    if (passcode === ADMIN_PASSCODE) {
      setIsAuthenticated(true);
      setLoginError("");
      fetchClaims();
    } else {
      setLoginError("Incorrect Master Passcode");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPasscode("");
    setClaims([]);
  };

  // --- Fetch Claims & Smart Merge with Station Addresses ---
  const fetchClaims = async () => {
    setIsLoading(true);
    
    // 1. Fetch all claims
    const { data: claimsData, error: claimsError } = await supabase
      .from('station_claims')
      .select('*')
      .order('created_at', { ascending: false });

    if (claimsError) {
      console.error("Error fetching claims:", claimsError.message);
      alert("Failed to load claims. Check console for details.");
      setIsLoading(false);
      return;
    }

    // 2. Fetch all stations to grab their coordinates and addresses
    const { data: stationsData, error: stationsError } = await supabase
      .from('stations')
      .select('station_id, address, lat, lng');

    if (stationsError) {
      console.warn("Could not fetch stations for address matching:", stationsError.message);
    }

    // 3. Merge the address and map coordinates into the claims data
    const mergedClaims = (claimsData || []).map(claim => {
      const matchedStation = (stationsData || []).find(s => s.station_id === claim.station_id);
      return {
        ...claim,
        address: matchedStation?.address || "Address unavailable",
        lat: matchedStation?.lat,
        lng: matchedStation?.lng
      };
    });

    setClaims(mergedClaims);
    setIsLoading(false);
  };

  // --- Action Handlers (Approve/Reject) ---
  const handleApprove = async (claim) => {
    const confirmApprove = window.confirm(`Are you sure you want to approve ${claim.applicant_name} for ${claim.station_name}?`);
    if (!confirmApprove) return;

    setIsProcessing(true);
    
    // 1. Update the claim status
    const { error: claimError } = await supabase
      .from('station_claims')
      .update({ status: 'Approved' })
      .eq('id', claim.id);

    if (claimError) {
      alert("Error updating claim: " + claimError.message);
      setIsProcessing(false);
      return;
    }

    // 2. Give the station official 'Owner' status and Verify it
    const { error: stationError } = await supabase
      .from('stations')
      .update({ verified: true, updated_by_role: 'Owner' })
      .eq('station_id', claim.station_id);

    if (stationError) {
      alert("Error updating station verification: " + stationError.message);
    } else {
      alert("Station successfully claimed and verified!");
      fetchClaims(); // Refresh list
    }
    setIsProcessing(false);
  };

  const handleReject = async (claim) => {
    const confirmReject = window.confirm(`Are you sure you want to REJECT this claim?`);
    if (!confirmReject) return;

    setIsProcessing(true);
    const { error } = await supabase
      .from('station_claims')
      .update({ status: 'Rejected' })
      .eq('id', claim.id);

    if (error) {
      alert("Error rejecting claim: " + error.message);
    } else {
      alert("Claim rejected.");
      fetchClaims(); // Refresh list
    }
    setIsProcessing(false);
  };

  // =========================================================================
  // UI: LOGIN SCREEN
  // =========================================================================
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full border border-slate-100">
          <div className="w-16 h-16 bg-indigo-900 rounded-full flex items-center justify-center mb-6 mx-auto shadow-inner">
            <Lock className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-black text-center text-indigo-950 mb-2">Admin Portal</h1>
          <p className="text-center text-slate-500 text-sm mb-6">Enter master passcode to view station claims.</p>
          
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <input 
                type="password" 
                value={passcode} 
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter Passcode..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-center font-bold outline-none focus:border-indigo-500 transition-colors"
                autoFocus
              />
              {loginError && <p className="text-red-500 text-xs font-bold mt-2 text-center">{loginError}</p>}
            </div>
            <button type="submit" className="w-full bg-indigo-900 hover:bg-indigo-800 text-white font-black py-4 rounded-xl transition-all shadow-md hover:shadow-lg">
              Unlock Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  // =========================================================================
  // UI: ADMIN DASHBOARD
  // =========================================================================
  const pendingClaims = claims.filter(c => c.status === 'Pending Review');
  const pastClaims = claims.filter(c => c.status !== 'Pending Review');

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-10">
      {/* Top Navbar */}
      <nav className="bg-indigo-900 text-white p-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
            <div>
              <h1 className="text-xl font-black tracking-tighter text-white leading-none">Qozob Admin.</h1>
              <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest">Verification Headquarters</span>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-indigo-200 hover:text-white transition-colors text-sm font-bold bg-white/10 px-4 py-2 rounded-full">
            <LogOut className="w-4 h-4" /> Lock
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 mt-6 flex flex-col gap-8">
        
        {/* Header Stats */}
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-black text-indigo-950 mb-1">Station Claims</h2>
            <p className="text-slate-500 text-sm">Review CAC documents and approve local managers.</p>
          </div>
          <button onClick={fetchClaims} disabled={isLoading} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* Pending Claims Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-amber-500" />
            <h3 className="text-xl font-black text-slate-800">Requires Action ({pendingClaims.length})</h3>
          </div>

          {isLoading ? (
             <div className="p-10 text-center text-slate-400 font-bold animate-pulse">Loading secure database...</div>
          ) : pendingClaims.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center border border-slate-100 shadow-sm">
              <ShieldCheck className="w-12 h-12 text-emerald-200 mx-auto mb-3" />
              <p className="text-slate-500 font-bold">You are all caught up! No pending claims.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pendingClaims.map(claim => (
                <div key={claim.id} className="bg-white rounded-3xl p-6 shadow-sm border border-amber-200 relative overflow-hidden flex flex-col h-full">
                  <div className="absolute top-0 right-0 bg-amber-100 text-amber-800 text-[10px] font-black uppercase px-3 py-1 rounded-bl-xl tracking-widest">Pending Review</div>
                  
                  <h4 className="font-black text-indigo-950 text-xl pr-20 leading-tight mb-1">{claim.station_name}</h4>
                  
                  {/* Address display */}
                  <p className="text-xs font-bold text-slate-500 mb-2 leading-snug pr-8">
                    {claim.address}
                  </p>
                  
                  <p className="text-[10px] text-slate-400 mb-5 flex items-center gap-1"><Clock className="w-3 h-3"/> Claimed {new Date(claim.created_at).toLocaleDateString()}</p>
                  
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mb-6 flex-1">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Applicant</p>
                        <p className="font-bold text-slate-800">{claim.applicant_name}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Phone</p>
                        <p className="font-bold text-slate-800">{claim.phone_number}</p>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-slate-200">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">CAC Reg Number</p>
                        <p className="font-bold text-slate-800 font-mono text-lg">{claim.business_reg_number}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 mt-auto">
                    
                    {/* --- FIXED: Exact Google Maps Link Engine --- */}
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <a 
                        href={claim.document_url || "#"} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className={`flex items-center justify-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold py-2.5 rounded-xl transition-colors border border-indigo-200 text-xs shadow-sm ${!claim.document_url ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        <FileText className="w-4 h-4" /> CAC Doc <ExternalLink className="w-3 h-3 opacity-50"/>
                      </a>

                      <a 
                        href={claim.lat && claim.lng 
                          ? `https://www.google.com/maps/search/?api=1&query=${claim.lat},${claim.lng}&query_place_id=${claim.station_id}` 
                          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(claim.station_name + ' ' + (claim.address || ''))}`}
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="flex items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-xl transition-colors border border-slate-200 text-xs shadow-sm"
                      >
                        <MapPin className="w-4 h-4 text-emerald-600" /> View Map <ExternalLink className="w-3 h-3 opacity-50"/>
                      </a>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => handleApprove(claim)} disabled={isProcessing} className="flex items-center justify-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white font-black py-3 rounded-xl transition-colors disabled:opacity-50 text-sm">
                        <CheckCircle className="w-4 h-4" /> Approve
                      </button>
                      <button onClick={() => handleReject(claim)} disabled={isProcessing} className="flex items-center justify-center gap-1 bg-red-50 hover:bg-red-100 text-red-700 font-bold py-3 rounded-xl transition-colors disabled:opacity-50 text-sm border border-red-200">
                        <XCircle className="w-4 h-4" /> Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* History Section */}
        {pastClaims.length > 0 && (
          <section className="mt-8">
             <div className="flex items-center gap-2 mb-4 opacity-50">
               <h3 className="text-lg font-black text-slate-800">Past History</h3>
             </div>
             <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm">
                   <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                     <tr>
                       <th className="px-6 py-4">Station</th>
                       <th className="px-6 py-4">Applicant</th>
                       <th className="px-6 py-4">Date</th>
                       <th className="px-6 py-4 text-right">Status</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     {pastClaims.map(claim => (
                       <tr key={claim.id} className="hover:bg-slate-50 transition-colors">
                         <td className="px-6 py-4 font-bold text-slate-800">{claim.station_name}</td>
                         <td className="px-6 py-4 text-slate-600">{claim.applicant_name} <span className="text-slate-400 text-xs ml-2">({claim.business_reg_number})</span></td>
                         <td className="px-6 py-4 text-slate-500 text-xs">{new Date(claim.created_at).toLocaleDateString()}</td>
                         <td className="px-6 py-4 text-right">
                           <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                             claim.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
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
          </section>
        )}

      </main>
    </div>
  );
}