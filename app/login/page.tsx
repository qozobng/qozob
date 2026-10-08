"use client";

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Loader2, Lock, Mail, ArrowRight, Eye, EyeOff, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { homePathFor } from '@/lib/roles';
import { AuthShell, GoogleGlyph } from '@/components/AuthShell';
import { ui, cx } from '@/lib/ui';

// =========================================================================
// 1. LOGIN CONTENT (Extracted to allow Suspense wrapping)
// =========================================================================
function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(() => searchParams.get('error') || "");

  const redirectTarget = searchParams.get('redirect');
  const stationId = searchParams.get('stationId');

  const routeUser = (user: User) => {
    // If they came from clicking "Claim" on the map, send them back to the map with auto-select
    if (redirectTarget === 'claim' && stationId) {
      router.push(`/?select=${stationId}`);
    } else if (redirectTarget === 'admin') {
      router.push('/admin');
    } else {
      // Admin → /admin, Manager (or awaiting approval) → /dashboard, everyone else → /user-dashboard.
      // Uses the trusted app_metadata role, not the user-editable user_metadata.
      router.push(homePathFor(user));
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      routeUser(data.user);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setErrorMsg("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback${redirectTarget ? `?redirect=${redirectTarget}&stationId=${stationId}` : ''}`
      }
    });
    if (error) {
      setErrorMsg(error.message);
      setGoogleLoading(false);
    }
  };

  return (
    <AuthShell title="Welcome back 👋" subtitle="Sign in to drop prices, rate stations and keep your saved spots.">
      {errorMsg && (
        <div role="alert" className={cx(ui.alertError, 'mb-6')}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* OAUTH GOOGLE BUTTON */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={googleLoading || loading}
        className={cx(ui.btn, ui.btnLg, ui.btnSecondary, 'w-full gap-3 shadow-sm')}
      >
        {googleLoading ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : <GoogleGlyph />}
        Continue with Google
      </button>
      <p className="mt-3 text-center text-xs text-fg-subtle">
        By continuing, you agree to our{' '}
        <Link href="/terms" className="font-medium text-fg-muted underline underline-offset-2 hover:text-fg">Terms</Link> and{' '}
        <Link href="/privacy" className="font-medium text-fg-muted underline underline-offset-2 hover:text-fg">Privacy Policy</Link>.
      </p>

      <div className="flex items-center gap-4 my-7" aria-hidden>
        <div className="h-px bg-line flex-1" />
        <span className="text-xs font-medium text-fg-subtle">or sign in with email</span>
        <div className="h-px bg-line flex-1" />
      </div>

      <form onSubmit={handleLogin} className="space-y-5" noValidate={false}>
        <div>
          <label htmlFor="email" className={ui.label}>Email address</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle pointer-events-none" aria-hidden />
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cx(ui.input, ui.inputWithIcon)}
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className={ui.label}>Password</label>
          </div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle pointer-events-none" aria-hidden />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={cx(ui.input, ui.inputWithIcon, 'pr-11')}
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        </div>

        <button type="submit" disabled={loading || googleLoading} className={cx(ui.btn, ui.btnLg, ui.btnPrimary, 'w-full mt-2')}>
          {loading ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : 'Sign in'}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-fg-muted">
        New to Qozob?{' '}
        <Link href="/signup" className={cx(ui.link, 'inline-flex items-center gap-1')}>
          Create an account <ArrowRight className="w-3.5 h-3.5" aria-hidden />
        </Link>
      </p>
    </AuthShell>
  );
}

// =========================================================================
// 2. MAIN EXPORT WRAPPED IN SUSPENSE (Fixes Vercel Build Error)
// =========================================================================
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <Loader2 className="w-8 h-8 animate-spin text-accent" aria-label="Loading" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}