"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Droplet, Loader2, Lock, Mail, User, Building2, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<'User' | 'Manager'>('User');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: role, // Saves 'User' or 'Manager' to Supabase user metadata
        }
      }
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    setSuccessMsg("Account created! Please sign in.");
    setTimeout(() => router.push('/login'), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 font-sans relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-emerald-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-3xl font-black tracking-tighter text-indigo-950 hover:opacity-80 transition-opacity">
            <Droplet className="w-8 h-8 text-emerald-500 fill-emerald-500" />
            Qozob.
          </Link>
          <p className="text-slate-500 mt-2 font-medium">Create your free account.</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8">
          {errorMsg && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-bold mb-6 text-center border border-red-100">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl text-sm font-bold mb-6 text-center border border-emerald-100">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-6">
            
            {/* ROLE SELECTOR */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">How are you using Qozob?</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('User')}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${role === 'User' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
                >
                  <User className={`w-6 h-6 mb-2 ${role === 'User' ? 'text-emerald-500' : 'text-slate-400'}`} />
                  <span className="text-xs font-bold">Everyday User</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRole('Manager')}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${role === 'Manager' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
                >
                  <Building2 className={`w-6 h-6 mb-2 ${role === 'Manager' ? 'text-indigo-500' : 'text-slate-400'}`} />
                  <span className="text-xs font-bold">Station Owner</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-70 mt-4"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create Account"}
            </button>
          </form>

          <div className="mt-8 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link href="/login" className="font-bold text-indigo-600 hover:text-indigo-500 transition-colors inline-flex items-center gap-1">
              Sign in <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}