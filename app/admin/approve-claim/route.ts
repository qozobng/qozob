import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use the SERVICE ROLE KEY for admin actions (Never expose this to the frontend)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { claimId, userId, stationId, adminNotes, status } = await request.json();

    // 1. Verify the request is coming from an actual Admin
    // (In production, extract the JWT token from headers and verify admin status here)

    // 2. Update the Claim Status
    const { error: claimError } = await supabaseAdmin
      .from('station_claims')
      .update({ 
        status: status, // 'Approved' or 'Rejected'
        admin_notes: adminNotes,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', claimId);

    if (claimError) throw claimError;

    // 3. If Approved, escalate the user's role and verify the station
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

      // TODO: Trigger Email Notification (e.g., using Resend API)
      // await sendEmail(userEmail, "Your Qozob Station Claim is Approved!");
    }

    return NextResponse.json({ success: true, message: `Claim ${status} successfully.` });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}