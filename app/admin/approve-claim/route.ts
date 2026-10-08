import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerSupabase } from '@/utils/supabase/server';

// =========================================================================
// ADMIN AUTHORISATION
// This route uses the SERVICE ROLE key (bypasses Row Level Security), so it must
// only ever run for verified admins. Previously it had no auth check at all.
//
// An admin is a logged-in user who EITHER:
//   1. has app_metadata.role === 'admin' (set via Supabase dashboard/SQL — users can't edit app_metadata), OR
//   2. has an email listed in the ADMIN_EMAILS env var (comma-separated).
//
// NOTE: user_metadata.role is deliberately NOT trusted here, because any user can change
// their own user_metadata from the browser (supabase.auth.updateUser).
// =========================================================================
async function getAdminUser() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  const isAdmin =
    String(user.app_metadata?.role || '').toLowerCase() === 'admin' ||
    (!!user.email && adminEmails.includes(user.email.toLowerCase()));

  return isAdmin ? user : null;
}

export async function POST(request: Request) {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    // MOVE INITIALIZATION INSIDE THE HANDLER
    // This prevents Vercel from crashing during the static build phase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase Admin credentials in environment variables.");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { claimId, userId, stationId, adminNotes, status } = await request.json();

    if (!claimId || (status !== 'Approved' && status !== 'Rejected')) {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
    }
    if (status === 'Approved' && (!userId || !stationId)) {
      return NextResponse.json({ success: false, error: 'Missing userId or stationId' }, { status: 400 });
    }

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
      // Escalate User Role.
      // Uses 'Manager' (not 'Station Owner') because that's the role the dashboard, login routing
      // and claim buttons check for. Existing metadata is preserved, and Admins are never downgraded.
      const { data: existing } = await supabaseAdmin.auth.admin.getUserById(userId);
      const currentMeta = existing?.user?.user_metadata || {};
      const { error: userError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { user_metadata: { ...currentMeta, role: currentMeta.role === 'Admin' ? 'Admin' : 'Manager' } }
      );
      if (userError) throw userError;

      // Mark Station as Verified and link it to the manager so it shows up in their dashboard
      // (the dashboard loads stations by manager_id).
      const { error: stationError } = await supabaseAdmin
        .from('stations')
        .update({ verified: true, claim_status: 'Claimed', manager_id: userId })
        .eq('station_id', stationId);
      if (stationError) throw stationError;
    }

    return NextResponse.json({ success: true, message: `Claim ${status} successfully.` });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}