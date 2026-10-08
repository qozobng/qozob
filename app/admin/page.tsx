"use client";
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { 
  ShieldCheck, Lock, FileText, CheckCircle, XCircle, LogOut, Clock, ExternalLink, RefreshCw, MapPin, UserPlus, Loader2
} from 'lucide-react';

// FIXED: Using your new secure utility instead of the raw library
import { createClient } from '@/utils/supabase/client';
import { getRole, signedCacUrl } from '@/lib/roles';

// --- Supabase Setup ---
const supabase = createClient();

// =========================================================================
// SECURITY: The old hard-coded master passcode shipped inside the website's JavaScript,
// so anyone could read it. Admins now sign in with their normal Qozob account, and the
// DATABASE decides who is an admin (public.is_admin()). Approve/Reject run through
// admin-only database functions, so even a tampered browser can't approve anything.
// =========================================================================

type AuthState = 'checking' | 'signed-out' | 'not-admin' | 'admin';

export default function AdminDashboard() {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [adminEmail, setAdminEmail] = useState("");
  
  // FIXED: Explicitly typed the claims array
  const [claims, setClaims] = useState<any[]>([]);
  const [roleRequests, setRoleRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);

  // --- Fetch Claims & Smart Merge with Station Addresses ---
  const fetchClaims = useCallback(async () => {
    setIsLoading(true);
    
    // 1. Fetch all claims (+ Manager access requests) — RLS only returns these to admins
    const [{ data: claimsData, error: claimsError }, { data: requestsData, error: requestsError }] = await Promise.all([
      supabase.from('station_claims').select('*').order('created_at', { ascending: false }),
      supabase.from('role_requests').select('*').order('created_at', { ascending: false }),
    ]);

    if (claimsError) {
      console.error("Error fetching claims:", claimsError.message);
      alert("Failed to load claims.");
      setIsLoading(false);
      return;
    }
    if (requestsError) {
      console.warn("Could not load Manager access requests:", requestsError.message);
    }
    setRoleRequests(requestsData || []);

    // 2. Fetch stations for the physical address text (only the ones referenced by claims)
    const claimStationIds = Array.from(new Set((claimsData || []).map(c => c.station_id).filter(Boolean)));
    const { data: stationsData, error: stationsError } = claimStationIds.length > 0
      ? await supabase.from('stations').select('station_id, address').in('station_id', claimStationIds)
      : { data: [], error: null };

    if (stationsError) {
      console.warn("Could not fetch stations for address matching:", stationsError.message);
    }

    // 3. Merge the address text back into the claims data for the UI
    const addressById = new Map((stationsData || []).map(s => [s.station_id, s.address]));
    const mergedClaims = (claimsData || []).map(claim => {
      return {
        ...claim,
        address: addressById.get(claim.station_id) || "Address unavailable"
      };
    });

    setClaims(mergedClaims);
    setIsLoading(false);
  }, []);

  // --- Auth: signed in + confirmed admin by the database ---
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setAuthState('signed-out');
      setAdminEmail(user.email || "");

      const { data: isAdmin, error } = await supabase.rpc('is_admin');
      if (error) console.warn("Admin check failed:", error.message);
      // Fall back to the (server-set) app_metadata role only for display if the RPC isn't deployed yet;
      // the database still refuses every admin action for non-admins.
      if (isAdmin === true || (error && getRole(user) === 'Admin')) {
        setAuthState('admin');
        fetchClaims();
      } else {
        setAuthState('not-admin');
      }
    })();
  }, [fetchClaims]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setClaims([]);
    setRoleRequests([]);
    setAuthState('signed-out');
  };

  // CAC documents are private now: open them through a short-lived signed link
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
      alert("Could not open this document. It may have been removed.");
    }
  };

  // --- Action Handlers (Approve/Reject) ---
  const handleApprove = async (claim: any) => {
    const confirmApprove = window.confirm(`Are you sure you want to approve ${claim.applicant_name} for ${claim.station_name}?`);
    if (!confirmApprove) return;

    setIsProcessing(true);
    
    // Approves the claim, verifies the station, links it to the claimant and makes them a Manager —
    // all in one admin-only database function (all-or-nothing).
    const { error } = await supabase.rpc('admin_review_claim', {
      p_claim_id: String(claim.id),
      p_status: 'Approved',
      p_notes: null,
    });

    if (error) {
      alert("Error approving claim: " + error.message);
    } else {
      alert("Station successfully claimed and verified!");
      fetchClaims(); 
    }
    setIsProcessing(false);
  };

  const handleReject = async (claim: any) => {
    const confirmReject = window.confirm(`Are you sure you want to REJECT this claim?`);
    if (!confirmReject) return;

    setIsProcessing(true);
    const { error } = await supabase.rpc('admin_review_claim', {
      p_claim_id: String(claim.id),
      p_status: 'Rejected',
      p_notes: null,
    });

    if (error) {
      alert("Error rejecting claim: " + error.message);
    } else {
      alert("Claim rejected.");
      fetchClaims();
    }
    setIsProcessing(false);
  };

  const handleReviewRequest = async (request: any, status: 'Approved' | 'Rejected') => {
    const who = request.full_name || request.email || 'this user';
    const notes = window.prompt(
      status === 'Approved'
        ? `Approve Manager access for ${who}? Optional note:`
        : `Reject Manager access for ${who}? Optional reason:`,
      ""
    );
    if (notes === null) return; // cancelled

    setIsProcessing(true);
    const { error } = await supabase.rpc('admin_review_role_request', {
      p_request_id: request.id,
      p_status: status,
      p_notes: notes || null,
    });
    if (error) {
      alert("Error: " + error.message);
    } else {
      alert(status === 'Approved' ? "Manager access approved." : "Request rejected.");
      fetchClaims();
    }
    setIsProcessing(false);
  };

  // =========================================================================
  // UI: LOGIN / ACCESS SCREENS
  // =========================================================================
  if (authState !== 'admin') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full border border-slate-100">
          <div className="w-16 h-16 bg-indigo-900 rounded-full flex items-center justify-center mb-6 mx-auto shadow-inner">
            {authState === 'checking'
              ? <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
              : <Lock className="w-8 h-8 text-emerald-400" />}
          </div>
          <h1 className="text-2xl font-black text-center text-indigo-950 mb-2">Admin Portal</h1>

          {authState === 'checking' && (
            <p className="text-center text-slate-500 text-sm">Checking your access...</p>
          )}

          {authState === 'signed-out' && (
            <>
              <p className="text-center text-slate-500 text-sm mb-6">Sign in with your Qozob admin account to view station claims.</p>
              <Link href="/login?redirect=admin" className="block w-full text-center bg-indigo-900 hover:bg-indigo-800 text-white font-black py-4 rounded-xl transition-all shadow-md hover:shadow-lg">
                Sign in
              </Link>
            </>
          )}

          {authState === 'not-admin' && (
            <>
              <p className="text-center text-slate-500 text-sm mb-2">
                <strong className="text-slate-700">{adminEmail}</strong> is not an admin account.
              </p>
              <p className="text-center text-slate-400 text-xs mb-6">Admin access is granted from the Supabase database, not from the app.</p>
              <div className="flex flex-col gap-2">
                <button onClick={handleLogout} className="w-full bg-indigo-900 hover:bg-indigo-800 text-white font-black py-3 rounded-xl transition-all">
                  Sign in with a different account
                </button>
                <Link href="/" className="w-full text-center text-sm font-bold text-slate-500 hover:text-indigo-700 py-2">Back to map</Link>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // UI: ADMIN DASHBOARD
  // =========================================================================
  const pendingClaims = claims.filter(c => c.status === 'Pending Review');
  const pastClaims = claims.filter(c => c.status !== 'Pending Review');
  const pendingRequests = roleRequests.filter(r => r.status === 'Pending');

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
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs font-bold text-indigo-300 truncate max-w-[200px]">{adminEmail}</span>
            <button onClick={handleLogout} className="flex items-center gap-2 text-indigo-200 hover:text-white transition-colors text-sm font-bold bg-white/10 px-4 py-2 rounded-full">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 mt-6 flex flex-col gap-8">
        
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-black text-indigo-950 mb-1">Station Claims</h2>
            <p className="text-slate-500 text-sm">Review CAC documents and approve local managers.</p>
          </div>
          <button onClick={fetchClaims} disabled={isLoading} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

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
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <button 
                        type="button"
                        onClick={() => openDocument(`claim-${claim.id}`, claim.document_url)}
                        disabled={!claim.document_url || openingDocId === `claim-${claim.id}`}
                        className="flex items-center justify-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold py-2.5 rounded-xl transition-colors border border-indigo-200 text-xs shadow-sm disabled:opacity-50"
                      >
                        {openingDocId === `claim-${claim.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} CAC Doc <ExternalLink className="w-3 h-3 opacity-50"/>
                      </button>

                      <a 
                        href={claim.lat && claim.lng 
                          ? `https://www.google.com/maps/search/?api=1&query=${claim.lat},${claim.lng}` 
                          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(claim.station_name)}`}
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

        {/* MANAGER ACCESS REQUESTS (replaces the old self-serve "switch to Manager") */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="w-5 h-5 text-indigo-500" />
            <h3 className="text-xl font-black text-slate-800">Manager Access Requests ({pendingRequests.length})</h3>
          </div>

          {isLoading ? null : pendingRequests.length === 0 ? (
            <div className="bg-white rounded-3xl p-6 text-center border border-slate-100 shadow-sm">
              <p className="text-slate-500 font-bold text-sm">No pending Manager access requests.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pendingRequests.map(req => (
                <div key={req.id} className="bg-white rounded-3xl p-6 shadow-sm border border-indigo-200 relative overflow-hidden flex flex-col h-full">
                  <div className="absolute top-0 right-0 bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase px-3 py-1 rounded-bl-xl tracking-widest">Manager Request</div>
                  <h4 className="font-black text-indigo-950 text-lg pr-24 leading-tight mb-1">{req.full_name || req.email || 'Unnamed user'}</h4>
                  <p className="text-xs font-bold text-slate-500 mb-1 truncate">{req.email}</p>
                  <p className="text-[10px] text-slate-400 mb-4 flex items-center gap-1"><Clock className="w-3 h-3"/> Requested {new Date(req.created_at).toLocaleDateString()}</p>

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mb-4 flex-1 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Company</p>
                      <p className="font-bold text-slate-800">{req.company_name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Phone</p>
                      <p className="font-bold text-slate-800">{req.phone || '—'}</p>
                    </div>
                    {req.note && (
                      <div className="col-span-2 pt-2 border-t border-slate-200">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Note</p>
                        <p className="text-slate-700 text-xs">{req.note}</p>
                      </div>
                    )}
                  </div>

                  {req.document_url && (
                    <button
                      type="button"
                      onClick={() => openDocument(`req-${req.id}`, req.document_url)}
                      disabled={openingDocId === `req-${req.id}`}
                      className="flex items-center justify-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold py-2.5 rounded-xl transition-colors border border-indigo-200 text-xs shadow-sm mb-2 disabled:opacity-50"
                    >
                      {openingDocId === `req-${req.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} CAC Doc <ExternalLink className="w-3 h-3 opacity-50"/>
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-2 mt-auto">
                    <button onClick={() => handleReviewRequest(req, 'Approved')} disabled={isProcessing} className="flex items-center justify-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white font-black py-3 rounded-xl transition-colors disabled:opacity-50 text-sm">
                      <CheckCircle className="w-4 h-4" /> Approve
                    </button>
                    <button onClick={() => handleReviewRequest(req, 'Rejected')} disabled={isProcessing} className="flex items-center justify-center gap-1 bg-red-50 hover:bg-red-100 text-red-700 font-bold py-3 rounded-xl transition-colors disabled:opacity-50 text-sm border border-red-200">
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

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