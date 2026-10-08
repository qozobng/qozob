import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { landingPathFor } from '@/lib/roles';

// =========================================================================
// AUTH CALLBACK (Google sign-in + default email-confirmation links)
// Exchanges the one-time code for a session cookie, then routes the person:
//   • brand-new accounts (first Google sign-in, or confirming their email) → /welcome
//   • everyone else → ?next (where they were) or their home (admins: /admin, others: the map)
//
// Make sure  https://www.qozob.com/**  (and http://localhost:3000/** for dev) are listed under
// Supabase → Authentication → URL Configuration → Redirect URLs.
// =========================================================================
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirectTarget = searchParams.get('redirect');
  const stationId = searchParams.get('stationId');
  const flow = searchParams.get('flow');            // 'signup' when coming from a confirmation email
  const next = searchParams.get('next');
  const linkError = searchParams.get('error_code') || searchParams.get('error');

  // Expired / already-used confirmation links come back with an error instead of a code
  if (!code && linkError) {
    return NextResponse.redirect(`${origin}/welcome?error=${encodeURIComponent(linkError)}`);
  }

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Legacy targets kept for old links (trusted app_metadata role decides admin access)
      let path = landingPathFor(data.user, next);
      if (redirectTarget === 'claim' && stationId && stationId !== 'null' && stationId !== 'undefined') {
        path = `/?select=${encodeURIComponent(stationId)}`;
      } else if (redirectTarget === 'admin') {
        path = '/admin';
      } else if (redirectTarget === 'rewards') {
        path = '/user-dashboard?tab=rewards';
      }

      const created = Date.parse(data.user.created_at || '');
      const lastSignIn = Date.parse(data.user.last_sign_in_at || '');
      const firstSignIn = Number.isFinite(created) && Number.isFinite(lastSignIn) && Math.abs(lastSignIn - created) < 120_000;
      const confirmedAt = Date.parse(data.user.email_confirmed_at || '');
      const confirmedJustNow = Number.isFinite(confirmedAt) && Date.now() - confirmedAt < 120_000;
      if (flow === 'signup' || firstSignIn || confirmedJustNow) {
        return NextResponse.redirect(`${origin}/welcome?next=${encodeURIComponent(path)}`);
      }
      return NextResponse.redirect(`${origin}${path}`);
    }

    console.error('Auth code exchange failed:', error?.message);
    // A confirmation link opened in a different browser can't create a session here, but the email
    // IS confirmed by then, so ask the person to sign in once instead of showing an error.
    if (flow) {
      return NextResponse.redirect(`${origin}/welcome?status=signin${next ? `&next=${encodeURIComponent(next)}` : ''}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Sign-in did not complete. Please try again.')}`);
}
