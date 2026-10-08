import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { homePathFor } from '@/lib/roles';

// =========================================================================
// OAUTH CALLBACK (Google sign-in)
// The login page sends Google OAuth back to /auth/callback, but this route didn't exist,
// so Google sign-in ended on a 404. This exchanges the one-time code for a session cookie
// and routes the user exactly like the email/password login does.
//
// Make sure  https://www.qozob.com/auth/callback  (and http://localhost:3000/auth/callback for dev)
// are listed under Supabase → Authentication → URL Configuration → Redirect URLs.
// =========================================================================
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirectTarget = searchParams.get('redirect');
  const stationId = searchParams.get('stationId');

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Same routing rules as LoginContent.routeUser in app/login/page.tsx
      // (trusted app_metadata role — user_metadata is user-editable and never trusted)
      let path = homePathFor(data.user);
      if (redirectTarget === 'claim' && stationId && stationId !== 'null' && stationId !== 'undefined') {
        path = `/?select=${encodeURIComponent(stationId)}`;
      } else if (redirectTarget === 'admin') {
        path = '/admin';
      } else if (redirectTarget === 'rewards') {
        path = '/user-dashboard?tab=rewards';
      }
      return NextResponse.redirect(`${origin}${path}`);
    }

    console.error('OAuth code exchange failed:', error?.message);
  }

  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Google sign-in failed. Please try again.')}`);
}

