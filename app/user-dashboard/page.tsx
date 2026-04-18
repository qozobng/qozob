"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  User as UserIcon, Settings, ShieldCheck, Map, 
  LogOut, Star, Droplet, ArrowRight, CheckCircle2, Loader2 
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export default function UserDashboardPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Set default tab based on URL (e.g., ?tab=settings)
  const defaultTab = searchParams.get('tab') === 'settings' ? 'settings' : 'contributions';

  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [loading, setLoading] = useState(true);
  
  // Settings States
  const [currentRole, setCurrentRole] = useState<string>("User");
  const [selectedRole, setSelectedRole] = useState<string>("User");
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error || !user) {
        return router.push('/login');
      }
      
      setUser(user);
      const role = user.user_metadata?.role || "User";
      setCurrentRole(role);
      setSelectedRole(role);
      setLoading(false);
    };

    loadUser();
  }, [router, supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleUpdateRole = async () => {
    if (selectedRole === currentRole) return;
    
    setIsUpdatingRole(true);
    
    // Securely update the user's metadata in Supabase
    const { data, error } = await supabase.auth.updateUser({
      data: { role: selectedRole }
    });

    setIsUpdatingRole(false);

    if (error) {
      alert("Error updating role: " + error.message);
    } else {
      setCurrentRole(selectedRole);
      alert(`Success! Your account is now set to ${selectedRole}.`);
      
      // If they upgraded to Manager, redirect them to the Manager Dashboard
      if (selectedRole === 'Manager') {
        router.push('/dashboard');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col md:flex-row">
      
      {/* ======================= SIDEBAR NAVIGATION ======================= */}
      <aside className="w-full md:w-64 bg-indigo-900 text-white flex flex-col md:min-h-screen shadow-xl z-10 flex-shrink-0">
        <div className="p-6">
          <h1 
            className="text-2xl font-black tracking-tighter text-emerald-400 cursor-pointer mb-8" 
            onClick={() => router.push('/')}
          >
            Qozob.
          </h1>
          
          <div className="bg-white/10 rounded-xl p-4 border border-white/10 mb-8">
            <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider mb-1">Account Info</p>
            <p className="text-sm font-bold text-white truncate">{user?.email}</p>
            <div className="mt-2 inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded text-[10px] font-black uppercase border border-emerald-500/20">
               {currentRole === 'Manager' ? <ShieldCheck className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
               {currentRole}
            </div>
          </div>

          <nav className="flex flex-col gap-2">
            <button 
              onClick={() => setActiveTab('contributions')} 
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors ${activeTab === 'contributions' ? 'bg-emerald-500 text-indigo-950' : 'text-indigo-200 hover:bg-white/5 hover:text-white'}`}
            >
              <Star className="w-4 h-4" /> My Contributions
            </button>
            <button 
              onClick={() => setActiveTab('settings')} 
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors ${activeTab === 'settings' ? 'bg-emerald-500 text-indigo-950' : 'text-indigo-200 hover:bg-white/5 hover:text-white'}`}
            >
              <Settings className="w-4 h-4" /> Account Settings
            </button>
          </nav>
        </div>

        <div className="mt-auto p-6 flex flex-col gap-2">
          {currentRole === 'Manager' && (
            <button 
              onClick={() => router.push('/dashboard')} 
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-indigo-900 bg-emerald-400 hover:bg-emerald-300 transition-colors w-full justify-center shadow-lg"
            >
              <ShieldCheck className="w-4 h-4" /> Manager Portal
            </button>
          )}
          <button 
            onClick={() => router.push('/')} 
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-indigo-200 hover:bg-white/5 hover:text-white transition-colors w-full"
          >
            <Map className="w-4 h-4" /> Back to Map
          </button>
          <button 
            onClick={handleSignOut} 
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-400 hover:bg-red-500/10 transition-colors w-full"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* ======================= MAIN CONTENT AREA ======================= */}
      <main className="flex-1 p-6 lg:p-12 overflow-y-auto">
        
        {/* === CONTRIBUTIONS TAB === */}
        {activeTab === 'contributions' && (
          <div className="max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-3xl font-black text-indigo-950 mb-2">My Contributions</h2>
            <p className="text-slate-500 mb-8">Prices you've updated and stations you've rated.</p>

            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-sm">
              <Droplet className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-slate-800 mb-2">Coming Soon</h3>
              <p className="text-slate-500 max-w-md mx-auto mb-6">We are currently building the feature to track all your historical price updates and pump ratings.</p>
              <button 
                onClick={() => router.push('/')} 
                className="bg-indigo-50 text-indigo-700 font-bold py-3 px-6 rounded-xl hover:bg-indigo-100 transition-colors"
              >
                Go update some prices
              </button>
            </div>
          </div>
        )}

        {/* === SETTINGS TAB === */}
        {activeTab === 'settings' && (
          <div className="max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-3xl font-black text-indigo-950 mb-2">Account Settings</h2>
            <p className="text-slate-500 mb-8">Manage your profile and platform permissions.</p>

            {/* ROLE MANAGEMENT CARD */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
              <div className="bg-indigo-50 p-6 border-b border-indigo-100">
                <h3 className="text-lg font-black text-indigo-950 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-500" /> Platform Role
                </h3>
                <p className="text-xs text-indigo-700 mt-1">
                  Change your role to unlock station management features.
                </p>
              </div>

              <div className="p-6 md:p-8">
                <div className="flex flex-col sm:flex-row gap-4 mb-8">
                  
                  {/* Option 1: Everyday User */}
                  <label 
                    className={`flex-1 relative flex flex-col p-6 cursor-pointer rounded-2xl border-2 transition-all ${selectedRole === 'User' ? 'border-emerald-500 bg-emerald-50 shadow-md' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <input 
                      type="radio" 
                      name="role" 
                      value="User" 
                      checked={selectedRole === 'User'} 
                      onChange={() => setSelectedRole('User')} 
                      className="sr-only" 
                    />
                    <div className="flex justify-between items-start mb-4">
                      <div className={`p-3 rounded-full ${selectedRole === 'User' ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                        <UserIcon className={`w-6 h-6 ${selectedRole === 'User' ? 'text-emerald-600' : 'text-slate-400'}`} />
                      </div>
                      {selectedRole === 'User' && <CheckCircle2 className="w-6 h-6 text-emerald-500" />}
                    </div>
                    <h4 className="font-black text-indigo-950 text-lg mb-1">Everyday User</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      I want to find the best fuel prices, report queues, and rate pump integrity in my area.
                    </p>
                  </label>

                  {/* Option 2: Station Manager */}
                  <label 
                    className={`flex-1 relative flex flex-col p-6 cursor-pointer rounded-2xl border-2 transition-all ${selectedRole === 'Manager' ? 'border-indigo-500 bg-indigo-50 shadow-md' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <input 
                      type="radio" 
                      name="role" 
                      value="Manager" 
                      checked={selectedRole === 'Manager'} 
                      onChange={() => setSelectedRole('Manager')} 
                      className="sr-only" 
                    />
                    <div className="flex justify-between items-start mb-4">
                      <div className={`p-3 rounded-full ${selectedRole === 'Manager' ? 'bg-indigo-100' : 'bg-slate-100'}`}>
                        <ShieldCheck className={`w-6 h-6 ${selectedRole === 'Manager' ? 'text-indigo-600' : 'text-slate-400'}`} />
                      </div>
                      {selectedRole === 'Manager' && <CheckCircle2 className="w-6 h-6 text-indigo-500" />}
                    </div>
                    <h4 className="font-black text-indigo-950 text-lg mb-1">Station Manager</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      I own or manage a filling station. I want to claim my business, update live prices, and access the portal.
                    </p>
                  </label>

                </div>

                <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Current Status: <span className={currentRole === 'Manager' ? 'text-indigo-600' : 'text-emerald-600'}>{currentRole}</span>
                  </p>
                  <button 
                    onClick={handleUpdateRole} 
                    disabled={selectedRole === currentRole || isUpdatingRole} 
                    className="bg-indigo-900 hover:bg-indigo-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3 px-6 rounded-xl transition-colors flex items-center gap-2"
                  >
                    {isUpdatingRole ? "Saving..." : "Save Role Updates"} <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

              </div>
            </div>

          </div>
        )}

      </main>
    </div>
  );
}