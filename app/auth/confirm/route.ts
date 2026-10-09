import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { safeNext } from '@/lib/roles';

// =========================================================================
// EMAIL CONFIRMATION LINK (token-hash flow)
// The Qozob "Confirm your account" email links here:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&redirect_to={{ .RedirectTo }}
// (template: supabase/email-templates/confirm-signup.html)
// Unlike the default link, this works even when the email is opened on a different
// phone or browser from the one used to sign up. On success the person is signed in
// and sent to the /welcome page, which counts down and takes them to the map.
// =========================================================================
const WELCOME_TYPES: EmailOtpType[] = ['signup', 'email', 'invite', 'magiclink'];

/** The template passes {{ .RedirectTo }} (our /auth/callback?flow=signup&next=...) - pull out `next`. */
function nextFromRedirect(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).searchParams.get('next');
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNext(searchParams.get('next') || nextFromRedirect(searchParams.get('redirect_to')));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      // Password reset → choose a new password. Admin invitation → set a password, then the admin panel.
      if (type === 'recovery') return NextResponse.redirect(`${origin}/reset-password`);
      if (type === 'invite') {
        return NextResponse.redirect(`${origin}/reset-password?mode=invite&next=${encodeURIComponent(next === '/' ? '/admin' : next)}`);
      }
      const dest = WELCOME_TYPES.includes(type) ? `/welcome?next=${encodeURIComponent(next)}` : next;
      return NextResponse.redirect(`${origin}${dest}`);
    }
    console.error('Email confirmation failed:', error.message);
    if (type === 'recovery' || type === 'invite') {
      return NextResponse.redirect(`${origin}/reset-password${type === 'invite' ? '?mode=invite' : ''}`);
    }
    return NextResponse.redirect(`${origin}/welcome?error=${encodeURIComponent(error.code || 'otp_expired')}`);
  }

  return NextResponse.redirect(`${origin}/welcome?error=invalid_link`);
}
