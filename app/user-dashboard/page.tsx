"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { User as UserIcon, Settings, LogOut, Map as MapIcon, Loader2, CheckCircle2, Droplet, Star, TrendingUp } from 'lucide-react';

// =========================================================================
// 1. MAIN CONTENT (Extracted to allow Suspense wrapping)
// =========================================================================
function UserDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'contributions' | 'settings'>(
    (searchParams.get('tab') as 'contributions' | 'settings') || 'contributions'
  );

  // Settings State
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        router.push('/login');
        return;
      }
      
      // Strict Protection: Kick Managers out to their own dashboard
      if (user.user_metadata?.role === 'Manager') {
        router.push('/dashboard');
        return;
      }

      setUser(user);
      setFirstName(user.user_metadata?.first_name || "");
      setLastName(user.user_metadata?.last_name || "");
      setPhone(user.user_metadata?.full_phone || "");
      setLoading(false);
    };
    checkAuth();
  }, [router, supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveMsg("");

    const { error } = await supabase.auth.updateUser({
      data: {
        first_name: firstName,
        last_name: lastName,
        full_phone: phone,
      }
    });

    setIsSaving(false);
    if (error) {
      alert("Error saving settings: " + error.message);
    } else {
      setSaveMsg("Profile updated successfully!");
      setTimeout(() => setSaveMsg(""), 3000);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* NAVBAR */}
      <nav className="bg-emerald-600 text-white p-4 shadow-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tighter text-white cursor-pointer flex items-center gap-1" onClick={() => router.push('/')}>
              <Droplet className="w-6 h-6 fill-white" /> Qozob.
            </h1>
            <span className="bg-black/20 text-xs font-bold px-3 py-1 rounded-full text-white border border-white/10 hidden sm:inline-block">
              Everyday User
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/')} className="flex items-center gap-2 text-xs font-black bg-white/10 hover:bg-white/20 border border-white/10 px-4 py-2 rounded-xl transition-all">
              <MapIcon className="w-4 h-4" /> Map
            </button>
            <button onClick={handleSignOut} className="flex items-center gap-2 text-xs font-black bg-white text-emerald-700 hover:bg-slate-100 px-4 py-2 rounded-xl transition-all shadow-sm">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </div>
      </nav>

      {/* DASHBOARD CONTENT */}
      <main className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
        
        <div className="flex flex-col md:flex-row gap-8">
          
          {/* SIDEBAR MENU */}
          <div className="w-full md:w-64 flex-shrink-0">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-3 text-emerald-600 font-black text-xl">
                  {firstName?.charAt(0)}{lastName?.charAt(0)}
                </div>
                <h2 className="font-bold text-slate-800">{firstName} {lastName}</h2>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>

              <div className="space-y-2">
                <button 
                  onClick={() => setActiveTab('contributions')} 
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'contributions' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <TrendingUp className="w-4 h-4" /> My Contributions
                </button>
                <button 
                  onClick={() => setActiveTab('settings')} 
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'settings' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <Settings className="w-4 h-4" /> Account Settings
                </button>
              </div>
            </div>
          </div>

          {/* MAIN PANEL */}
          <div className="flex-1 bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200">
            
            {activeTab === 'contributions' && (
              <div className="animate-in fade-in slide-in-from-bottom-4">
                <h2 className="text-2xl font-black text-slate-800 mb-2">My Contributions</h2>
                <p className="text-sm text-slate-500 mb-8">Your local community relies on you. Below is a summary of your impact.</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl flex items-center gap-4">
                    <div className="bg-emerald-100 p-3 rounded-full"><Star className="w-6 h-6 text-emerald-600" /></div>
                    <div>
                      <p className="text-xs font-bold text-emerald-600 uppercase">Trusted Reporter</p>
                      <h4 className="text-xl font-black text-slate-800">Active</h4>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center">
                  <MapIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="font-bold text-slate-700 mb-1">Your community updates live here</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">Every time you update a price or rate a pump on the public map, you help thousands of Nigerians find reliable fuel. Keep up the great work!</p>
                  <button onClick={() => router.push('/')} className="mt-6 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-emerald-500/20">
                    Return to Map to Contribute
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="animate-in fade-in slide-in-from-bottom-4">
                <h2 className="text-2xl font-black text-slate-800 mb-2">Account Settings</h2>
                <p className="text-sm text-slate-500 mb-8">Update your personal information here.</p>

                {saveMsg && (
                  <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl text-sm font-bold mb-6 flex items-center gap-2 border border-emerald-100">
                    <CheckCircle2 className="w-5 h-5" /> {saveMsg}
                  </div>
                )}

                <form onSubmit={handleSaveSettings} className="space-y-5 max-w-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">First Name</label>
                      <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Last Name</label>
                      <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Email Address (Read Only)</label>
                    <input type="email" disabled value={user.email} className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-400 cursor-not-allowed" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Phone Number</label>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                  </div>

                  <button type="submit" disabled={isSaving} className="bg-emerald-500 hover:bg-emerald-600 text-white font-black py-3 px-8 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-70 mt-4">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// =========================================================================
// 2. MAIN EXPORT WRAPPED IN SUSPENSE (Fixes Vercel Build Error)
// =========================================================================
export default function UserDashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    }>
      <UserDashboardContent />
    </Suspense>
  );
}