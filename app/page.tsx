"use client";

import React, { useState, useEffect, Suspense, useCallback, useMemo, useRef, memo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
  Navigation, Droplet, ShieldCheck, Clock,
  X, UploadCloud, AlertTriangle, Search, Filter, ArrowUpDown, Star, Menu, LogOut, User as UserIcon, Settings,
  Share2, LocateFixed, CheckCircle2
} from 'lucide-react';
import { 
  APIProvider, Map as GoogleMap, AdvancedMarker, InfoWindow, 
  useMap 
} from '@vis.gl/react-google-maps';

// --- AUTH INTEGRATION ---
import { createClient } from '@/utils/supabase/client';

// --- SHARED BRANDING ---
import { BrandLogo } from '@/components/BrandLogo';
import { getRole, hasRequestedManager } from '@/lib/roles';
import { SITE } from '@/lib/site';

// --- Map Visual Key ---
// Prefer the env var (set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local / Vercel); the inline key is kept as a fallback.
// Make sure this key is restricted to your domains (HTTP referrers) in Google Cloud Console.
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyBR1zxq9SGdcKUHgbLjvl1j0A50F1eG54o";

// --- Tunables ---
const DEFAULT_CENTER = { lat: 6.5244, lng: 3.3792 }; // Lagos
const REFETCH_DISTANCE_KM = 2.0;   // don't re-query an area within this distance of one already loaded
const STALE_AFTER_HOURS = 48;      // prices older than this are flagged as possibly outdated
const PRICE_SANITY_MIN = 300;      // soft bounds for PMS price typo detection (₦/L)
const PRICE_SANITY_MAX = 3000;

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

type OnStationSaved = (stationId: string, patch: Record<string, any>, message: string) => void;

// =========================================================================
// HELPERS & UTILITIES
// =========================================================================

/** Great-circle distance in km (numeric, for internal comparisons). */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) + 
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number): string | null {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  return haversineKm(lat1, lon1, lat2, lon2).toFixed(3); 
}

/** "1.234km • " or "" when the distance is unknown (avoids rendering "nullkm"). */
function distancePrefix(distance: string | null | undefined): string {
  return distance ? `${distance}km • ` : '';
}

/** Epoch ms for a last_updated value, or 0 for "Never"/invalid. */
function parseUpdatedTime(dateString: string | null | undefined): number {
  if (!dateString || dateString === "Never") return 0;
  const t = Date.parse(dateString);
  return isNaN(t) ? 0 : t;
}

function isStale(dateString: string | null | undefined): boolean {
  const t = parseUpdatedTime(dateString);
  return t > 0 && Date.now() - t > STALE_AFTER_HOURS * 60 * 60 * 1000;
}

// When a station has several claims, show the most relevant one (pending > approved > anything else)
const CLAIM_PRIORITY: Record<string, number> = { 'Pending Review': 3, 'Approved': 2 };
function pickClaimStatus(current: string | undefined, incoming: string): string {
  if (!current) return incoming;
  return (CLAIM_PRIORITY[incoming] || 0) > (CLAIM_PRIORITY[current] || 0) ? incoming : current;
}

function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onEscape(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEscape]);
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

// Station brand detection (logo + colour) now lives in `lib/brands.ts` and is rendered via <BrandLogo />.

// =========================================================================
// MAP COMPONENTS
// =========================================================================

// NOTE: Station fetching used to live in a <GasStationFetcher> component that duplicated the
// map-idle fetch and replaced the station list on every 50m GPS update. It now lives in
// QozobLanding's single, deduplicated `fetchStationsAt`.

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

interface StationMarkerProps {
  name: string;
  hasPrice: boolean;
  customLogoUrl?: string | null;
  price?: number | null;
  role?: string | null;
  lastUpdated?: string | null;
}

// Memoised: with dozens of markers on screen, this avoids re-rendering every marker on unrelated state changes
const StationMarker = memo(function StationMarker({ name, hasPrice, customLogoUrl, price, role, lastUpdated }: StationMarkerProps) {
  const stale = isStale(lastUpdated);
  const pillBg = getPriceColor(role);
  const pillText = pillBg === '#FBBC05' ? '#1e1b4b' : '#ffffff'; // dark text on the yellow "community" colour for contrast

  return (
    <div className="relative flex flex-col items-center">
      <div className={`relative flex items-center justify-center w-10 h-10 rounded-full shadow-lg border-2 border-white bg-white overflow-hidden transition-all duration-300 hover:scale-125 ${!hasPrice ? 'grayscale opacity-70 scale-90' : 'scale-110 z-10'}`}>
        <BrandLogo name={name} customLogoUrl={customLogoUrl} size={40} imgClassName="rounded-full p-0.5" />
      </div>
      {hasPrice && price !== null && price !== undefined ? (
        // PRICE PILL: lets users compare prices at a glance without tapping each station
        <span
          title={stale ? 'Price may be outdated' : undefined}
          className={`relative z-20 -mt-1.5 px-1.5 py-0.5 rounded-md border border-white shadow-md text-[10px] font-black leading-none whitespace-nowrap ${stale ? 'opacity-60' : ''}`}
          style={{ backgroundColor: pillBg, color: pillText }}
        >
          ₦{Math.round(Number(price)).toLocaleString()}
        </span>
      ) : (
        <div className="w-0 h-0 -mt-px border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white"></div>
      )}
    </div>
  );
});

const ListLogo = memo(function ListLogo({ name, customLogoUrl }: { name: string, customLogoUrl: string | null | undefined }) {
  return (
    <div className="flex-shrink-0 w-10 h-10 rounded-full border border-slate-200 bg-white flex items-center justify-center overflow-hidden shadow-sm mr-3">
      <BrandLogo name={name} customLogoUrl={customLogoUrl} size={40} imgClassName="p-1" />
    </div>
  );
});

// =========================================================================
// MODALS
// =========================================================================

function PriceUpdateModal({ station, onClose, onSaved }: { station: Station, onClose: () => void, onSaved: OnStationSaved }) {
  const supabase = createClient();
  
  const [suggestedPrice, setSuggestedPrice] = useState("");
  const [suggestedQueue, setSuggestedQueue] = useState("Moderate");
  const [isSubmittingPrice, setIsSubmittingPrice] = useState(false);
  useEscapeKey(onClose);

  const handleSuggestPrice = async () => {
    if (!suggestedPrice || !station) return;

    const priceNum = parseFloat(suggestedPrice);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      return alert("Please enter a valid price.");
    }
    // Soft sanity check to catch typos (e.g. 95 or 95000) without blocking genuine outliers
    if ((priceNum < PRICE_SANITY_MIN || priceNum > PRICE_SANITY_MAX) &&
        !window.confirm(`₦${priceNum.toLocaleString()} looks unusual for PMS. Submit anyway?`)) {
      return;
    }

    setIsSubmittingPrice(true);

    const payload = {
      station_id: station.id,
      name: station.name,
      address: station.address,
      lat: station.lat,
      lng: station.lng,
      price_pms: priceNum,
      queue_status: suggestedQueue,
      last_updated: new Date().toISOString(), 
      updated_by_role: 'User', 
      verified: false
    };
    // The database decides the final label (Owner / Qozob rep / User) — use the row it actually saved
    const { data: savedRow, error } = await supabase.from('stations').upsert(payload, { onConflict: 'station_id' }).select().maybeSingle();

    setIsSubmittingPrice(false);
    if (error) {
      alert("Error saving price: " + error.message);
    } else {
      onSaved(station.id, savedRow || payload, "Price updated successfully! Thanks for helping the community.");
      onClose();
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

function ClaimStationModal({ station, onClose, onSaved }: { station: Station, onClose: () => void, onSaved: (stationId: string, message: string) => void }) {
  const supabase = createClient();
  const [applicantName, setApplicantName] = useState("");
  const [cacNumber, setCacNumber] = useState("");
  const [phone, setPhone] = useState(""); 
  const [cacFile, setCacFile] = useState<File | null>(null);
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);
  useEscapeKey(onClose);

  const handleFinalSubmitClaim = async () => {
    if (!cacFile || !applicantName || !cacNumber || !phone) {
      return alert("Please fill all required fields (*), including contact phone, and upload CAC document.");
    }
    setIsSubmittingClaim(true);
    try {
      // 1. Get the active user (uploads are kept in a per-user folder)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication required. Please log in again.");

      // 2. Upload the document. The bucket is private, so we store the file's path (not a public link);
      //    admins open it through a short-lived signed link.
      const fileExt = cacFile.name.split('.').pop();
      const fileName = `${user.id}/cac_${station.id}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('cac_documents')
        .upload(fileName, cacFile);
      
      if (uploadError) throw new Error(uploadError.message);

      // 3. Save to the database
      const { error: dbError } = await supabase.from('station_claims').insert({
        user_id: user.id, 
        station_id: station.id, 
        station_name: station.name, 
        applicant_name: applicantName,
        applicant_role: "Pending Owner", 
        business_reg_number: cacNumber, 
        official_email: user.email,
        phone_number: phone, 
        document_url: fileName, 
        status: 'Pending Review',
        lat: station.lat,
        lng: station.lng
      });
      
      if (dbError) throw new Error(dbError.message);

      onSaved(station.id, "Claim submitted! The station is now marked as 'Claim in Progress'.");
      onClose();
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

function RateStationModal({ station, onClose, onSaved }: { station: Station, onClose: () => void, onSaved: OnStationSaved }) {
  const supabase = createClient();
  const [hoveredStar, setHoveredStar] = useState(0);
  const [selectedStar, setSelectedStar] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  useEscapeKey(onClose);

  const handleSubmitRating = async () => {
    if (selectedStar === 0 || !station) return;
    setIsSubmitting(true);

    // Counted on the server: one vote per person per station (rating again replaces your old vote),
    // and simultaneous ratings can't overwrite each other.
    const { data, error } = await supabase.rpc('rate_station', {
      p_station_id: station.id,
      p_stars: selectedStar,
      p_name: station.name,
      p_address: station.address,
      p_lat: station.lat,
      p_lng: station.lng,
    });

    setIsSubmitting(false);
    if (error) {
      alert("Error saving rating: " + error.message);
    } else {
      const result = (data || {}) as { pump_accuracy?: number; accuracy_votes?: number; changed_vote?: boolean };
      const patch = {
        pump_accuracy: Number(result.pump_accuracy ?? station.pump_accuracy ?? 0),
        accuracy_votes: Number(result.accuracy_votes ?? station.accuracy_votes ?? 0),
      };
      onSaved(station.id, patch, result.changed_vote
        ? "Your rating has been updated. Thanks!"
        : "Thank you! Your community rating has been recorded.");
      onClose();
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
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoSelectId = searchParams.get('select');

  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [requestedManager, setRequestedManager] = useState(false); // asked for Manager access, awaiting admin approval
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const [googleStations, setGoogleStations] = useState<any[]>([]);
  // Supabase rows + claim statuses keyed by station_id (O(1) lookups instead of Array.find per station per render)
  const [dbRows, setDbRows] = useState<Map<string, any>>(() => new Map());
  const [claimStatuses, setClaimStatuses] = useState<Map<string, string>>(() => new Map());
  // Store the selected station by ID so the info window always shows the latest (live) data
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const [userLoc, setUserLoc] = useState<{ lat: number, lng: number } | null>(null);
  const [pendingFetches, setPendingFetches] = useState(0);
  const isFetchingDynamic = pendingFetches > 0;
  const [isLive, setIsLive] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [listFilter, setListFilter] = useState("All");
  const [listSort, setListSort] = useState("Distance");
  
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [showRateForm, setShowRateForm] = useState(false);

  const map = useMap('main-map');
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch bookkeeping (refs, so they never trigger re-renders)
  const fetchedCentersRef = useRef<{ lat: number; lng: number }[]>([]); // areas already loaded
  const requestedIdsRef = useRef<Set<string>>(new Set());               // station IDs whose DB rows were requested
  const fetchGenerationRef = useRef(0);                                  // bumps when we discard the default area
  const initialLocHandledRef = useRef(false);
  const initialPanDoneRef = useRef(false);
  const deepLinkHandledRef = useRef(false);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // Sync Auth User
  // The role comes from app_metadata (set only by an admin / the database). user_metadata.role is
  // user-editable, so it only tells us someone has *asked* to be a Manager.
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        setUserRole(getRole(user));
        setRequestedManager(hasRequestedManager(user));
      }
    };
    fetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setUserRole(session?.user ? getRole(session.user) : null);
      setRequestedManager(hasRequestedManager(session?.user));
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Handle Logout
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setIsMenuOpen(false);
    window.location.reload();
  };

  // Close the account menu when clicking anywhere outside it
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  // Track User Geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setUserLoc(prev => {
            if (prev && haversineKm(prev.lat, prev.lng, position.coords.latitude, position.coords.longitude) < 0.05) return prev; 
            return { lat: position.coords.latitude, lng: position.coords.longitude };
          });
        },
        (err) => console.log("Location access denied.", err),
        // A 10s cached fix is plenty for a fuel map and is much kinder to phone batteries than maximumAge: 0
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // Fetch DB pricing + claim data ONLY for the stations we're actually showing.
  // (Previously the whole `stations` table was downloaded, which grows forever and is capped at 1000 rows by Supabase.)
  const loadDbDataFor = useCallback(async (ids: string[]) => {
    const missing = ids.filter(id => id && !requestedIdsRef.current.has(id));
    if (missing.length === 0) return;
    missing.forEach(id => requestedIdsRef.current.add(id));

    const CHUNK_SIZE = 80; // keeps PostgREST URLs well under length limits
    const chunks: string[][] = [];
    for (let i = 0; i < missing.length; i += CHUNK_SIZE) chunks.push(missing.slice(i, i + CHUNK_SIZE));

    await Promise.all(chunks.map(async (chunk) => {
      const [{ data: rows, error: rowsError }, { data: claims }] = await Promise.all([
        supabase.from('stations').select('*').in('station_id', chunk),
        // Claims contain personal details and are private; this function returns only station_id + status
        supabase.rpc('get_claim_statuses', { ids: chunk }),
      ]);

      if (rowsError) {
        console.error("Error loading station data:", rowsError.message);
        chunk.forEach(id => requestedIdsRef.current.delete(id)); // allow a retry later
      }
      if (rows && rows.length > 0) {
        setDbRows(prev => {
          const next = new Map(prev);
          rows.forEach((r: any) => next.set(r.station_id, r));
          return next;
        });
      }
      if (claims && claims.length > 0) {
        setClaimStatuses(prev => {
          const next = new Map(prev);
          claims.forEach((c: any) => next.set(c.station_id, pickClaimStatus(next.get(c.station_id), c.status)));
          return next;
        });
      }
    }));
  }, [supabase]);

  // Single entry point for loading stations around a point. Skips areas we've already loaded,
  // so map pans, GPS updates while driving, and deep links never trigger duplicate API calls.
  const fetchStationsAt = useCallback(async (lat: number, lng: number) => {
    if (fetchedCentersRef.current.some(c => haversineKm(c.lat, c.lng, lat, lng) < REFETCH_DISTANCE_KM)) return;
    const center = { lat, lng };
    fetchedCentersRef.current.push(center);
    const generation = fetchGenerationRef.current;

    setPendingFetches(n => n + 1);
    try {
      const res = await fetch(`/api/stations?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (generation !== fetchGenerationRef.current) return; // this area was discarded while loading
      if (Array.isArray(data.results)) {
        setGoogleStations(prev => {
          const existingIds = new Set(prev.map(p => p.place_id));
          const newStations = data.results.filter((r: any) => r.place_id && !existingIds.has(r.place_id));
          return newStations.length > 0 ? [...prev, ...newStations] : prev;
        });
        loadDbDataFor(data.results.map((r: any) => r.place_id));
      }
    } catch (err) {
      console.error("Station fetch error:", err);
      fetchedCentersRef.current = fetchedCentersRef.current.filter(c => c !== center); // allow a retry
    } finally {
      setPendingFetches(n => Math.max(0, n - 1));
    }
  }, [loadDbDataFor]);

  // LIVE PRICES: patch stations in place as the community updates them.
  // Requires Realtime to be enabled for the `stations` table in Supabase (Database → Replication).
  useEffect(() => {
    const channel = supabase
      .channel('qozob-live-stations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stations' }, (payload) => {
        const row = payload.new as any;
        if (!row?.station_id || !requestedIdsRef.current.has(row.station_id)) return;
        setDbRows(prev => {
          const next = new Map(prev);
          next.set(row.station_id, { ...prev.get(row.station_id), ...row });
          return next;
        });
      })
      .subscribe((status) => setIsLive(status === 'SUBSCRIBED'));

    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  // Dynamic Map Fetching based on idle movement (the first idle also loads the default area)
  const handleMapIdle = useCallback((ev: { map: google.maps.Map }) => {
    const center = ev.map.getCenter();
    if (!center) return;
    fetchStationsAt(center.lat(), center.lng());
  }, [fetchStationsAt]);

  // When the user's location arrives, load their area (deduped as they move)
  useEffect(() => {
    if (!userLoc) return;
    if (!initialLocHandledRef.current) {
      initialLocHandledRef.current = true;
      // Far from the default Lagos view (and not opening a shared link)? Drop the default-area results
      // so "Top Pick" reflects stations near the user, matching the original behaviour.
      if (!autoSelectId && haversineKm(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng, userLoc.lat, userLoc.lng) > 5) {
        fetchGenerationRef.current += 1;
        fetchedCentersRef.current = [];
        setGoogleStations([]);
      }
    }
    fetchStationsAt(userLoc.lat, userLoc.lng);
  }, [userLoc, autoSelectId, fetchStationsAt]);

  // Pan to the user once, the first time both the map and their location are available
  useEffect(() => {
    if (!map || !userLoc || initialPanDoneRef.current || autoSelectId) return;
    initialPanDoneRef.current = true;
    map.panTo(userLoc);
    map.setZoom(14);
  }, [map, userLoc, autoSelectId]);

  // Merge Google Places + Supabase DB + Claim Status (memoised; Map lookups are O(1))
  const mergedStations: Station[] = useMemo(() => googleStations.map(googlePlace => {
    const dbData = dbRows.get(googlePlace.place_id);
    const claimStatus = claimStatuses.get(googlePlace.place_id);
    
    const statLat = typeof googlePlace.geometry?.location?.lat === 'function' ? googlePlace.geometry.location.lat() : googlePlace.geometry?.location?.lat;
    const statLng = typeof googlePlace.geometry?.location?.lng === 'function' ? googlePlace.geometry.location.lng() : googlePlace.geometry?.location?.lng;
    const distance = userLoc ? getDistanceFromLatLonInKm(userLoc.lat, userLoc.lng, statLat, statLng) : null;

    let computedClaimStatus = "None";
    if (dbData?.verified || dbData?.manager_id) {
      computedClaimStatus = "Claimed";
    } else if (claimStatus) {
      computedClaimStatus = claimStatus;
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
  }), [googleStations, dbRows, claimStatuses, userLoc]);

  const stationsById = useMemo(() => {
    const byId = new Map<string, Station>();
    mergedStations.forEach(s => byId.set(s.id, s));
    return byId;
  }, [mergedStations]);

  // The selected station is always derived from the latest data (live updates show immediately)
  const selectedStation = selectedId ? stationsById.get(selectedId) ?? null : null;
  // Keeps the original call sites working: they pass a station object (or null)
  const setSelectedStation = useCallback((station: Station | null) => setSelectedId(station ? station.id : null), []);

  // Pan Map to Station when selected (depends on coordinates only, so live price updates don't re-pan)
  const selectedLat = selectedStation?.lat;
  const selectedLng = selectedStation?.lng;
  useEffect(() => {
    if (map && selectedLat && selectedLng) {
      map.panTo({ lat: selectedLat, lng: selectedLng });
    }
  }, [map, selectedLat, selectedLng]);

  // Auto-Select from URL parameters (runs once, as soon as the station is loaded)
  useEffect(() => {
    if (!autoSelectId || deepLinkHandledRef.current) return;
    if (stationsById.has(autoSelectId)) {
      deepLinkHandledRef.current = true;
      setSelectedId(autoSelectId);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [autoSelectId, stationsById]);

  // Shared links can point anywhere in Nigeria: look the station up and load its area
  useEffect(() => {
    if (!autoSelectId || !map) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('stations').select('lat, lng').eq('station_id', autoSelectId).maybeSingle();
      if (cancelled || !data?.lat || !data?.lng) return;
      map.panTo({ lat: data.lat, lng: data.lng });
      map.setZoom(15);
      fetchStationsAt(data.lat, data.lng);
    })();
    return () => { cancelled = true; };
  }, [autoSelectId, map, supabase, fetchStationsAt]);

  // Determine the Best/Hero Station (+ area average for the savings badge)
  const { heroStation, areaAvgPrice, pricedCount } = useMemo(() => {
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
    const avg = pricedStations.length > 0
      ? pricedStations.reduce((sum, s) => sum + Number(s.price_pms), 0) / pricedStations.length
      : null;
    return { heroStation: sortedByPriceAndDistance[0], areaAvgPrice: avg, pricedCount: pricedStations.length };
  }, [mergedStations]);
  const heroSavings = heroStation && areaAvgPrice !== null && pricedCount >= 3
    ? Math.round(areaAvgPrice - Number(heroStation.price_pms))
    : 0;

  // Determine the Nearest Station
  const nearestStation = useMemo(() => {
    const withDistance = mergedStations.filter(s => s.distance !== null && s.distance !== undefined);
    if (withDistance.length === 0) return null;
    return withDistance.sort((a, b) => parseFloat(a.distance as string) - parseFloat(b.distance as string))[0];
  }, [mergedStations]);

  // Filtering + Sorting for List View
  const sortedAndFilteredList = useMemo(() => {
    const filteredList = mergedStations.filter(s => {
      if (listFilter === "Priced") return s.price_pms !== null;
      if (listFilter === "No Queue") return s.queue_status === "No Queue";
      if (listFilter === "Top Rated") return (s.pump_accuracy || 0) >= 4.0; 
      return true;
    });

    return [...filteredList].sort((a, b) => {
      if (listSort === "Distance") return (parseFloat(a.distance || "999") - parseFloat(b.distance || "999"));
      if (listSort === "Price") return ((a.price_pms || 999999) - (b.price_pms || 999999));
      if (listSort === "Rating") return ((b.pump_accuracy || 0) - (a.pump_accuracy || 0));
      if (listSort === "Recent") return parseUpdatedTime(b.last_updated) - parseUpdatedTime(a.last_updated);
      if (listSort === "Name") return (a.name || "").localeCompare(b.name || "");
      return 0;
    });
  }, [mergedStations, listFilter, listSort]);

  // Unpriced stations, nearest first, for the "Needs Pricing Data" panel
  const needsPricing = useMemo(() => (
    mergedStations
      .filter(s => !s.price_pms)
      .sort((a, b) => parseFloat(a.distance || "999") - parseFloat(b.distance || "999"))
      .slice(0, 4)
  ), [mergedStations]);

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

    if (userRole !== 'Manager' && userRole !== 'Admin' && !requestedManager) {
      alert("Only Station Owners/Managers can claim stations. Please request Manager access in Settings.");
      return router.push('/user-dashboard?tab=settings');
    }

    setShowClaimForm(true);
  };

  // Patch local state after a successful write (replaces full page reloads)
  const handleStationSaved = useCallback((stationId: string, patch: Record<string, any>, message: string) => {
    requestedIdsRef.current.add(stationId);
    setDbRows(prev => {
      const next = new Map(prev);
      next.set(stationId, { ...(prev.get(stationId) || { station_id: stationId }), ...patch });
      return next;
    });
    showToast(message);
  }, [showToast]);

  const handleClaimSaved = useCallback((stationId: string, message: string) => {
    setClaimStatuses(prev => {
      const next = new Map(prev);
      next.set(stationId, 'Pending Review');
      return next;
    });
    showToast(message);
  }, [showToast]);

  // Share a station via the native share sheet (WhatsApp, SMS...) or copy the deep link
  const handleShareStation = async (station: Station) => {
    const url = `${window.location.origin}/?select=${encodeURIComponent(station.id)}`;
    const priceText = station.price_pms !== null ? ` — PMS ₦${station.price_pms}/L` : '';
    const text = `${station.name}${priceText}. Live fuel prices & queues on Qozob:`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Qozob', text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        showToast('Link copied to clipboard!');
      }
    } catch {
      // User dismissed the share sheet — nothing to do
    }
  };

  const handleLocateMe = () => {
    if (!map) return;
    if (!userLoc) return showToast('Enable location access to find stations near you.', 'error');
    map.panTo(userLoc);
    map.setZoom(14);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col relative pb-20 lg:pb-0">
      
      {/* ======================= RESPONSIVE HEADER ======================= */}
      <header className="bg-indigo-900 text-white sticky top-0 z-50 shadow-md transition-all">

        {/* 1. TOP ROW: Gen-Z Logo, Desktop Ad Space, Auth */}
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 sm:gap-6">
          
          {/* GEN-Z STYLED LOGO */}
          <div className="flex-shrink-0" onClick={() => window.scrollTo(0,0)}>
            <div className="cursor-pointer flex items-center h-8 sm:h-10 text-emerald-400 hover:text-emerald-300 transition-colors" title="Qozob">
              {/* FIXED VIEWBOX TO PREVENT CROPPING THE 'B' */}
              <svg viewBox="0 0 400 100" className="h-full w-auto" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round">
                {/* q */}
                <circle cx="40" cy="50" r="26" />
                <path d="M66,50 V95" />
                {/* o */}
                <circle cx="120" cy="50" r="26" />
                {/* z */}
                <path d="M170,24 H230 L170,76 H230" />
                {/* o */}
                <circle cx="280" cy="50" r="26" />
                {/* b */}
                <path d="M334,5 V50" />
                <circle cx="360" cy="50" r="26" />
                
                {/* Pulsating dot perfectly centered inside the 'b' */}
                <circle cx="360" cy="50" r="8" fill="currentColor" stroke="none" className="animate-pulse text-emerald-500" />
              </svg>
            </div>
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
              <div className="relative" ref={menuRef}>
                <button 
                  onClick={() => setIsMenuOpen(!isMenuOpen)} 
                  aria-label="Account menu"
                  aria-expanded={isMenuOpen}
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
                      <p className="text-[10px] font-bold text-emerald-600 mt-1">{userRole}{requestedManager && <span className="text-amber-600"> · Manager access pending</span>}</p>
                    </div>
                    <div className="p-2 flex flex-col gap-1">
                      
                      {userRole === 'Admin' && (
                        <button onClick={() => router.push('/admin')} className="w-full text-left px-3 py-2 text-sm font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg flex items-center gap-2 transition-colors">
                          <ShieldCheck className="w-4 h-4 text-purple-500" /> Admin Dashboard
                        </button>
                      )}

                      {(userRole === 'Manager' || requestedManager) ? (
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

        {/* 2. BOTTOM ROW: Dedicated Smart Search */}
        <div className="bg-indigo-950 border-t border-indigo-800/50 px-4 py-3 flex items-center">
          <div className="w-full max-w-2xl mx-auto relative flex-1">
             <input 
                type="text" 
                id="smart-search-input"
                ref={searchInputRef}
                aria-label="Search location"
                enterKeyHint="search"
                placeholder="Search streets, LGAs, or landmarks..." 
                onKeyDown={(e) => { 
                  if (e.key === 'Enter') handleLocationSearch((e.target as HTMLInputElement).value) 
                }}
                className="w-full bg-white/10 border border-white/20 rounded-full py-2.5 pl-10 pr-16 text-sm text-white placeholder-indigo-300 focus:outline-none focus:bg-white focus:text-indigo-900 transition-all shadow-inner"
              />
              <Search className="w-4 h-4 absolute left-4 top-3 text-indigo-300" />
              <button 
                onClick={() => handleLocationSearch(searchInputRef.current?.value || "")} 
                className="absolute right-1.5 top-1.5 bg-emerald-400 text-indigo-900 px-3 py-1.5 rounded-full text-xs font-bold hover:bg-emerald-300 transition-colors active:scale-95"
              >
                Go
              </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full p-4 flex flex-col lg:grid lg:grid-cols-3 gap-6 mt-2 flex-grow">
        
        {/* ======================= HERO CARDS SECTION ======================= */}
        <div className="order-1 lg:order-2 lg:col-start-3 flex flex-col gap-4 h-fit lg:h-full z-10">
          
          {/* === MOBILE VIEW: STACKED CARDS === */}
          <div className="flex lg:hidden flex-col gap-3">
            {/* 1. Mobile Top Pick */}
            {heroStation && (
              <div className="bg-indigo-900 rounded-2xl p-4 text-white shadow-xl relative overflow-hidden border border-indigo-700">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-400 rounded-full blur-3xl opacity-20 -mr-10 -mt-10"></div>
                <div className="flex flex-col gap-2 relative z-10">
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
                        {distancePrefix(heroStation.distance)}{heroStation.queue_status}
                        {heroSavings > 0 && <span className="text-emerald-300 font-bold"> • ₦{heroSavings.toLocaleString()} below avg</span>}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-lg font-bold leading-none drop-shadow-md" style={{ color: getPriceColor(heroStation.updated_by_role) }}>
                        {formatPrice(heroStation.price_pms, "text-[10px]")}
                      </div>
                      <a href={getDirectionsUrl(heroStation.lat, heroStation.lng)} target="_blank" rel="noopener noreferrer" className="w-9 h-9 bg-emerald-400 hover:bg-emerald-300 text-indigo-950 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg flex-shrink-0">
                        <Navigation className="w-4 h-4 ml-[-1px]" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Mobile Nearest */}
            {nearestStation && (
              <div className="bg-indigo-900/90 rounded-2xl p-4 text-white shadow-xl relative overflow-hidden border border-indigo-800">
                <div className="flex flex-col gap-2 relative z-10">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <Navigation className="text-blue-400 w-3.5 h-3.5" />
                      <h3 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Nearest</h3>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center gap-3">
                    <div className="flex-1 min-w-0" onClick={() => { setSelectedStation(nearestStation); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                      <h2 className="text-base font-bold truncate leading-tight cursor-pointer hover:text-blue-300">{nearestStation.name}</h2>
                      <p className="text-indigo-200 text-[11px] truncate mt-0.5">
                        {distancePrefix(nearestStation.distance)}{nearestStation.queue_status}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-lg font-bold leading-none drop-shadow-md" style={{ color: getPriceColor(nearestStation.updated_by_role) }}>
                        {formatPrice(nearestStation.price_pms, "text-[10px]")}
                      </div>
                      <a href={getDirectionsUrl(nearestStation.lat, nearestStation.lng)} target="_blank" rel="noopener noreferrer" className="w-9 h-9 bg-blue-500 hover:bg-blue-400 text-white rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg flex-shrink-0">
                        <Navigation className="w-4 h-4 ml-[-1px]" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* === DESKTOP VIEW: VERTICAL 50/50 SPLIT (Compact Height) === */}
          <div className="hidden lg:flex flex-col gap-4 h-full">
            
            {/* Card 1: Top Pick Near You (Top 50%) */}
            {heroStation && (
              <div className="flex-1 bg-indigo-900 rounded-3xl p-5 text-white shadow-xl relative overflow-hidden border border-indigo-700 flex flex-col justify-center group hover:shadow-2xl transition-all">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-400 rounded-full blur-3xl opacity-20 -mr-10 -mt-10 group-hover:opacity-30 transition-opacity"></div>
                
                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <AlertTriangle className="text-emerald-400 w-3.5 h-3.5" />
                        <h3 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Top Pick</h3>
                      </div>
                      <h2 className="text-xl font-bold leading-tight cursor-pointer hover:text-emerald-300 transition-colors line-clamp-1" onClick={() => { setSelectedStation(heroStation); window.scrollTo({ top: 0, behavior: 'smooth' }); }} title={heroStation.name}>
                        {heroStation.name}
                      </h2>
                      <p className="text-indigo-200 text-[11px] mt-0.5">{distancePrefix(heroStation.distance)}{heroStation.queue_status}</p>
                    </div>
                    
                    <div className="text-right flex-shrink-0">
                      <div className="text-2xl font-bold leading-none drop-shadow-md mb-1" style={{ color: getPriceColor(heroStation.updated_by_role) }}>
                        {formatPrice(heroStation.price_pms, "text-sm")}
                      </div>
                      {heroStation.accuracy_votes > 0 && (
                        <div className="flex items-center justify-end gap-1 text-[9px] font-bold text-amber-400">
                          <Star className="w-2.5 h-2.5 fill-amber-400" /> {heroStation.pump_accuracy}/5
                        </div>
                      )}
                      {heroSavings > 0 && (
                        <div className="text-[9px] font-bold text-emerald-300 mt-0.5" title="Compared with the average price of stations loaded on the map">
                          ₦{heroSavings.toLocaleString()} below area avg
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="mt-auto flex justify-between items-center pt-2 border-t border-indigo-800/50">
                    <div className="flex items-center gap-1 text-[9px] font-bold text-indigo-300 uppercase tracking-wider">
                      <Clock className="w-2.5 h-2.5" /> {timeAgo(heroStation.last_updated)}
                    </div>
                    <a href={getDirectionsUrl(heroStation.lat, heroStation.lng)} target="_blank" rel="noopener noreferrer" className="bg-emerald-400 hover:bg-emerald-300 text-indigo-950 font-bold py-1.5 px-4 text-xs rounded-lg flex items-center gap-1.5 transition-all active:scale-95 shadow-md">
                      <Navigation className="w-3.5 h-3.5" /> Navigate
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Card 2: Nearest to You (Bottom 50%) */}
            {nearestStation && (
              <div className="flex-1 bg-indigo-900/90 rounded-3xl p-5 text-white shadow-xl relative overflow-hidden border border-indigo-800 flex flex-col justify-center group hover:shadow-2xl transition-all">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500 rounded-full blur-3xl opacity-10 -mr-10 -mt-10 group-hover:opacity-20 transition-opacity"></div>
                
                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Navigation className="text-blue-400 w-3.5 h-3.5" />
                        <h3 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Nearest</h3>
                      </div>
                      <h2 className="text-xl font-bold leading-tight cursor-pointer hover:text-blue-300 transition-colors line-clamp-1" onClick={() => { setSelectedStation(nearestStation); window.scrollTo({ top: 0, behavior: 'smooth' }); }} title={nearestStation.name}>
                        {nearestStation.name}
                      </h2>
                      <p className="text-indigo-200 text-[11px] mt-0.5">{distancePrefix(nearestStation.distance)}{nearestStation.queue_status}</p>
                    </div>
                    
                    <div className="text-right flex-shrink-0">
                      <div className="text-2xl font-bold leading-none drop-shadow-md mb-1" style={{ color: getPriceColor(nearestStation.updated_by_role) }}>
                        {formatPrice(nearestStation.price_pms, "text-sm")}
                      </div>
                      {nearestStation.accuracy_votes > 0 && (
                        <div className="flex items-center justify-end gap-1 text-[9px] font-bold text-amber-400">
                          <Star className="w-2.5 h-2.5 fill-amber-400" /> {nearestStation.pump_accuracy}/5
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="mt-auto flex justify-between items-center pt-2 border-t border-indigo-800/50">
                    <div className="flex items-center gap-1 text-[9px] font-bold text-indigo-300 uppercase tracking-wider">
                      <Clock className="w-2.5 h-2.5" /> {timeAgo(nearestStation.last_updated)}
                    </div>
                    <a href={getDirectionsUrl(nearestStation.lat, nearestStation.lng)} target="_blank" rel="noopener noreferrer" className="bg-blue-500 hover:bg-blue-400 text-white font-bold py-1.5 px-4 text-xs rounded-lg flex items-center gap-1.5 transition-all active:scale-95 shadow-md">
                      <Navigation className="w-3.5 h-3.5" /> Navigate
                    </a>
                  </div>
                </div>
              </div>
            )}
            
          </div>
        </div>

        {/* ======================= MAIN MAP CONTAINER ======================= */}
        <div className="order-2 lg:order-1 lg:col-span-2 lg:col-start-1 h-full">
          <div className="bg-slate-300 rounded-3xl h-[45vh] sm:h-[50vh] lg:h-[65vh] relative overflow-hidden shadow-lg border-4 border-white group">
            
            {isFetchingDynamic && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-indigo-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 animate-in slide-in-from-top-4">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-ping"></div> Fetching area...
              </div>
            )}

            {/* LIVE INDICATOR: shown while the realtime price channel is connected */}
            {isLive && (
              <div className="absolute top-4 left-4 z-40 bg-white/90 backdrop-blur text-indigo-950 text-[10px] font-black px-2.5 py-1 rounded-full shadow-md flex items-center gap-1.5 uppercase tracking-widest pointer-events-none" title="Prices update live as the community reports them">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
                </span>
                Live
              </div>
            )}

            {/* LOCATE ME BUTTON */}
            <button
              onClick={handleLocateMe}
              className="absolute bottom-6 left-4 z-40 bg-white hover:bg-indigo-50 text-indigo-900 p-2.5 rounded-full shadow-lg border border-slate-200 transition-all active:scale-95"
              aria-label="Center map on my location"
              title="My location"
            >
              <LocateFixed className="w-5 h-5" />
            </button>

            <GoogleMap 
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
              onIdle={handleMapIdle}
            >
              <UserLocationMarker position={userLoc} />
              
              {mergedStations.map((station) => (
                <AdvancedMarker key={station.id} position={{ lat: station.lat, lng: station.lng }} onClick={() => setSelectedStation(station)}>
                  <StationMarker 
                    name={station.name} 
                    hasPrice={station.price_pms !== null} 
                    customLogoUrl={station.custom_logo_url} 
                    price={station.price_pms} 
                    role={station.updated_by_role} 
                    lastUpdated={station.last_updated} 
                  />
                </AdvancedMarker>
              ))}

              {/* ======================= MAP INFO WINDOW ======================= */}
              {selectedStation && (
                <InfoWindow position={{ lat: selectedStation.lat, lng: selectedStation.lng }} onCloseClick={() => setSelectedStation(null)} headerDisabled={true}>
                  <div className="p-3 min-w-[240px] relative">
                    <button 
                      onClick={() => setSelectedStation(null)} 
                      className="absolute top-1 right-1 text-slate-400 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-full p-1.5 transition-colors z-10"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleShareStation(selectedStation)} 
                      className="absolute top-1 right-9 text-slate-400 hover:text-indigo-700 bg-slate-100 hover:bg-indigo-100 rounded-full p-1.5 transition-colors z-10"
                      aria-label="Share station"
                      title="Share this station"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    
                    <div className="flex justify-between items-start mb-1 pr-16">
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
                            {isStale(selectedStation.last_updated) && (
                              <span className="text-amber-500 normal-case tracking-normal ml-1">• may be outdated</span>
                            )}
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
            </GoogleMap>
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
              {sortedAndFilteredList.length === 0 && (
                <div className="col-span-full text-center py-10 text-slate-400">
                  <Droplet className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-bold">
                    {isFetchingDynamic ? "Finding stations near you..." : mergedStations.length === 0 ? "No stations loaded yet. Try moving the map." : "No stations match this filter."}
                  </p>
                </div>
              )}
            </div>
        </div>

        {/* ======================= NEEDS PRICING LIST ======================= */}
        <div className="order-4 lg:order-4 lg:col-start-3 h-fit">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h2 className="text-lg font-extrabold text-indigo-950 mb-4 flex items-center gap-2">
              <Droplet className="text-emerald-500"/> Needs Pricing Data
            </h2>
            <div className="flex flex-col gap-3">
              {needsPricing.map((station) => (
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

      {/* ======================= PERMANENT MOBILE BOTTOM CAROUSEL AD ======================= */}
      <div className="fixed bottom-0 left-0 right-0 z-[100] bg-indigo-950 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] border-t border-indigo-800 pb-2 lg:hidden">
        <div className="w-full h-[60px] flex items-center justify-center bg-indigo-950/80 relative overflow-hidden">
           <span className="text-[10px] font-bold text-indigo-300/60 uppercase tracking-widest">Mobile Carousel Ad</span>
           <div className="absolute bottom-1.5 flex gap-1.5">
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
             <div className="w-1.5 h-1.5 rounded-full bg-slate-500 opacity-50"></div>
             <div className="w-1.5 h-1.5 rounded-full bg-slate-500 opacity-50"></div>
           </div>
        </div>
      </div>

      {/* ======================= GLOBAL FOOTER ======================= */}
      <footer className="bg-slate-900 text-slate-400 pt-8 pb-28 lg:pb-8 text-center text-sm mt-8 border-t border-slate-800 w-full">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Droplet className="w-4 h-4 text-emerald-500 fill-emerald-500" />
            {/* NEW AMBIGRAM FOOTER LOGO */}
            <div className="h-6 text-emerald-400">
              <svg viewBox="0 0 400 100" className="h-full w-auto" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="40" cy="50" r="26" />
                <path d="M66,50 V95" />
                <circle cx="120" cy="50" r="26" />
                <path d="M170,24 H230 L170,76 H230" />
                <circle cx="280" cy="50" r="26" />
                <path d="M334,5 V50" />
                <circle cx="360" cy="50" r="26" />
                <circle cx="360" cy="50" r="8" fill="currentColor" stroke="none" className="animate-pulse text-emerald-500" />
              </svg>
            </div>
            
            <span className="text-slate-500 ml-2">© {new Date().getFullYear()} All rights reserved.</span>
          </div>
          <div className="flex gap-6 font-bold text-xs flex-wrap justify-center">
            <a href="#" className="hover:text-emerald-400 transition-colors">About Us</a>
            <a href="/privacy" className="hover:text-emerald-400 transition-colors">Privacy Policy</a>
            <a href="/terms" className="hover:text-emerald-400 transition-colors">Terms of Service</a>
            <a href={`mailto:${SITE.contactEmail}`} className="hover:text-emerald-400 transition-colors">Contact</a>
          </div>
        </div>
      </footer>

      {showPriceForm && selectedStation && <PriceUpdateModal station={selectedStation} onClose={() => setShowPriceForm(false)} onSaved={handleStationSaved} />}
      {showClaimForm && selectedStation && <ClaimStationModal station={selectedStation} onClose={() => setShowClaimForm(false)} onSaved={handleClaimSaved} />}
      {showRateForm && selectedStation && <RateStationModal station={selectedStation} onClose={() => setShowRateForm(false)} onSaved={handleStationSaved} />}

      {/* ======================= TOAST NOTIFICATION ======================= */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl shadow-2xl text-sm font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-[90vw] ${toast.type === 'success' ? 'bg-indigo-950 text-emerald-300 border border-emerald-500/30' : 'bg-red-600 text-white'}`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}