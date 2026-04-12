"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Droplet, Loader2, Lock, Mail, User, Building2, ArrowRight, UploadCloud, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [role, setRole] = useState<'User' | 'Manager'>('User');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Form Fields
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneCode, setPhoneCode] = useState("+234");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("Nigeria");
  
  // Manager Only Fields
  const [companyName, setCompanyName] = useState("");
  const [cacFile, setCacFile] = useState<File | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    if (role === 'Manager' && (!companyName || !cacFile)) {
      setErrorMsg("Station Owners must provide a Company Name and CAC Document.");
      setLoading(false);
      return;
    }

    try {
      // 1. Create the Auth User
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: role,
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            full_phone: `${phoneCode}${phone}`,
            address: address,
            state: state,
            country: country,
            company_name: role === 'Manager' ? companyName : null,
          }
        }
      });

      if (authError) throw authError;

      // 2. If Manager, upload CAC securely using the newly created user's ID
      if (role === 'Manager' && cacFile && authData.user) {
        const fileExt = cacFile.name.split('.').pop();
        const fileName = `${authData.user.id}/cac_registration_${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('cac_documents')
          .upload(fileName, cacFile);

        if (uploadError) {
          console.error("CAC Upload Warning:", uploadError);
          // We don't fail the whole signup if just the file fails, but we log it.
        } else {
          const { data: urlData } = supabase.storage.from('cac_documents').getPublicUrl(fileName);
          // Update user metadata with the document URL
          await supabase.auth.updateUser({
            data: { cac_document_url: urlData.publicUrl }
          });
        }
      }

      setSuccessMsg("Account created successfully! Please sign in.");
      setTimeout(() => router.push('/login'), 2500);

    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 font-sans relative overflow-hidden py-12">
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-emerald-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>

      <div className="w-full max-w-2xl relative z-10">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-3xl font-black tracking-tighter text-indigo-950 hover:opacity-80 transition-opacity">
            <Droplet className="w-8 h-8 text-emerald-500 fill-emerald-500" />
            Qozob.
          </Link>
          <p className="text-slate-500 mt-2 font-medium">Join the community. Make an impact.</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8">
          {errorMsg && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-bold mb-6 text-center border border-red-100 flex items-center justify-center gap-2">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl text-sm font-bold mb-6 text-center border border-emerald-100 flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5" /> {successMsg}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-6">
            
            {/* ROLE SELECTOR */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">How are you using Qozob?</label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setRole('User')} className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${role === 'User' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}>
                  <User className={`w-6 h-6 mb-2 ${role === 'User' ? 'text-emerald-500' : 'text-slate-400'}`} />
                  <span className="text-xs font-bold">Everyday User</span>
                </button>
                <button type="button" onClick={() => setRole('Manager')} className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${role === 'Manager' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}>
                  <Building2 className={`w-6 h-6 mb-2 ${role === 'Manager' ? 'text-indigo-500' : 'text-slate-400'}`} />
                  <span className="text-xs font-bold">Station Owner</span>
                </button>
              </div>
            </div>

            <div className="h-px bg-slate-100 w-full my-6"></div>

            {/* PERSONAL DETAILS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">First Name *</label>
                <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="John" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Middle Name</label>
                <input type="text" value={middleName} onChange={(e) => setMiddleName(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Last Name *</label>
                <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Doe" />
              </div>
            </div>

            {/* CONTACT DETAILS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Email Address *</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="you@example.com" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Phone Number *</label>
                <div className="flex gap-2">
                  <select value={phoneCode} onChange={(e) => setPhoneCode(e.target.value)} className="w-1/3 px-2 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                    <option value="+234">NG (+234)</option>
                    <option value="+1">US (+1)</option>
                    <option value="+44">UK (+44)</option>
                  </select>
                  <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className="w-2/3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="801 234 5678" />
                </div>
              </div>
            </div>

            {/* LOCATION DETAILS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Country *</label>
                <input type="text" required value={country} onChange={(e) => setCountry(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Nigeria" />
              </div>
              <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">State / Region *</label>
                <input type="text" required value={state} onChange={(e) => setState(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Lagos" />
              </div>
              <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Address</label>
                <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Optional" />
              </div>
            </div>

            {/* MANAGER SPECIFIC DETAILS */}
            {role === 'Manager' && (
              <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 space-y-4 animate-in fade-in slide-in-from-bottom-4">
                <h3 className="text-sm font-black text-indigo-900 uppercase flex items-center gap-2">
                  <Building2 className="w-4 h-4" /> Station Owner Verification
                </h3>
                <div>
                  <label className="block text-xs font-bold text-indigo-800 uppercase mb-2">Registered Company Name *</label>
                  <input type="text" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full px-4 py-3 bg-white border border-indigo-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Qozob Energy Ltd." />
                </div>
                <div>
                  <label className="block text-xs font-bold text-indigo-800 uppercase mb-2">Upload CAC Certificate (PDF/JPG) *</label>
                  <input type="file" required accept=".pdf, image/jpeg, image/png" onChange={(e) => setCacFile(e.target.files ? e.target.files[0] : null)} className="w-full bg-white border border-indigo-200 rounded-xl p-2 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer" />
                </div>
              </div>
            )}

            {/* SECURITY */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Password *</label>
              <div className="relative">
                <Lock className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="••••••••" minLength={6} />
              </div>
            </div>

            <button type="submit" disabled={loading} className={`w-full text-white font-black py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-70 mt-4 ${role === 'Manager' ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20' : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'}`}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Complete Registration"}
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