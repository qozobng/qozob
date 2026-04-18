"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
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
      const res = await fetch('/api/admin/approve-claim', {
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
      if (!result.success) throw new Error(result.error);
      
      alert(`Claim successfully ${status}!`);
      fetchClaims(); // Refresh list
    } catch (err: any) {
      alert("Error: " + err.message);
      setLoading(false);
    }
  };

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="max-w-6xl mx-auto p-8 font-sans">
      <h1 className="text-3xl font-black text-indigo-950 mb-8">Admin: Pending Station Claims</h1>
      
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
                  <a 
                    href={claim.document_url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-lg hover:bg-indigo-100"
                  >
                    <FileText className="w-4 h-4" /> View CAC Document
                  </a>
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