import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/utils/supabase/server';

// =========================================================================
// ADMIN: APPROVE / REJECT A STATION CLAIM
// Runs as the signed-in user and calls the database function public.admin_review_claim,
// which re-checks that the caller is an admin (app_metadata.role = 'Admin', which users
// can't edit) and then — all-or-nothing — updates the claim, verifies the station, links
// it to the claimant and makes them a Manager.
//
// No service-role key is needed any more, and user_metadata.role is never trusted
// (any user can change their own user_metadata from the browser).
// See supabase/migrations/20261008_security_hardening.sql.
// =========================================================================
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { claimId, adminNotes, status } = await request.json();

    if (!claimId || (status !== 'Approved' && status !== 'Rejected')) {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
    }

    const { error } = await supabase.rpc('admin_review_claim', {
      p_claim_id: String(claimId),
      p_status: status,
      p_notes: adminNotes || null,
    });

    if (error) {
      const forbidden = error.code === '42501' || /not authori[sz]ed/i.test(error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: forbidden ? 403 : 500 });
    }

    return NextResponse.json({ success: true, message: `Claim ${status} successfully.` });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}