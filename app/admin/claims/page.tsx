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

  if (loading) return <div className="min-h-screen bg-canvas p-12 flex justify-center"><Loader2 className="animate-spin text-accent" aria-label="Loading" /></div>;

  return (
    <div className="min-h-screen bg-canvas text-fg font-sans">
    <div className="max-w-6xl mx-auto p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-fg">Pending station claims</h1>
          <p className="text-sm text-fg-muted mt-1">Check the CAC certificate, then approve or reject.</p>
        </div>
        <a 
          href="/admin" 
          className="inline-flex items-center h-10 px-4 text-sm font-medium text-fg bg-surface hover:bg-surface-2 border border-line-strong rounded-lg transition-colors"
        >
          ← Back to admin
        </a>
      </div>
      
      {claims.length === 0 ? (
        <p className="text-fg-muted">No pending claims to review.</p>
      ) : (
        <div className="grid gap-4">
          {claims.map((claim) => (
            <div key={claim.id} className="bg-surface border border-line rounded-xl p-6 flex flex-col md:flex-row justify-between gap-6">
              <div>
                <h2 className="text-lg font-semibold text-fg">{claim.station_name}</h2>
                <p className="text-sm text-fg-muted mb-4">Applicant: {claim.applicant_name} · Phone: {claim.phone_number}</p>
                <div className="flex flex-wrap gap-3">
                  <button 
                    type="button"
                    onClick={() => openDocument(claim.document_url)}
                    className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium text-fg bg-surface hover:bg-surface-2 border border-line-strong rounded-lg transition-colors"
                  >
                    <FileText className="w-4 h-4" aria-hidden /> View CAC certificate
                  </button>
                  <p className="inline-flex items-center text-sm h-10 px-4 bg-surface-2 border border-line rounded-lg text-fg-muted font-mono">
                    RC: {claim.business_reg_number}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 min-w-[200px]">
                <button 
                  onClick={() => handleReview(claim, 'Approved')}
                  className="flex items-center justify-center gap-2 h-11 bg-primary hover:bg-primary-hover text-on-primary text-sm font-semibold rounded-lg transition-colors"
                >
                  <CheckCircle className="w-4 h-4" aria-hidden /> Approve claim
                </button>
                <button 
                  onClick={() => handleReview(claim, 'Rejected')}
                  className="flex items-center justify-center gap-2 h-11 bg-danger-soft hover:brightness-95 text-on-danger-soft border border-danger-line text-sm font-semibold rounded-lg transition-colors"
                >
                  <XCircle className="w-4 h-4" aria-hidden /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}