"use client";

import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Mail, Lock, ShieldCheck, ArrowRight, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

// --- Supabase Setup ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export default function LoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // UI States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isSignUp) {
        // --- CREATE NEW ACCOUNT ---
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;
        
        setSuccess("Account created successfully! Logging you in...");
        // Redirect to dashboard after brief delay
        setTimeout(() => router.push('/dashboard'), 1500);

      } else {
        // --- LOGIN TO EXISTING ACCOUNT ---
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;
        
        setSuccess("Login successful! Redirecting...");
        // Redirect to dashboard after brief delay
        setTimeout(() => router.push('/dashboard'), 1000);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during authentication.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 font-sans relative overflow-hidden">
      
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-indigo-900 rounded-full blur-[100px] opacity-20"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-emerald-500 rounded-full blur-[100px] opacity-20"></div>

      <div className="w-full max-w-md relative z-10">
        
        {/* Brand Header */}
        <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white w-16 h-16 rounded-2xl shadow-lg mx-auto mb-4 flex items-center justify-center border border-slate-100">
            <ShieldCheck className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-3xl font-black text-indigo-950 tracking-tight">
            Qozob <span className="text-emerald-500">Manager</span>
          </h1>
          <p className="text-slate-500 mt-2 font-medium">
            Secure portal for Station Owners & Reps
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 border border-slate-100 animate-in fade-in slide-in-from-bottom-8 duration-700">
          
          {/* Status Messages */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}
          {success && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-700 font-medium">{success}</p>
            </div>
          )}

          <form onSubmit={handleAuth} className="flex flex-col gap-5">
            
            {/* Email Input */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">
                Official Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-medium"
                  placeholder="manager@station.com"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">
                Secure Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-medium"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="mt-2 w-full flex items-center justify-center gap-2 bg-indigo-900 hover:bg-indigo-800 text-white font-black py-4 rounded-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {isSignUp ? "Creating Account..." : "Authenticating..."}
                </>
              ) : (
                <>
                  {isSignUp ? "Create Manager Account" : "Secure Login"}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Toggle Login/Signup */}
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setSuccess(null);
              }}
              className="text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors"
            >
              {isSignUp 
                ? "Already have an account? Sign in here." 
                : "Station Owner? Apply for access here."}
            </button>
          </div>

        </div>
        
        {/* Back to Map Link */}
        <div className="mt-8 text-center">
          <button 
            onClick={() => router.push('/')}
            className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
          >
            ← Return to Public Map
          </button>
        </div>

      </div>
    </div>
  );
}