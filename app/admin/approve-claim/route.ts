import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    // MOVE INITIALIZATION INSIDE THE HANDLER
    // This prevents Vercel from crashing during the static build phase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase Admin credentials in environment variables.");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { claimId, userId, stationId, adminNotes, status } = await request.json();

    // 1. Update the Claim Status
    const { error: claimError } = await supabaseAdmin
      .from('station_claims')
      .update({ 
        status: status, // 'Approved' or 'Rejected'
        admin_notes: adminNotes,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', claimId);

    if (claimError) throw claimError;

    // 2. If Approved, escalate the user's role and verify the station
    if (status === 'Approved') {
      // Escalate User Role
      const { error: userError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { user_metadata: { role: 'Station Owner' } }
      );
      if (userError) throw userError;

      // Mark Station as Verified
      const { error: stationError } = await supabaseAdmin
        .from('stations')
        .update({ verified: true, claim_status: 'Claimed' })
        .eq('station_id', stationId);
      if (stationError) throw stationError;
    }

    return NextResponse.json({ success: true, message: `Claim ${status} successfully.` });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}