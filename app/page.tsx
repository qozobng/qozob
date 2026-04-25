"use client";

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
  Navigation, Droplet, ShieldCheck, Clock,
  X, UploadCloud, AlertTriangle, Search, Filter, ArrowUpDown, Star, Menu, LogOut, User as UserIcon, Settings
} from 'lucide-react';
import { 
  APIProvider, Map, AdvancedMarker, InfoWindow, 
  useMap 
} from '@vis.gl/react-google-maps';

// --- AUTH INTEGRATION ---
import { createClient } from '@/utils/supabase/client';

// --- Map Visual Key ---
const GOOGLE_MAPS_API_KEY = "AIzaSyBR1zxq9SGdcKUHgbLjvl1j0A50F1eG54o";

// =========================================================================
// TYPES
// =========================================================================

interface Station {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distance: string | null;
  price_pms: number | null;
  queue_status: string;
  verified: boolean;
  claim_status: string; // Tracks 'None', 'Pending Review', 'Claimed'
  last_updated: string;
  updated_by_role: string;
  pump_accuracy: number;
  accuracy_votes: number;
  custom_logo_url: string | null;
}

// =========================================================================
// HELPERS & UTILITIES
// =========================================================================

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number): string | null {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) + 
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; 
  return d.toFixed(3); 
}

function timeAgo(dateString: string | null | undefined): string {
  if (!dateString || dateString === "Never") return "Never";
  if (dateString === "Just now") return "Just now";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "Recently"; 
  
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getPriceColor(role: string | null | undefined): string {
  if (!role) return '#FBBC05'; 
  const cleanRole = role.replace(/['"]/g, '').trim().toLowerCase();
  switch(cleanRole) {
    case 'qozob rep': return '#34A853'; 
    case 'owner': return '#4285F4';     
    case 'user': return '#FBBC05';      
    default: return '#FBBC05';          
  }
}

function formatPrice(price: number | string | null | undefined, decimalClass: string): React.ReactNode {
  if (price === null || price === undefined) return "---";
  const numPrice = Number(price);
  if (numPrice % 1 === 0) {
    return <>₦{numPrice}</>;
  } else {
    const [whole, decimal] = numPrice.toFixed(2).split('.');
    return <>₦{whole}<span className={decimalClass}>.{decimal}</span></>;
  }
}

function getStationBrandInfo(name: string | null | undefined, customLogoUrl: string | null | undefined) {
  const lowerName = name?.toLowerCase() || "";
  let logoUrl = customLogoUrl || null; 
  let color = "#10b981"; 
  let text = name ? name.substring(0, 2).toUpperCase() : "GS";
  
  if (!logoUrl) {
    if (lowerName.includes("nnpc")) { logoUrl = "/logos/nnpc.png"; color = "#00a94d"; }
    else if (lowerName.includes("total")) { logoUrl = "/logos/total.png"; color = "#1e3a8a"; }
    else if (lowerName.includes("mobil")) { logoUrl = "/logos/mobil.png"; color = "#2563eb"; }
    else if (lowerName.includes("oando")) { logoUrl = "/logos/oando.png"; color = "#dc2626"; }
    else if (lowerName.includes("conoil")) { logoUrl = "/logos/conoil.png"; color = "#eab308"; }
    else if (lowerName.includes("ardova") || lowerName === "ap" || lowerName.startsWith("ap ") || lowerName.includes(" ap ") || lowerName.includes("a.p") || lowerName.includes("a p ")) { logoUrl = "/logos/ap-brand.png"; color = "#ea580c"; }
    else if (lowerName.includes("shell")) { logoUrl = "/logos/shell.png"; color = "#facc15"; }
    else if (lowerName.includes("rainoil")) { logoUrl = "/logos/rainoil.png"; color = "#0ea5e9"; }
    else if (lowerName.includes("bovas")) { logoUrl = "/logos/bovas.png"; color = "#f43f5e"; }
    else if (lowerName.includes("mrs")) { logoUrl = "/logos/mrs.png"; color = "#712539"; }
    else if (lowerName.includes("11plc") || /\b11\b/.test(lowerName)) { logoUrl = "/logos/11.png"; color = "#0759ad"; }
    else if (lowerName.includes("shafa")) { logoUrl = "/logos/shafa.png"; color = "#e63035"; }
    else if (lowerName.includes("heyden")) { logoUrl = "/logos/heyden.png"; color = "#f76300"; }
    else if (lowerName.includes("nipco")) { logoUrl = "/logos/nipco.png"; color = "#f50002"; }
    else if (lowerName.includes("techno")) { logoUrl = "/logos/techno.png"; color = "#ee161f"; }
    else if (lowerName.includes("enyo")) { logoUrl = "/logos/enyo.png"; color = "#313864"; }
    else if (lowerName.includes("matrix")) { logoUrl = "/logos/matrix.png"; color = "#5dc0e5"; }
    else if (lowerName.includes("fatgbems")) { logoUrl = "/logos/fatgbems.png"; color = "#a13227"; }
    else if (lowerName.includes("forte")) { logoUrl = "/logos/forte.png"; color = "#a3bc01"; }
    else if (lowerName.includes("petrocam")) { logoUrl = "/logos/petrocam.png"; color = "#f37021"; }
    else if (lowerName.includes("eterna")) { logoUrl = "/logos/eterna.png"; color = "#005a8c"; }
    else if (lowerName.includes("pinnacle")) { logoUrl = "/logos/pinnacle.png"; color = "#b12025"; }
  }
  return { logoUrl, color, text };
}

// =========================================================================
// MAP COMPONENTS
// =========================================================================

interface GasStationFetcherProps {
  onStationsFound: (stations: any[]) => void;
  userLoc: { lat: number; lng: number } | null;
  searchCenter: { lat: number; lng: number } | null;
}

function GasStationFetcher({ onStationsFound, userLoc, searchCenter }: GasStationFetcherProps) {
  const map = useMap();
  const [initialPanDone, setInitialPanDone] = useState(false);

  useEffect(() => {
    if (!map) return;
    let centerPoint = { lat: 6.5244, lng: 3.3792 };
    
    if (searchCenter) {
      centerPoint = searchCenter;
      map.panTo(centerPoint);
      map.setZoom(14);
    } else if (userLoc) {
      centerPoint = userLoc;
      if (!initialPanDone) {
        map.panTo(centerPoint);
        map.setZoom(14);
        setInitialPanDone(true);
      }
    }
    
    const fetchStations = async () => {
      try {
        const res = await fetch(`/api/stations?lat=${centerPoint.lat}&lng=${centerPoint.lng}`);
        const data = await res.json();
        if (data.results) {
          onStationsFound(data.results);
        }
      } catch (err) {
        console.error("Error fetching secure stations:", err);
      }
    };
    fetchStations();
  }, [map, onStationsFound, userLoc, searchCenter, initialPanDone]);
  
  return null;
}

function UserLocationMarker({ position }: { position: { lat: number, lng: number } | null }) {
  if (!position) return null;
  return (
    <AdvancedMarker position={position} zIndex={50}>
      <div className="relative flex h-8 w-8 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
        <span className="relative inline-flex h-4 w-4 rounded-full bg-blue-600 border-2 border-white shadow-lg"></span>
      </div>
    </AdvancedMarker>
  );
}

function StationMarker({ name, hasPrice, customLogoUrl }: { name: string, hasPrice: boolean, customLogoUrl?: string | null }) {
  const { logoUrl, color, text } = getStationBrandInfo(name, customLogoUrl);
  return (
    <div className={`relative flex items-center justify-center w-10 h-10 rounded-full shadow-lg border-2 border-white bg-white transition-all duration-300 hover:scale-125 ${!hasPrice ? 'grayscale opacity-70 scale-90' : 'scale-110 z-10'}`}>
      {logoUrl && (
        <img 
          src={logoUrl} 
          alt={name} 
          className="w-full h-full object-contain rounded-full p-0.5" 
          onError={(e) => { 
            e.currentTarget.style.display = 'none'; 
            if (e.currentTarget.nextSibling) (e.currentTarget.nextSibling as HTMLElement).style.display = 'flex'; 
          }} 
        />
      )}
      <div 
        className="w-full h-full rounded-full items-center justify-center" 
        style={{ backgroundColor: color, display: logoUrl ? 'none' : 'flex' }}
      >
         <span className="text-white font-black text-[10px] tracking-tighter leading-none">{text}</span>
      </div>
      <div className="absolute -bottom-1.5 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white"></div>
    </div>
  );
}

function ListLogo({ name, customLogoUrl }: { name: string, customLogoUrl: string | null | undefined }) {
  const { logoUrl, color, text } = getStationBrandInfo(name, customLogoUrl);
  return (
    <div className="flex-shrink-0 w-10 h-10 rounded-full border border-slate-200 bg-white flex items-center justify-center overflow-hidden shadow-sm mr-3">
      {logoUrl && (
        <img 
          src={logoUrl} 
          alt={name} 
          className="w-full h-full object-contain p-1"
          onError={(e) => { 
            e.currentTarget.style.display = 'none'; 
            if (e.currentTarget.nextSibling) (e.currentTarget.nextSibling as HTMLElement).style.display = 'flex'; 
          }}
        />
      )}
      <div 
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor: color, display: logoUrl ? 'none' : 'flex' }}
      >
        <span className="text-white font-black text-[10px] tracking-tighter leading-none">{text}</span>
      </div>
    </div>
  );
}

// =========================================================================
// MODALS (Fully Cleaned - No OTP)
// =========================================================================

function PriceUpdateModal({ station, onClose }: { station: Station, onClose: () => void }) {
  const supabase = createClient();
  
  const [suggestedPrice, setSuggestedPrice] = useState("");
  const [suggestedQueue, setSuggestedQueue] = useState("Moderate");
  const [isSubmittingPrice, setIsSubmittingPrice] = useState(false);

  const handleSuggestPrice = async () => {
    if (!suggestedPrice || !station) return;
    setIsSubmittingPrice(true);

    const { error } = await supabase.from('stations').upsert({
      station_id: station.id,
      name: station.name,
      address: station.address,
      lat: station.lat,
      lng: station.lng,
      price_pms: parseFloat(suggestedPrice),
      queue_status: suggestedQueue,
      last_updated: new Date().toISOString(), 
      updated_by_role: 'User', 
      verified: false
    }, { onConflict: 'station_id' });

    setIsSubmittingPrice(false);
    if (error) {
      alert("Error saving price: " + error.message);
    } else {
      alert("Price updated successfully!");
      onClose();
      window.location.reload(); 
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full relative shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-800 transition-colors">
          <X className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-black text-indigo-950 mb-1">Update Price</h2>
        <p className="text-sm text-slate-500 mb-6">{station.name}</p>

        <div className="transition-all duration-300">
          <label className="text-xs font-bold text-slate-500 uppercase">PMS Price (₦)</label>
          <input 
            type="number" 
            step="0.01" 
            value={suggestedPrice} 
            onChange={(e) => setSuggestedPrice(e.target.value)} 
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-4 mt-1 mb-4 text-2xl font-black outline-none focus:border-emerald-500 transition-colors" 
            placeholder="e.g. 950" 
            /* DELETE THE word `autoFocus` THAT WAS ON THIS LINE */
          />
          
          <label className="text-xs font-bold text-slate-500 uppercase">Current Queue Status</label>
          <select 
            value={suggestedQueue} 
            onChange={(e) => setSuggestedQueue(e.target.value)} 
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-4 mt-1 mb-6 outline-none cursor-pointer"
          >
            <option value="No Queue">No Queue (Fast)</option>
            <option value="Moderate">Moderate</option>
            <option value="Heavy">Heavy Queue</option>
            <option value="No Fuel">No Fuel Dispensing</option>
          </select>

          <button 
            onClick={handleSuggestPrice} 
            disabled={!suggestedPrice || isSubmittingPrice} 
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-xl transition-all disabled:opacity-50 active:scale-95"
          >
            {isSubmittingPrice ? "Saving..." : "Submit to Map"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ClaimStationModal({ station, onClose }: { station: Station, onClose: () => void }) {
  const supabase = createClient();
  const [applicantName, setApplicantName] = useState("");
  const [cacNumber, setCacNumber] = useState("");
  const [phone, setPhone] = useState(""); 
  const [cacFile, setCacFile] = useState<File | null>(null);
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);

  const handleFinalSubmitClaim = async () => {
    if (!cacFile || !applicantName || !cacNumber || !phone) {
      return alert("Please fill all required fields (*), including contact phone, and upload CAC document.");
    }
    setIsSubmittingClaim(true);
    try {
      // 1. Upload Document First
      const fileExt = cacFile.name.split('.').pop();
      const fileName = `cac_${station.id}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('cac_documents')
        .upload(fileName, cacFile);
      
      if (uploadError) throw new Error(uploadError.message);
      
      // 2. Fetch the generated public URL
      const { data: publicUrlData } = supabase.storage
        .from('cac_documents')
        .getPublicUrl(fileName);

      // 3. Get the active user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication required. Please log in again.");

      // 4. Save to the database
      const { error: dbError } = await supabase.from('station_claims').insert({
        user_id: user.id, 
        station_id: station.id, 
        station_name: station.name, 
        applicant_name: applicantName,
        applicant_role: "Pending Owner", 
        business_reg_number: cacNumber, 
        official_email: user.email,
        phone_number: phone, 
        document_url: publicUrlData.publicUrl, 
        status: 'Pending Review',
        lat: station.lat,
        lng: station.lng
      });
      
      if (dbError) throw new Error(dbError.message);

      alert("Claim submitted successfully! The station is now marked as 'Claim in Progress'.");
      onClose();
      window.location.reload();
    } catch (err: any) { 
      alert("Error: " + err.message); 
    } finally { 
      setIsSubmittingClaim(false); 
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full relative shadow-2xl overflow-y-auto max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-800 transition-colors">
          <X className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-black text-indigo-950 mb-2">Claim Station</h2>
        <p className="text-sm text-slate-500 mb-6">Verify ownership of <strong>{station.name}</strong>.</p>
        
        <div className="transition-all duration-300 flex flex-col gap-1">
          <label className="text-xs font-bold text-slate-500 uppercase mt-2">
            Applicant Name <span className="text-red-500">*</span>
          </label>
          <input 
            type="text" 
            value={applicantName} 
            onChange={(e) => setApplicantName(e.target.value)} 
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2 outline-none focus:border-indigo-500 transition-colors" 
            placeholder="e.g. Adebayo Johnson" 
            /* DELETE THE word `autoFocus` THAT WAS ON THIS LINE */
          />

          <label className="text-xs font-bold text-slate-500 uppercase mt-2">
            Contact Phone Number <span className="text-red-500">*</span>
          </label>
          <input 
            type="tel" 
            value={phone} 
            onChange={(e) => setPhone(e.target.value)} 
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2 outline-none focus:border-indigo-500 transition-colors" 
            placeholder="08012345678" 
          />
          
          <label className="text-xs font-bold text-slate-500 uppercase mt-2">
            CAC Reg Number <span className="text-red-500">*</span>
          </label>
          <input 
            type="text" 
            value={cacNumber} 
            onChange={(e) => setCacNumber(e.target.value)} 
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2 outline-none focus:border-indigo-500 transition-colors" 
            placeholder="RC-123456" 
          />
          
          <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2 mt-2">
            <UploadCloud className="w-4 h-4" /> Upload CAC Document (PDF/JPG) <span className="text-red-500">*</span>
          </label>
          <input 
            type="file" 
            accept=".pdf, image/jpeg, image/png" 
            onChange={(e) => setCacFile(e.target.files ? e.target.files[0] : null)} 
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 mb-4 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200 transition-colors cursor-pointer" 
          />
        </div>

        <button 
          onClick={handleFinalSubmitClaim} 
          disabled={isSubmittingClaim} 
          className="w-full bg-indigo-900 hover:bg-indigo-800 text-white font-black py-4 rounded-xl transition-all disabled:opacity-50 active:scale-95"
        >
          {isSubmittingClaim ? "Uploading..." : "Submit Claim for Review"}
        </button>
      </div>
    </div>
  );
}

function RateStationModal({ station, onClose }: { station: Station, onClose: () => void }) {
  const supabase = createClient();
  const [hoveredStar, setHoveredStar] = useState(0);
  const [selectedStar, setSelectedStar] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitRating = async () => {
    if (selectedStar === 0 || !station) return;
    setIsSubmitting(true);

    const currentVotes = station.accuracy_votes || 0;
    const currentScore = station.pump_accuracy || 0;
    const newVotes = currentVotes + 1;
    const newScore = ((currentScore * currentVotes) + selectedStar) / newVotes;

    const { error } = await supabase.from('stations').upsert({
      station_id: station.id,
      name: station.name,
      address: station.address,
      lat: station.lat,
      lng: station.lng,
      price_pms: station.price_pms, 
      queue_status: station.queue_status,
      updated_by_role: station.updated_by_role,
      pump_accuracy: parseFloat(newScore.toFixed(1)), 
      accuracy_votes: newVotes,
      last_updated: station.last_updated === "Never" ? new Date().toISOString() : station.last_updated,
      verified: station.verified || false
    }, { onConflict: 'station_id' });

    setIsSubmitting(false);
    if (error) {
      alert("Error saving rating: " + error.message);
    } else {
      alert("Thank you! Your community rating has been recorded.");
      onClose();
      window.location.reload(); 
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full relative shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-800 transition-colors">
          <X className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-black text-indigo-950 mb-1">Rate Pump Integrity</h2>
        <p className="text-sm text-slate-500 mb-6">{station.name}</p>
        
        <div className="bg-amber-50 rounded-xl p-4 mb-6 border border-amber-100">
          <p className="text-xs font-bold text-amber-800 uppercase text-center mb-3">Community Trust Score</p>
          <p className="text-xs text-amber-700 text-center mb-4">If you buy 5 Litres here, how accurate is the pump? (1 = Severe Shortage, 5 = Perfect Accuracy)</p>
          
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onMouseEnter={() => setHoveredStar(star)}
                onMouseLeave={() => setHoveredStar(0)}
                onClick={() => setSelectedStar(star)}
                className="transition-transform hover:scale-125 duration-200"
              >
                <Star 
                  className={`w-10 h-10 ${
                    star <= (hoveredStar || selectedStar) 
                      ? 'fill-amber-400 text-amber-400' 
                      : 'text-slate-300'
                  } transition-colors`} 
                />
              </button>
            ))}
          </div>
        </div>

        <button 
          onClick={handleSubmitRating} 
          disabled={selectedStar === 0 || isSubmitting} 
          className="w-full bg-indigo-900 hover:bg-indigo-800 text-white font-black py-4 rounded-xl transition-all disabled:opacity-50 active:scale-95"
        >
          {isSubmitting ? "Submitting..." : "Submit Public Rating"}
        </button>
      </div>
    </div>
  );
}

// =========================================================================
// MAIN APP & LANDING
// =========================================================================

export default function QozobApp() {
  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
        <QozobLanding />
      </Suspense>
    </APIProvider>
  );
}

function QozobLanding() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoSelectId = searchParams.get('select');

  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const [googleStations, setGoogleStations] = useState<any[]>([]);
  const [supabasePrices, setSupabasePrices] = useState<any[]>([]);
  const [supabaseClaims, setSupabaseClaims] = useState<any[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  
  const [userLoc, setUserLoc] = useState<{ lat: number, lng: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number, lng: number }>({ lat: 6.5244, lng: 3.3792 });
  const [isFetchingDynamic, setIsFetchingDynamic] = useState(false);

  const [listFilter, setListFilter] = useState("All");
  const [listSort, setListSort] = useState("Distance");
  
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [showRateForm, setShowRateForm] = useState(false);

  // Track scrolling for mobile ad docking
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 60);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const map = useMap('main-map');

  // Sync Auth User
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) setUserRole(user.user_metadata?.role || 'User');
    };
    fetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setUserRole(session?.user?.user_metadata?.role || null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Handle Logout
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setIsMenuOpen(false);
    window.location.reload();
  };

  // Pan Map to Station when selected
  useEffect(() => {
    if (selectedStation && map && selectedStation.lat && selectedStation.lng) {
      map.panTo({ lat: selectedStation.lat, lng: selectedStation.lng });
    }
  }, [selectedStation, map]);

  // Track User Geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setUserLoc(prev => {
            if (prev) {
              const dist = getDistanceFromLatLonInKm(prev.lat, prev.lng, position.coords.latitude, position.coords.longitude);
              if (dist !== null && parseFloat(dist) < 0.05) return prev; 
            }
            return { lat: position.coords.latitude, lng: position.coords.longitude };
          });
        },
        (err) => console.log("Location access denied.", err),
        { enableHighAccuracy: true, maximumAge: 0 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // Fetch baseline DB data for pricing AND active claims
  useEffect(() => {
    async function fetchData() {
      const { data: prices } = await supabase.from('stations').select('*');
      if (prices) setSupabasePrices(prices);
      
      const { data: claims } = await supabase.from('station_claims').select('station_id, status');
      if (claims) setSupabaseClaims(claims);
    }
    fetchData();
  }, [supabase]);

  // Dynamic Map Fetching based on idle movement
  const handleMapIdle = useCallback(async () => {
    if (!map) return;
    const center = map.getCenter();
    if (!center) return;
    
    const lat = center.lat();
    const lng = center.lng();

    const dist = getDistanceFromLatLonInKm(mapCenter.lat, mapCenter.lng, lat, lng);
    if (dist && parseFloat(dist) > 2.0) {
      setMapCenter({ lat, lng });
      setIsFetchingDynamic(true);
      try {
        const res = await fetch(`/api/stations?lat=${lat}&lng=${lng}`);
        const data = await res.json();
        if (data.results) {
          setGoogleStations(prev => {
            const existingIds = new Set(prev.map(p => p.place_id));
            const newStations = data.results.filter((r: any) => !existingIds.has(r.place_id));
            return [...prev, ...newStations];
          });
        }
      } catch (err) {
        console.error("Dynamic fetch error:", err);
      } finally {
        setIsFetchingDynamic(false);
      }
    }
  }, [map, mapCenter]);

  // Merge Google Places + Supabase DB + Claim Status
  const mergedStations: Station[] = googleStations.map(googlePlace => {
    const dbData = supabasePrices.find(db => db.station_id === googlePlace.place_id);
    const claimData = supabaseClaims.find(c => c.station_id === googlePlace.place_id);
    
    const statLat = typeof googlePlace.geometry?.location?.lat === 'function' ? googlePlace.geometry.location.lat() : googlePlace.geometry?.location?.lat;
    const statLng = typeof googlePlace.geometry?.location?.lng === 'function' ? googlePlace.geometry.location.lng() : googlePlace.geometry?.location?.lng;
    const distance = userLoc ? getDistanceFromLatLonInKm(userLoc.lat, userLoc.lng, statLat, statLng) : null;

    let computedClaimStatus = "None";
    if (dbData?.verified) {
      computedClaimStatus = "Claimed";
    } else if (claimData) {
      computedClaimStatus = claimData.status;
    }

    return {
      id: googlePlace.place_id,
      name: dbData?.name || googlePlace.name,
      address: dbData?.address || googlePlace.vicinity,
      lat: statLat,
      lng: statLng,
      distance: distance,
      price_pms: dbData ? dbData.price_pms : null,
      queue_status: dbData ? dbData.queue_status : "Unknown",
      verified: dbData ? dbData.verified : false,
      claim_status: computedClaimStatus,
      last_updated: dbData ? dbData.last_updated : "Never",
      updated_by_role: dbData ? (dbData.updated_by_role || "User") : "User",
      pump_accuracy: dbData ? (dbData.pump_accuracy || 0) : 0, 
      accuracy_votes: dbData ? (dbData.accuracy_votes || 0) : 0,
      custom_logo_url: dbData ? dbData.custom_logo_url : null
    };
  });

  // Auto-Select from URL parameters
  useEffect(() => {
    if (autoSelectId && mergedStations.length > 0) {
      const target = mergedStations.find(s => s.id === autoSelectId);
      if (target) {
        setSelectedStation(target);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [autoSelectId, mergedStations]);

  // Determine the Best/Hero Station
  const pricedStations = mergedStations.filter(s => s.price_pms !== null);
  const sortedByPriceAndDistance = [...pricedStations].sort((a, b) => {
    if (a.price_pms === b.price_pms) {
      const distA = parseFloat(a.distance || "0");
      const distB = parseFloat(b.distance || "0");
      return distA - distB; 
    }
    const priceA = a.price_pms || 0;
    const priceB = b.price_pms || 0;
    return priceA - priceB;
  });
  const heroStation = sortedByPriceAndDistance[0];

  // Filtering for List View
  const filteredList = mergedStations.filter(s => {
    if (listFilter === "Priced") return s.price_pms !== null;
    if (listFilter === "No Queue") return s.queue_status === "No Queue";
    if (listFilter === "Top Rated") return (s.pump_accuracy || 0) >= 4.0; 
    return true;
  });

  // Sorting for List View
  const sortedAndFilteredList = [...filteredList].sort((a, b) => {
    if (listSort === "Distance") return (parseFloat(a.distance || "999") - parseFloat(b.distance || "999"));
    if (listSort === "Price") return ((a.price_pms || 999999) - (b.price_pms || 999999));
    if (listSort === "Rating") return ((b.pump_accuracy || 0) - (a.pump_accuracy || 0));
    if (listSort === "Name") return (a.name || "").localeCompare(b.name || "");
    return 0;
  });

  // Smart Search Geocoding
  const handleLocationSearch = (searchTerm: string) => {
    if (!searchTerm) return;
    if (!(window as any).google || !(window as any).google.maps) return alert("Map is still loading, please wait.");
    
    const geocoder = new (window as any).google.maps.Geocoder();
    geocoder.geocode({ address: searchTerm + ", Nigeria" }, (results: any, status: string) => {
      if (status === "OK" && results[0]) {
        if (map && results[0].geometry.viewport) {
          map.fitBounds(results[0].geometry.viewport); 
        } else if (map) { 
          map.panTo(results[0].geometry.location); 
          map.setZoom(14); 
        }
      } else {
        alert("Could not locate that specific area.");
      }
    });
  };

  const getDirectionsUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  // Auth Protection Wrapper
  const handleProtectedAction = (action: () => void) => {
    if (!user) {
      router.push(`/login?redirect=claim&stationId=${selectedStation?.id}`);
    } else {
      action();
    }
  };

  // Dynamic Claim Logic Handler
  const handleDynamicClaimAction = () => {
    if (!selectedStation) return;

    if (!user) {
      return router.push(`/login?redirect=claim&stationId=${selectedStation.id}`);
    }

    if (userRole !== 'Manager' && userRole !== 'Admin') {
      alert("Only Station Owners/Managers can claim stations. Please update your account role in Settings.");
      return router.push('/user-dashboard?tab=settings');
    }

    setShowClaimForm(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col relative">
      
      {/* ======================= RESPONSIVE HEADER WITH DOCKING AD ======================= */}
      <header className="bg-indigo-900 text-white sticky top-0 z-50 shadow-md transition-all">
        
        {/* 1. MOBILE CAROUSEL AD (First on Mobile, Auto-Docks to Bottom) */}
        <div className={`lg:hidden w-full transition-all duration-300 z-[100] ${
          isScrolled 
            ? 'fixed bottom-0 left-0 right-0 bg-indigo-950 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] border-t border-indigo-800 pb-2' 
            : 'relative bg-indigo-900 border-b border-indigo-800/50'
        }`}>
          <div className="w-full h-[60px] flex items-center justify-center bg-indigo-950/80 relative overflow-hidden">
             <span className="text-[10px] font-bold text-indigo-300/60 uppercase tracking-widest">Mobile Carousel Ad</span>
             <div className="absolute bottom-1.5 flex gap-1.5">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
               <div className="w-1.5 h-1.5 rounded-full bg-slate-500 opacity-50"></div>
               <div className="w-1.5 h-1.5 rounded-full bg-slate-500 opacity-50"></div>
             </div>
          </div>
        </div>

        {/* 2. TOP ROW: Gen-Z Logo, Desktop Ad Space, Auth */}
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 sm:gap-6">
          
          {/* GEN-Z STYLED LOGO (Full spell on all devices) */}
          {/* UNIFIED MODERN LOGO */}
          <div className="flex-shrink-0" onClick={() => window.scrollTo(0,0)}>
            <h1 className="cursor-pointer flex items-baseline select-none font-black tracking-tighter text-emerald-400 text-3xl sm:text-4xl" title="Qozob">
              Qozob
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-emerald-400 rounded-full animate-pulse ml-0.5 self-end mb-1.5 sm:mb-2"></div>
            </h1>
          </div>
          
          {/* DESKTOP AD SPACE (Hidden on Mobile) */}
          <div className="hidden lg:flex flex-1 max-w-[728px] h-[90px] bg-indigo-950/50 border-2 border-indigo-800/50 border-dashed rounded-xl items-center justify-center relative group transition-colors hover:bg-indigo-950 mx-4">
            <span className="text-xs font-bold text-indigo-300/50 uppercase tracking-widest group-hover:text-indigo-300 transition-colors">
              Advertisement Space
            </span>
          </div>

          {/* USER PROFILE & MENU */}
          <div className="flex-shrink-0 flex items-center">
            {user ? (
              <div className="relative">
                <button 
                  onClick={() => setIsMenuOpen(!isMenuOpen)} 
                  className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/10 p-2 sm:px-4 sm:py-2 rounded-xl transition-all active:scale-95"
                >
                  <Menu className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs font-bold truncate max-w-[100px] hidden sm:inline-block">{user.email}</span>
                </button>

                {isMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50 animate-in slide-in-from-top-2">
                    <div className="p-3 bg-indigo-50 border-b border-indigo-100">
                      <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Signed in as</p>
                      <p className="text-xs font-bold text-indigo-950 truncate">{user.email}</p>
                      <p className="text-[10px] font-bold text-emerald-600 mt-1">{userRole}</p>
                    </div>
                    <div className="p-2 flex flex-col gap-1">
                      
                      {userRole === 'Admin' && (
                        <button onClick={() => router.push('/admin/claims')} className="w-full text-left px-3 py-2 text-sm font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg flex items-center gap-2 transition-colors">
                          <ShieldCheck className="w-4 h-4 text-purple-500" /> Admin Dashboard
                        </button>
                      )}

                      {userRole === 'Manager' ? (
                        <button onClick={() => router.push('/dashboard')} className="w-full text-left px-3 py-2 text-sm font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg flex items-center gap-2 transition-colors">
                          <ShieldCheck className="w-4 h-4" /> Go to Dashboard
                        </button>
                      ) : (
                        <button onClick={() => router.push('/user-dashboard')} className="w-full text-left px-3 py-2 text-sm font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg flex items-center gap-2 transition-colors">
                          <ShieldCheck className="w-4 h-4" /> Go to Dashboard
                        </button>
                      )}

                      {userRole !== 'Manager' && (
                        <>
                          <button onClick={() => router.push('/user-dashboard?tab=contributions')} className="w-full text-left px-3 py-2 text-sm font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg flex items-center gap-2 transition-colors">
                            <UserIcon className="w-4 h-4" /> My Contributions
                          </button>
                          <button onClick={() => router.push('/user-dashboard?tab=settings')} className="w-full text-left px-3 py-2 text-sm font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg flex items-center gap-2 transition-colors">
                            <Settings className="w-4 h-4" /> Account Settings
                          </button>
                        </>
                      )}

                      <div className="h-px bg-slate-100 my-1"></div>
                      <button onClick={handleSignOut} className="w-full text-left px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2 transition-colors">
                        <LogOut className="w-4 h-4" /> Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button 
                onClick={() => router.push('/login')} 
                className="text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-indigo-950 px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95 whitespace-nowrap"
              >
                Sign In
              </button>
            )}
          </div>
        </div>

        {/* 3. BOTTOM ROW: Dedicated Smart Search */}
        <div className="bg-indigo-950 border-t border-indigo-800/50 px-4 py-3 flex items-center">
          <div className="w-full max-w-2xl mx-auto relative flex-1">
             <input 
                type="text" 
                id="smart-search-input"
                placeholder="Search streets, LGAs, or landmarks..." 
                onKeyDown={(e) => { 
                  if (e.key === 'Enter') handleLocationSearch((e.target as HTMLInputElement).value) 
                }}
                className="w-full bg-white/10 border border-white/20 rounded-full py-2.5 pl-10 pr-16 text-sm text-white placeholder-indigo-300 focus:outline-none focus:bg-white focus:text-indigo-900 transition-all shadow-inner"
              />
              <Search className="w-4 h-4 absolute left-4 top-3 text-indigo-300" />
              <button 
                onClick={() => handleLocationSearch((document.getElementById('smart-search-input') as HTMLInputElement).value)} 
                className="absolute right-1.5 top-1.5 bg-emerald-400 text-indigo-900 px-3 py-1.5 rounded-full text-xs font-bold hover:bg-emerald-300 transition-colors active:scale-95"
              >
                Go
              </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full p-4 flex flex-col lg:grid lg:grid-cols-3 gap-6 mt-2 flex-grow">
        
        {/* ======================= HERO CARD ======================= */}
        <div className="order-1 lg:order-2 lg:col-start-3 flex flex-col h-fit lg:h-full z-10">
          {heroStation && (
            <div className="bg-indigo-900 rounded-2xl lg:rounded-3xl p-4 lg:p-6 text-white shadow-xl relative overflow-hidden border border-indigo-700 h-full group hover:shadow-2xl transition-all flex flex-col justify-center">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-400 rounded-full blur-3xl opacity-20 -mr-10 -mt-10 group-hover:opacity-30 transition-opacity"></div>
              
              {/* === MOBILE VIEW (Ultra-Compact Horizontal Layout) === */}
              <div className="flex lg:hidden flex-col gap-2 relative z-10">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="text-emerald-400 w-3.5 h-3.5" />
                    <h3 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Top Pick</h3>
                  </div>
                  <div className="flex items-center gap-1 text-[9px] font-bold text-indigo-300 uppercase tracking-wider">
                    <Clock className="w-2.5 h-2.5" /> {timeAgo(heroStation.last_updated)}
                  </div>
                </div>
                
                <div className="flex justify-between items-center gap-3">
                  <div className="flex-1 min-w-0" onClick={() => { setSelectedStation(heroStation); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                    <h2 className="text-base font-bold truncate leading-tight cursor-pointer hover:text-emerald-300">{heroStation.name}</h2>
                    <p className="text-indigo-200 text-[11px] truncate mt-0.5">
                      {heroStation.distance}km • {heroStation.queue_status}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-lg font-bold leading-none drop-shadow-md" style={{ color: getPriceColor(heroStation.updated_by_role) }}>
                      {formatPrice(heroStation.price_pms, "text-[10px]")}
                    </div>
                    <a 
                      href={getDirectionsUrl(heroStation.lat, heroStation.lng)} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="w-9 h-9 bg-emerald-400 hover:bg-emerald-300 text-indigo-950 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg flex-shrink-0"
                    >
                      <Navigation className="w-4 h-4 ml-[-1px]" />
                    </a>
                  </div>
                </div>
              </div>

              {/* === DESKTOP VIEW (Original Large Vertical Layout) === */}
              <div className="hidden lg:flex flex-col h-full relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="text-emerald-400 w-5 h-5" />
                  <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-widest">Top Pick Near You</h3>
                </div>
                
                <h2 
                  className="text-3xl font-bold mb-1 cursor-pointer hover:text-emerald-300 transition-colors w-fit" 
                  onClick={() => { 
                    setSelectedStation(heroStation); 
                    window.scrollTo({ top: 0, behavior: 'smooth' }); 
                  }} 
                  title="Locate on Map"
                >
                  {heroStation.name}
                </h2>

                <p className="text-indigo-200 text-sm mb-2">
                  {heroStation.distance}km away • {heroStation.queue_status} Queue
                </p>
                
                {heroStation.accuracy_votes > 0 && (
                  <div className="flex items-center gap-1 text-xs font-bold text-amber-400 mb-4">
                    <Star className="w-4 h-4 fill-amber-400" /> {heroStation.pump_accuracy}/5 Integrity ({heroStation.accuracy_votes} reviews)
                  </div>
                )}
                
                <div className="flex items-baseline gap-1 mb-1">
                  <div className="text-5xl font-bold" style={{ color: getPriceColor(heroStation.updated_by_role), textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
                    {formatPrice(heroStation.price_pms, "text-2xl")}
                  </div>
                  <span className="text-sm font-normal text-indigo-300">/ liter</span>
                </div>
                
                <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-300 mb-6 uppercase tracking-wider">
                  <Clock className="w-3 h-3" /> Updated {timeAgo(heroStation.last_updated)}
                </div>
                
                <a 
                  href={getDirectionsUrl(heroStation.lat, heroStation.lng)} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="w-full bg-emerald-400 hover:bg-emerald-300 text-indigo-950 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg mt-auto"
                >
                  <Navigation className="w-5 h-5" /> Navigate Now
                </a>
              </div>
            </div>
          )}
        </div>

        {/* ======================= MAIN MAP CONTAINER ======================= */}
        <div className="order-2 lg:order-1 lg:col-span-2 lg:col-start-1 h-full">
          {/* Note: Map height adjusted slightly on mobile to guarantee List visibility */}
          <div className="bg-slate-300 rounded-3xl h-[45vh] sm:h-[50vh] lg:h-[65vh] relative overflow-hidden shadow-lg border-4 border-white group">
            
            {isFetchingDynamic && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-indigo-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 animate-in slide-in-from-top-4">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-ping"></div> Fetching area...
              </div>
            )}

            <Map 
              id="main-map" 
              defaultZoom={13} 
              defaultCenter={{ lat: 6.5244, lng: 3.3792 }} 
              mapId="QOZOB_MAIN_MAP" 
              disableDefaultUI={false} 
              zoomControl={true} 
              mapTypeControl={false} 
              streetViewControl={false} 
              fullscreenControl={false} 
              gestureHandling={'greedy'} 
              onClick={() => setSelectedStation(null)} 
              onIdle={(e) => handleMapIdle()}
            >
              <GasStationFetcher onStationsFound={setGoogleStations} userLoc={userLoc} searchCenter={null} />
              <UserLocationMarker position={userLoc} />
              
              {mergedStations.map((station) => (
                <AdvancedMarker key={station.id} position={{ lat: station.lat, lng: station.lng }} onClick={() => setSelectedStation(station)}>
                  <StationMarker name={station.name} hasPrice={station.price_pms !== null} customLogoUrl={station.custom_logo_url} />
                </AdvancedMarker>
              ))}

              {/* ======================= MAP INFO WINDOW ======================= */}
              {selectedStation && (
                <InfoWindow position={{ lat: selectedStation.lat, lng: selectedStation.lng }} onCloseClick={() => setSelectedStation(null)} headerDisabled={true}>
                  <div className="p-3 min-w-[240px] font-sans relative">
                    <button 
                      onClick={() => setSelectedStation(null)} 
                      className="absolute top-1 right-1 text-slate-400 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-full p-1.5 transition-colors z-10"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    
                    <div className="flex justify-between items-start mb-1 pr-8">
                      <h3 className="font-extrabold text-indigo-950 text-lg leading-tight">{selectedStation.name}</h3>
                      {selectedStation.verified && (
                        <span title="Verified Official Price" className="flex-shrink-0 ml-1">
                          <ShieldCheck className="w-5 h-5 text-blue-500" />
                        </span>
                      )}
                    </div>
                    
                    <p className="text-xs text-slate-500 mb-1">{selectedStation.address}</p>
                    
                    {selectedStation.accuracy_votes > 0 && (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-amber-500 mb-2">
                        <Star className="w-3 h-3 fill-amber-400" /> Pump Integrity: {selectedStation.pump_accuracy}/5
                      </div>
                    )}
                    
                    <a 
                      href={getDirectionsUrl(selectedStation.lat, selectedStation.lng)} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-indigo-600 text-xs font-bold flex items-center gap-1 mb-4 hover:underline transition-all"
                    >
                      <Navigation className="w-3 h-3" /> Get Directions ({selectedStation.distance ? `${selectedStation.distance}km away` : 'Calculating...'})
                    </a>
                    
                    <div className="bg-slate-50 p-3 rounded-xl mb-4 border border-slate-100 flex justify-between items-end">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Current PMS Price</p>
                        <div className="text-3xl font-black mb-1 flex items-baseline" style={{ color: getPriceColor(selectedStation.updated_by_role), textShadow: selectedStation.updated_by_role === 'User' ? '0px 0px 1px rgba(0,0,0,0.2)' : 'none' }}>
                          {formatPrice(selectedStation.price_pms, "text-base")}
                        </div>
                        {selectedStation.price_pms && (
                          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                            <Clock className="w-3 h-3" /> {timeAgo(selectedStation.last_updated)}
                          </div>
                        )}
                      </div>
                      <div className={`text-[10px] font-bold px-2 py-1 rounded-md ${selectedStation.queue_status === 'No Queue' ? 'bg-emerald-100 text-emerald-700' : selectedStation.queue_status === 'Moderate' ? 'bg-amber-100 text-amber-700' : selectedStation.queue_status === 'Heavy' ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-600'}`}>
                        {selectedStation.queue_status}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={() => handleProtectedAction(() => setShowPriceForm(true))} 
                        className="w-full bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold py-2 rounded-lg text-sm border border-emerald-300 transition-colors active:scale-95"
                      >
                        {selectedStation.price_pms ? "Update Pricing" : "Be the first to add price!"}
                      </button>
                      
                      {selectedStation.price_pms && (!user || userRole === 'User') && (
                        <button 
                          onClick={() => handleProtectedAction(() => setShowRateForm(true))} 
                          className="w-full bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold py-2 rounded-lg text-sm border border-amber-300 flex items-center justify-center gap-2 transition-colors active:scale-95"
                        >
                          <Star className="w-4 h-4 fill-amber-500" /> Rate Pump Accuracy
                        </button>
                      )}

                      {/* DYNAMIC CLAIM LOGIC */}
                      {selectedStation.claim_status === 'None' && (
                        <button 
                          onClick={handleDynamicClaimAction} 
                          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors active:scale-95"
                        >
                          <ShieldCheck className="w-4 h-4" /> Claim This Station
                        </button>
                      )}
                      
                      {selectedStation.claim_status === 'Pending Review' && (
                        <button 
                          onClick={() => alert("This station is currently under review by our team.")} 
                          className="w-full bg-indigo-100 text-indigo-700 font-bold py-2 rounded-lg text-sm flex items-center justify-center gap-2 border border-indigo-200"
                        >
                           Claim In Progress...
                        </button>
                      )}

                      {selectedStation.claim_status === 'Claimed' && (
                         <div className="w-full bg-emerald-50 text-emerald-700 font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1 border border-emerald-100">
                           <ShieldCheck className="w-4 h-4" /> Station Officially Claimed
                         </div>
                      )}

                    </div>
                  </div>
                </InfoWindow>
              )}
            </Map>
          </div>
        </div>

        {/* ======================= LIST VIEW & FILTER ======================= */}
        <div className="order-3 lg:order-3 lg:col-span-2 lg:col-start-1 bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <h2 className="text-xl font-extrabold text-indigo-950 flex items-center gap-2">
                <Filter className="w-5 h-5 text-emerald-500" /> Local Stations
              </h2>
              
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <select 
                    value={listSort} 
                    onChange={(e) => setListSort(e.target.value)} 
                    className="w-full sm:w-auto bg-indigo-50 border border-indigo-100 text-indigo-900 rounded-lg p-2 pl-8 text-sm font-bold outline-none cursor-pointer appearance-none transition-colors hover:bg-indigo-100"
                  >
                    <option value="Distance">Nearest</option>
                    <option value="Price">Cheapest</option>
                    <option value="Rating">Highest Rated</option>
                    <option value="Recent">Recently Updated</option>
                    <option value="Name">Name (A-Z)</option>
                  </select>
                  <ArrowUpDown className="w-4 h-4 absolute left-2 top-2.5 text-indigo-500 pointer-events-none" />
                </div>
                
                <select 
                  value={listFilter} 
                  onChange={(e) => setListFilter(e.target.value)} 
                  className="flex-1 sm:flex-none bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm font-bold outline-none cursor-pointer transition-colors hover:bg-slate-100"
                >
                  <option value="All">All Found</option>
                  <option value="Priced">Priced Only</option>
                  <option value="Top Rated">Top Rated (4+ Stars)</option>
                  <option value="No Queue">No Queue</option>
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 pb-2">
              {sortedAndFilteredList.map((station) => (
                <div 
                  key={station.id} 
                  onClick={() => { setSelectedStation(station); window.scrollTo({ top: 0, behavior: 'smooth' }); }} 
                  className="flex justify-between items-center p-4 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:-translate-y-1 hover:shadow-md border border-slate-100 cursor-pointer transition-all duration-200 gap-3"
                >
                  <div className="flex items-center flex-1 min-w-0">
                    <ListLogo name={station.name} customLogoUrl={station.custom_logo_url} />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-slate-800 text-sm truncate">{station.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-[10px] text-slate-500 truncate">{station.distance ? `${station.distance}km away` : station.address}</p>
                        {station.accuracy_votes > 0 && (
                          <div className="flex items-center text-[9px] font-bold text-amber-500 flex-shrink-0">
                            <Star className="w-2.5 h-2.5 fill-amber-400 mr-0.5" /> {station.pump_accuracy}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-black flex items-baseline justify-end" style={{ color: getPriceColor(station.updated_by_role), textShadow: station.updated_by_role === 'User' ? '0px 0px 1px rgba(0,0,0,0.2)' : 'none' }}>
                      {formatPrice(station.price_pms, "text-[10px]")}
                    </div>
                    {station.price_pms && (
                      <div className="flex items-center justify-end gap-1 text-[8px] font-bold text-slate-400 mt-0.5 uppercase tracking-tighter">
                        <Clock className="w-2.5 h-2.5" /> {timeAgo(station.last_updated)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
        </div>

        {/* ======================= NEEDS PRICING LIST ======================= */}
        <div className="order-4 lg:order-4 lg:col-start-3 h-fit">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h2 className="text-lg font-extrabold text-indigo-950 mb-4 flex items-center gap-2">
              <Droplet className="text-emerald-500"/> Needs Pricing Data
            </h2>
            <div className="flex flex-col gap-3">
              {mergedStations.filter(s => !s.price_pms).slice(0, 4).map((station) => (
                <div 
                  key={station.id} 
                  onClick={() => { setSelectedStation(station); window.scrollTo({ top: 0, behavior: 'smooth' }); }} 
                  className="flex justify-between items-center p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:-translate-y-1 hover:shadow-sm border border-slate-100 cursor-pointer gap-3 transition-all duration-200"
                >
                  <div className="flex items-center flex-1 min-w-0">
                    <ListLogo name={station.name} customLogoUrl={station.custom_logo_url} />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-slate-800 text-sm truncate">{station.name}</h3>
                      <p className="text-[10px] text-slate-500 truncate">{station.distance ? `${station.distance}km away` : station.address}</p>
                    </div>
                  </div>
                  <div className="text-right text-xs font-bold text-slate-400 flex-shrink-0 bg-slate-200 px-2 py-1 rounded-md">Update</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* ======================= GLOBAL FOOTER ======================= */}
      <footer className="bg-slate-900 text-slate-400 pt-8 pb-28 lg:pb-8 text-center text-sm mt-8 border-t border-slate-800 w-full">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Droplet className="w-4 h-4 text-emerald-500 fill-emerald-500" />
            {/* FOOTER LOGO */}
            <span className="font-black text-emerald-400 tracking-tighter text-lg flex items-baseline">
              Qozob
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse ml-0.5 self-end mb-1"></div>
            </span>
            
            <span className="text-slate-500">© {new Date().getFullYear()} All rights reserved.</span>
          </div>
          <div className="flex gap-6 font-bold text-xs flex-wrap justify-center">
            <a href="#" className="hover:text-emerald-400 transition-colors">About Us</a>
            <a href="#" className="hover:text-emerald-400 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-emerald-400 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-emerald-400 transition-colors">Contact</a>
          </div>
        </div>
      </footer>

      {showPriceForm && selectedStation && <PriceUpdateModal station={selectedStation} onClose={() => setShowPriceForm(false)} />}
      {showClaimForm && selectedStation && <ClaimStationModal station={selectedStation} onClose={() => setShowClaimForm(false)} />}
      {showRateForm && selectedStation && <RateStationModal station={selectedStation} onClose={() => setShowRateForm(false)} />}
    </div>
  );
}