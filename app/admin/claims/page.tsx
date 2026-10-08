"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { signedCacUrl } from '@/lib/roles';
import { CheckCircle, XCircle, FileText, Loader2 } from 'lucide-react';

export default function AdminClaimsDashboard() {
  const supabase = createClient();
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClaims();
  }, []);

  const fetchClaims = async () => {
    const { data, error } = await supabase
      .from('station_claims')
      .select('*')
      .eq('status', 'Pending Review')
      .order('created_at', { ascending: false });
    
    if (data) setClaims(data);
    setLoading(false);
  };

  const handleReview = async (claim: any, status: 'Approved' | 'Rejected') => {
    const notes = prompt(`Enter reason for ${status} (Optional):`, "");
    if (notes === null) return; // User cancelled prompt

    setLoading(true);
    try {
      // Route lives at app/admin/approve-claim/route.ts → URL is /admin/approve-claim
      const res = await fetch('/admin/approve-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimId: claim.id,
          userId: claim.user_id,
          stationId: claim.station_id,
          adminNotes: notes,
          status: status
        })
      });

      const result = await res.json();
      if (res.status === 401 || res.status === 403) throw new Error("You are not authorised as an admin. Admin access is granted in the Supabase database.");
      if (!result.success) throw new Error(result.error);
      
      alert(`Claim successfully ${status}!`);
      fetchClaims(); // Refresh list
    } catch (err: any) {
      alert("Error: " + err.message);
      setLoading(false);
    }
  };

  // CAC documents are private: open them through a short-lived signed link
  const openDocument = async (ref: string | null | undefined) => {
    if (!ref) return;
    const win = window.open('', '_blank');
    const url = await signedCacUrl(supabase, ref);
    if (url && win) {
      win.opener = null;
      win.location.href = url;
    } else {
      win?.close();
      alert("Could not open this document.");
    }
  };

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="max-w-6xl mx-auto p-8 font-sans">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-black text-indigo-950">Pending Station Claims</h1>
        <a 
          href="/admin" 
          className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3.5 py-2 rounded-xl transition-colors"
        >
          ← Full Admin Command Center
        </a>
      </div>
      
      {claims.length === 0 ? (
        <p className="text-slate-500">No pending claims to review.</p>
      ) : (
        <div className="grid gap-6">
          {claims.map((claim) => (
            <div key={claim.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between gap-6">
              <div>
                <h2 className="text-xl font-bold text-indigo-900">{claim.station_name}</h2>
                <p className="text-sm text-slate-500 mb-4">Applicant: {claim.applicant_name} | Phone: {claim.phone_number}</p>
                <div className="flex gap-4">
                  <button 
                    type="button"
                    onClick={() => openDocument(claim.document_url)}
                    className="flex items-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-lg hover:bg-indigo-100"
                  >
                    <FileText className="w-4 h-4" /> View CAC Document
                  </button>
                  <p className="text-sm px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600">
                    RC: {claim.business_reg_number}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 min-w-[200px]">
                <button 
                  onClick={() => handleReview(claim, 'Approved')}
                  className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl transition-colors"
                >
                  <CheckCircle className="w-4 h-4" /> Approve & Escalate Role
                </button>
                <button 
                  onClick={() => handleReview(claim, 'Rejected')}
                  className="flex items-center justify-center gap-2 bg-red-100 hover:bg-red-200 text-red-700 font-bold py-3 rounded-xl transition-colors"
                >
                  <XCircle className="w-4 h-4" /> Reject Claim
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}