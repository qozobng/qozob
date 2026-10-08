"use client";

import React, { useState, useEffect, Suspense, useCallback, useMemo, useRef, memo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
  Navigation, Droplet, ShieldCheck, Clock,
  X, UploadCloud, AlertTriangle, Search, Filter, ArrowUpDown, Star, Menu, LogOut, User as UserIcon, Settings,
  Share2, LocateFixed, CheckCircle2, TrendingDown, LayoutDashboard
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
import { Wordmark } from '@/components/Wordmark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ui, cx } from '@/lib/ui';

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

type PriceSource = 'community' | 'owner' | 'rep';

function priceSource(role: string | null | undefined): PriceSource {
  const cleanRole = (role || '').replace(/['"]/g, '').trim().toLowerCase();
  if (cleanRole === 'qozob rep') return 'rep';
  if (cleanRole === 'owner') return 'owner';
  return 'community';
}

// Map pills sit on the (always light) Google map: fixed colours, white text, all ≥ 4.5:1.
const PILL_COLORS: Record<PriceSource, string> = { community: '#B45309', owner: '#1D4ED8', rep: '#0F7B5F' };

const PRICE_SOURCE_LABEL: Record<PriceSource, string> = { community: 'Community', owner: 'Station owner', rep: 'Qozob rep' };

/** Theme-aware colour for price text on cards (see --src-* in globals.css). */
function getPriceColor(role: string | null | undefined): string {
  return `var(--src-${priceSource(role)})`;
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
      <div className="theme-light relative flex h-8 w-8 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-75"></span>
        <span className="relative inline-flex h-4 w-4 rounded-full bg-info border-2 border-white shadow-lg"></span>
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
  const pillBg = PILL_COLORS[priceSource(role)];

  return (
    <div className="theme-light relative flex flex-col items-center">
      <div className={`relative flex items-center justify-center w-10 h-10 rounded-full shadow-lg border-2 border-white bg-white overflow-hidden transition-all duration-300 hover:scale-125 ${!hasPrice ? 'grayscale opacity-70 scale-90' : 'scale-110 z-10'}`}>
        <BrandLogo name={name} customLogoUrl={customLogoUrl} size={40} imgClassName="rounded-full p-0.5" />
      </div>
      {hasPrice && price !== null && price !== undefined ? (
        // PRICE PILL: lets users compare prices at a glance without tapping each station
        <span
          title={stale ? 'Price may be outdated' : undefined}
          className={`relative z-20 -mt-1.5 px-1.5 py-0.5 rounded-md border border-white shadow-md text-xs font-semibold tabular leading-none whitespace-nowrap ${stale ? 'opacity-70' : ''}`}
          style={{ backgroundColor: pillBg, color: '#FFFFFF' }}
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
    <div className="flex-shrink-0 w-10 h-10 rounded-full border border-line bg-surface flex items-center justify-center overflow-hidden shadow-sm mr-3">
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
    <div className={ui.overlay} role="dialog" aria-modal="true" aria-labelledby="price-modal-title">
      <div className={cx(ui.modal, 'max-w-sm p-6 sm:p-7')}>
        <button onClick={onClose} className={ui.modalClose} aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        <h2 id="price-modal-title" className={cx(ui.h2, 'text-xl pr-8')}>
          {station.price_pms ? 'Update price' : 'Add the first price'}
        </h2>
        <p className="text-sm text-fg-muted mt-1 mb-6 pr-8">{station.name}</p>

        <div className="space-y-4">
          <div>
            <label htmlFor="pms-price" className={ui.label}>PMS price per litre (₦)</label>
            <input 
              id="pms-price"
              type="number" 
              inputMode="decimal"
              step="0.01" 
              value={suggestedPrice} 
              onChange={(e) => setSuggestedPrice(e.target.value)} 
              className={cx(ui.input, 'h-14 text-2xl font-semibold tabular')} 
              placeholder="e.g. 950" 
            />
          </div>
          
          <div>
            <label htmlFor="queue-status" className={ui.label}>Queue right now</label>
            <select 
              id="queue-status"
              value={suggestedQueue} 
              onChange={(e) => setSuggestedQueue(e.target.value)} 
              className={ui.select}
            >
              <option value="No Queue">No queue</option>
              <option value="Moderate">Moderate</option>
              <option value="Heavy">Heavy queue</option>
              <option value="No Fuel">No fuel</option>
            </select>
          </div>

          <button 
            onClick={handleSuggestPrice} 
            disabled={!suggestedPrice || isSubmittingPrice} 
            className={cx(ui.btn, ui.btnLg, ui.btnPrimary, 'w-full mt-2')}
          >
            {isSubmittingPrice ? "Saving…" : "Submit price"}
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
    <div className={ui.overlay} role="dialog" aria-modal="true" aria-labelledby="claim-modal-title">
      <div className={cx(ui.modal, 'max-w-md p-6 sm:p-7 overflow-y-auto max-h-[90vh]')}>
        <button onClick={onClose} className={ui.modalClose} aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        <h2 id="claim-modal-title" className={cx(ui.h2, 'text-xl pr-8')}>Claim this station</h2>
        <p className="text-sm text-fg-muted mt-1 mb-6 pr-8">Verify that you own or manage <strong className="font-semibold text-fg">{station.name}</strong>. We review every claim.</p>
        
        <div className="space-y-4">
          <div>
            <label htmlFor="claim-name" className={ui.label}>
              Your full name <span className="text-danger" aria-hidden>*</span>
            </label>
            <input 
              id="claim-name"
              type="text" 
              autoComplete="name"
              value={applicantName} 
              onChange={(e) => setApplicantName(e.target.value)} 
              className={ui.input} 
              placeholder="e.g. Adebayo Johnson" 
            />
          </div>

          <div>
            <label htmlFor="claim-phone" className={ui.label}>
              Contact phone <span className="text-danger" aria-hidden>*</span>
            </label>
            <input 
              id="claim-phone"
              type="tel" 
              autoComplete="tel"
              value={phone} 
              onChange={(e) => setPhone(e.target.value)} 
              className={ui.input} 
              placeholder="08012345678" 
            />
          </div>
          
          <div>
            <label htmlFor="claim-cac" className={ui.label}>
              CAC registration number <span className="text-danger" aria-hidden>*</span>
            </label>
            <input 
              id="claim-cac"
              type="text" 
              value={cacNumber} 
              onChange={(e) => setCacNumber(e.target.value)} 
              className={ui.input} 
              placeholder="RC-123456" 
            />
          </div>
          
          <div>
            <label htmlFor="claim-file" className={cx(ui.label, 'flex items-center gap-1.5')}>
              <UploadCloud className="w-4 h-4 text-fg-muted" aria-hidden /> CAC certificate <span className="text-danger" aria-hidden>*</span>
            </label>
            <input 
              id="claim-file"
              type="file" 
              accept=".pdf, image/jpeg, image/png" 
              onChange={(e) => setCacFile(e.target.files ? e.target.files[0] : null)} 
              className={ui.file} 
            />
            <p className={ui.hint}>PDF, JPG or PNG. Stored privately; only Qozob reviewers can open it.</p>
          </div>
        </div>

        <button 
          onClick={handleFinalSubmitClaim} 
          disabled={isSubmittingClaim} 
          className={cx(ui.btn, ui.btnLg, ui.btnPrimary, 'w-full mt-6')}
        >
          {isSubmittingClaim ? "Uploading…" : "Submit claim"}
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
    <div className={ui.overlay} role="dialog" aria-modal="true" aria-labelledby="rate-modal-title">
      <div className={cx(ui.modal, 'max-w-sm p-6 sm:p-7')}>
        <button onClick={onClose} className={ui.modalClose} aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        <h2 id="rate-modal-title" className={cx(ui.h2, 'text-xl pr-8')}>Rate pump accuracy</h2>
        <p className="text-sm text-fg-muted mt-1 mb-6 pr-8">{station.name}</p>
        
        <div className="rounded-lg border border-line bg-surface-2 p-4 mb-6">
          <p className="text-sm text-fg text-center mb-4">
            If you paid for 5 litres here, how accurate was the pump?
          </p>
          
          <div className="flex justify-center gap-1.5" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                role="radio"
                aria-checked={selectedStar === star}
                aria-label={`${star} star${star > 1 ? 's' : ''}`}
                onMouseEnter={() => setHoveredStar(star)}
                onMouseLeave={() => setHoveredStar(0)}
                onClick={() => setSelectedStar(star)}
                className="p-1 rounded-md transition-transform hover:scale-110 duration-200"
              >
                <Star 
                  className={`w-9 h-9 ${
                    star <= (hoveredStar || selectedStar) 
                      ? 'fill-star text-star' 
                      : 'text-line-strong'
                  } transition-colors`} 
                />
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-between text-xs text-fg-muted">
            <span>1 · Short-changed</span>
            <span>5 · Accurate</span>
          </div>
        </div>

        <button 
          onClick={handleSubmitRating} 
          disabled={selectedStar === 0 || isSubmitting} 
          className={cx(ui.btn, ui.btnLg, ui.btnPrimary, 'w-full')}
        >
          {isSubmitting ? "Submitting…" : "Submit rating"}
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
      <Suspense fallback={<div className="min-h-screen bg-surface-2" />}>
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

  // One responsive layout for the two hero cards (best price / nearest), on surface tokens so
  // the source-coloured price always has AA contrast in light and dark mode.
  const renderHeroCard = (station: Station, kind: 'best' | 'nearest') => {
    const isBest = kind === 'best';
    return (
      <div className={cx(ui.card, 'relative overflow-hidden p-4 lg:p-5 lg:flex-1 flex flex-col gap-3')}>
        <span aria-hidden className={cx('absolute inset-y-0 left-0 w-1', isBest ? 'bg-accent-solid' : 'bg-info')} />
        <div className="flex items-center justify-between gap-3">
          <span className={cx('inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em]', isBest ? 'text-accent' : 'text-info')}>
            {isBest ? <TrendingDown className="w-3.5 h-3.5" aria-hidden /> : <Navigation className="w-3.5 h-3.5" aria-hidden />}
            {isBest ? 'Best price nearby' : 'Nearest station'}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
            <Clock className="w-3 h-3" aria-hidden /> {timeAgo(station.last_updated)}
          </span>
        </div>

        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            className="min-w-0 text-left group rounded-md"
            onClick={() => { setSelectedStation(station); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            title={station.name}
          >
            <span className="block text-base lg:text-lg font-semibold text-fg leading-snug truncate group-hover:underline underline-offset-4">{station.name}</span>
            <span className="block text-sm text-fg-muted truncate mt-0.5">{distancePrefix(station.distance)}{station.queue_status}</span>
          </button>
          <div className="text-right shrink-0">
            <div className="text-2xl font-semibold tabular leading-none" style={{ color: getPriceColor(station.updated_by_role) }}>
              {formatPrice(station.price_pms, "text-sm")}
            </div>
            <span className="mt-1.5 block text-xs text-fg-subtle">{PRICE_SOURCE_LABEL[priceSource(station.updated_by_role)]} price</span>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            {isBest && heroSavings > 0 && (
              <span className="inline-flex items-center rounded-md bg-success-soft text-on-success-soft border border-success-line px-2 py-0.5 text-xs font-semibold tabular" title="Compared with the average price of stations loaded on the map">
                ₦{heroSavings.toLocaleString()} below avg
              </span>
            )}
            {station.accuracy_votes > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted" title="Pump accuracy rating">
                <Star className="w-3.5 h-3.5 fill-star text-star" aria-hidden /> {station.pump_accuracy}/5
              </span>
            )}
          </div>
          <a
            href={getDirectionsUrl(station.lat, station.lng)}
            target="_blank"
            rel="noopener noreferrer"
            className={cx(ui.btn, ui.btnSm, isBest ? ui.btnPrimary : ui.btnSecondary, 'shrink-0')}
          >
            <Navigation className="w-3.5 h-3.5" aria-hidden /> Directions
          </a>
        </div>
      </div>
    );
  };

  const menuItem = 'w-full text-left px-3 h-10 text-sm font-medium text-fg hover:bg-surface-2 rounded-lg flex items-center gap-2.5 transition-colors';

  return (
    <div className="min-h-screen bg-canvas text-fg flex flex-col relative pb-20 lg:pb-0">
      
      {/* ======================= RESPONSIVE HEADER ======================= */}
      <header className="bg-brand text-on-brand sticky top-0 z-50 shadow-[0_1px_0_var(--brand-line)]">

        {/* 1. TOP ROW: Wordmark, desktop ad space, theme + account */}
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 sm:gap-6">
          
          <button
            type="button"
            className="flex-shrink-0 rounded-md"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Qozob — back to top"
          >
            <Wordmark tone="brand" size="lg" />
          </button>
          
          {/* DESKTOP AD SPACE (Hidden on Mobile) */}
          <div className="hidden lg:flex flex-1 max-w-[728px] h-[90px] border border-dashed border-brand-line rounded-lg items-center justify-center mx-4">
            <span className="text-xs font-medium text-on-brand-muted uppercase tracking-[0.08em]">
              Advertisement
            </span>
          </div>

          {/* THEME + USER PROFILE & MENU */}
          <div className="flex-shrink-0 flex items-center gap-2">
            <ThemeToggle tone="brand" />
            {user ? (
              <div className="relative" ref={menuRef}>
                <button 
                  onClick={() => setIsMenuOpen(!isMenuOpen)} 
                  aria-label="Account menu"
                  aria-expanded={isMenuOpen}
                  className="inline-flex items-center gap-2 h-9 pl-1 pr-2 sm:pr-3 rounded-lg border border-on-brand/20 bg-on-brand/5 hover:bg-on-brand/10 text-on-brand text-sm font-medium transition-colors"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-accent text-brand text-xs font-bold uppercase" aria-hidden>
                    {(user.email || '?').charAt(0)}
                  </span>
                  <span className="truncate max-w-[120px] hidden sm:inline-block">{user.email}</span>
                  <Menu className="w-4 h-4 text-on-brand-muted sm:hidden" aria-hidden />
                </button>

                {isMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-surface text-fg rounded-xl shadow-lg border border-line overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                    <div className="p-4 border-b border-line">
                      <p className={ui.eyebrow}>Signed in as</p>
                      <p className="text-sm font-medium text-fg truncate mt-1">{user.email}</p>
                      <p className="mt-2 inline-flex flex-wrap items-center gap-1 rounded-md bg-surface-2 border border-line px-2 py-0.5 text-xs font-medium text-fg-muted">
                        {userRole}{requestedManager && <span className="text-warning">· Manager access pending</span>}
                      </p>
                    </div>
                    <div className="p-2 flex flex-col gap-0.5">
                      
                      {userRole === 'Admin' && (
                        <button onClick={() => router.push('/admin')} className={menuItem}>
                          <ShieldCheck className="w-4 h-4 text-accent" aria-hidden /> Admin dashboard
                        </button>
                      )}

                      {(userRole === 'Manager' || requestedManager) ? (
                        <button onClick={() => router.push('/dashboard')} className={menuItem}>
                          <LayoutDashboard className="w-4 h-4 text-fg-muted" aria-hidden /> Station dashboard
                        </button>
                      ) : (
                        <button onClick={() => router.push('/user-dashboard')} className={menuItem}>
                          <LayoutDashboard className="w-4 h-4 text-fg-muted" aria-hidden /> My dashboard
                        </button>
                      )}

                      {userRole !== 'Manager' && (
                        <>
                          <button onClick={() => router.push('/user-dashboard?tab=contributions')} className={menuItem}>
                            <UserIcon className="w-4 h-4 text-fg-muted" aria-hidden /> My contributions
                          </button>
                          <button onClick={() => router.push('/user-dashboard?tab=settings')} className={menuItem}>
                            <Settings className="w-4 h-4 text-fg-muted" aria-hidden /> Account settings
                          </button>
                        </>
                      )}

                      <div className="h-px bg-line my-1"></div>
                      <button onClick={handleSignOut} className={cx(menuItem, 'text-danger hover:bg-danger-soft')}>
                        <LogOut className="w-4 h-4" aria-hidden /> Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button 
                onClick={() => router.push('/login')} 
                className={cx(ui.btn, 'h-9 px-4', ui.btnAccent, 'whitespace-nowrap')}
              >
                Sign in
              </button>
            )}
          </div>
        </div>

        {/* 2. BOTTOM ROW: Location search */}
        <div className="border-t border-brand-line px-4 py-3">
          <div className="w-full max-w-2xl mx-auto relative">
             <input 
                type="text" 
                id="smart-search-input"
                ref={searchInputRef}
                aria-label="Search location"
                enterKeyHint="search"
                placeholder="Search a street, LGA or landmark" 
                onKeyDown={(e) => { 
                  if (e.key === 'Enter') handleLocationSearch((e.target as HTMLInputElement).value) 
                }}
                className="w-full h-11 bg-brand-2 border border-brand-line rounded-lg pl-10 pr-24 text-sm text-on-brand placeholder:text-on-brand-muted outline-none focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/20 transition-colors"
              />
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-on-brand-muted pointer-events-none" aria-hidden />
              <button 
                onClick={() => handleLocationSearch(searchInputRef.current?.value || "")} 
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 px-4 rounded-md bg-accent-solid text-on-accent text-sm font-semibold hover:bg-accent-hover transition-colors"
              >
                Search
              </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full p-4 flex flex-col lg:grid lg:grid-cols-3 gap-6 mt-2 flex-grow">
        
        {/* ======================= HERO CARDS SECTION ======================= */}
        <div className="order-1 lg:order-2 lg:col-start-3 flex flex-col gap-3 lg:gap-4 h-fit lg:h-full z-10">
          {heroStation && renderHeroCard(heroStation, 'best')}
          {nearestStation && renderHeroCard(nearestStation, 'nearest')}
        </div>

        {/* ======================= MAIN MAP CONTAINER ======================= */}
        <div className="order-2 lg:order-1 lg:col-span-2 lg:col-start-1 h-full">
          <div className="bg-surface-3 rounded-xl h-[45vh] sm:h-[50vh] lg:h-[65vh] relative overflow-hidden border border-line shadow-[0_1px_2px_rgb(var(--shadow-color)/0.06)] group">
            
            {isFetchingDynamic && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-brand text-on-brand text-xs font-medium px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
                <span className="w-2 h-2 bg-brand-accent rounded-full animate-pulse" aria-hidden></span> Loading stations…
              </div>
            )}

            {/* LIVE INDICATOR: shown while the realtime price channel is connected */}
            {isLive && (
              <div className="theme-light absolute top-4 left-4 z-40 bg-white/95 backdrop-blur text-fg text-xs font-semibold px-2.5 py-1 rounded-full shadow-md border border-line flex items-center gap-1.5 pointer-events-none" title="Prices update live as the community reports them">
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success"></span>
                </span>
                Live
              </div>
            )}

            {/* PRICE SOURCE LEGEND (matches the pill colours on the map) */}
            <div className="theme-light absolute bottom-6 right-14 sm:right-16 z-40 hidden sm:flex items-center gap-3 bg-white/95 backdrop-blur border border-line rounded-lg shadow-md px-3 py-2 pointer-events-none">
              {(['community', 'owner', 'rep'] as PriceSource[]).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 text-xs font-medium text-fg">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PILL_COLORS[s] }} aria-hidden />
                  {PRICE_SOURCE_LABEL[s]}
                </span>
              ))}
            </div>

            {/* LOCATE ME BUTTON */}
            <button
              onClick={handleLocateMe}
              className="theme-light absolute bottom-6 left-4 z-40 bg-white hover:bg-surface-2 text-fg p-2.5 rounded-full shadow-lg border border-line transition-colors"
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
                  {/* Info windows keep Google's white frame, so the content is pinned to the light palette */}
                  <div className="theme-light p-4 min-w-[260px] max-w-[300px] relative text-fg font-sans">
                    <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                      <button 
                        onClick={() => handleShareStation(selectedStation)} 
                        className="text-fg-muted hover:text-fg hover:bg-surface-2 rounded-md p-1.5 transition-colors"
                        aria-label="Share station"
                        title="Share this station"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setSelectedStation(null)} 
                        className="text-fg-muted hover:text-fg hover:bg-surface-2 rounded-md p-1.5 transition-colors"
                        aria-label="Close"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="flex items-start gap-1.5 pr-16">
                      <h3 className="font-semibold text-fg text-base leading-snug">{selectedStation.name}</h3>
                      {selectedStation.verified && (
                        <span title="Verified price" className="flex-shrink-0 mt-0.5">
                          <ShieldCheck className="w-4 h-4 text-info" aria-label="Verified" />
                        </span>
                      )}
                    </div>
                    
                    <p className="text-xs text-fg-muted mt-1">{selectedStation.address}</p>
                    
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <a 
                        href={getDirectionsUrl(selectedStation.lat, selectedStation.lng)} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-accent text-xs font-semibold inline-flex items-center gap-1 hover:underline underline-offset-2"
                      >
                        <Navigation className="w-3 h-3" aria-hidden /> Directions{selectedStation.distance ? ` · ${selectedStation.distance} km` : ''}
                      </a>
                      {selectedStation.accuracy_votes > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted">
                          <Star className="w-3 h-3 fill-star text-star" aria-hidden /> Pump accuracy {selectedStation.pump_accuracy}/5
                        </span>
                      )}
                    </div>
                    
                    <div className="mt-3 bg-surface-2 p-3 rounded-lg border border-line flex justify-between items-end gap-3">
                      <div>
                        <p className="text-xs font-medium text-fg-muted">PMS price</p>
                        <div className="text-[28px] font-semibold tabular leading-tight flex items-baseline" style={{ color: getPriceColor(selectedStation.updated_by_role) }}>
                          {formatPrice(selectedStation.price_pms, "text-base")}
                        </div>
                        {selectedStation.price_pms && (
                          <div className="flex flex-wrap items-center gap-1 text-xs text-fg-muted">
                            <Clock className="w-3 h-3" aria-hidden /> {timeAgo(selectedStation.last_updated)} · {PRICE_SOURCE_LABEL[priceSource(selectedStation.updated_by_role)]}
                            {isStale(selectedStation.last_updated) && (
                              <span className="text-warning font-medium">· may be outdated</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-md border ${selectedStation.queue_status === 'No Queue' ? 'bg-success-soft text-on-success-soft border-success-line' : selectedStation.queue_status === 'Moderate' ? 'bg-warning-soft text-on-warning-soft border-warning-line' : selectedStation.queue_status === 'Heavy' ? 'bg-danger-soft text-on-danger-soft border-danger-line' : 'bg-surface-3 text-fg border-line'}`}>
                        {selectedStation.queue_status}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-2">
                      <button 
                        onClick={() => handleProtectedAction(() => setShowPriceForm(true))} 
                        className={cx(ui.btn, 'h-9 px-3', ui.btnPrimary, 'w-full')}
                      >
                        {selectedStation.price_pms ? "Update price" : "Add the first price"}
                      </button>
                      
                      {selectedStation.price_pms && (!user || userRole === 'User') && (
                        <button 
                          onClick={() => handleProtectedAction(() => setShowRateForm(true))} 
                          className={cx(ui.btn, 'h-9 px-3', ui.btnSecondary, 'w-full')}
                        >
                          <Star className="w-4 h-4 fill-star text-star" aria-hidden /> Rate pump accuracy
                        </button>
                      )}

                      {/* DYNAMIC CLAIM LOGIC */}
                      {selectedStation.claim_status === 'None' && (
                        <button 
                          onClick={handleDynamicClaimAction} 
                          className={cx(ui.btn, 'h-9 px-3', ui.btnGhost, 'w-full border border-dashed border-line-strong')}
                        >
                          <ShieldCheck className="w-4 h-4" aria-hidden /> Own this station? Claim it
                        </button>
                      )}
                      
                      {selectedStation.claim_status === 'Pending Review' && (
                        <button 
                          onClick={() => alert("This station is currently under review by our team.")} 
                          className="w-full h-9 rounded-lg bg-accent-soft text-on-accent-soft text-sm font-medium flex items-center justify-center gap-2 border border-accent-line"
                        >
                          <Clock className="w-4 h-4" aria-hidden /> Claim under review
                        </button>
                      )}

                      {selectedStation.claim_status === 'Claimed' && (
                         <div className="w-full h-9 rounded-lg bg-success-soft text-on-success-soft text-sm font-medium flex items-center justify-center gap-1.5 border border-success-line">
                           <ShieldCheck className="w-4 h-4" aria-hidden /> Verified owner
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
        <section className={cx(ui.card, 'order-3 lg:order-3 lg:col-span-2 lg:col-start-1 p-5 sm:p-6')} aria-labelledby="stations-heading">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-4">
              <div>
                <h2 id="stations-heading" className={ui.h2}>Stations near you</h2>
                <p className="text-sm text-fg-muted mt-0.5">{sortedAndFilteredList.length} shown</p>
              </div>
              
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <label htmlFor="list-sort" className="sr-only">Sort stations</label>
                  <select 
                    id="list-sort"
                    value={listSort} 
                    onChange={(e) => setListSort(e.target.value)} 
                    className={cx(ui.select, 'h-10 pl-9 pr-8 sm:w-auto font-medium')}
                  >
                    <option value="Distance">Nearest</option>
                    <option value="Price">Cheapest</option>
                    <option value="Rating">Highest rated</option>
                    <option value="Recent">Recently updated</option>
                    <option value="Name">Name (A–Z)</option>
                  </select>
                  <ArrowUpDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" aria-hidden />
                </div>
                
                <div className="relative flex-1 sm:flex-none">
                  <label htmlFor="list-filter" className="sr-only">Filter stations</label>
                  <select 
                    id="list-filter"
                    value={listFilter} 
                    onChange={(e) => setListFilter(e.target.value)} 
                    className={cx(ui.select, 'h-10 pl-9 pr-8 sm:w-auto font-medium')}
                  >
                    <option value="All">All stations</option>
                    <option value="Priced">With a price</option>
                    <option value="Top Rated">Rated 4+ stars</option>
                    <option value="No Queue">No queue</option>
                  </select>
                  <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" aria-hidden />
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1 pb-1">
              {sortedAndFilteredList.map((station) => (
                <button 
                  type="button"
                  key={station.id} 
                  onClick={() => { setSelectedStation(station); window.scrollTo({ top: 0, behavior: 'smooth' }); }} 
                  className="text-left flex justify-between items-center p-3.5 rounded-lg bg-surface hover:bg-surface-2 border border-line hover:border-line-strong cursor-pointer transition-colors gap-3"
                >
                  <div className="flex items-center flex-1 min-w-0">
                    <ListLogo name={station.name} customLogoUrl={station.custom_logo_url} />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-fg text-sm truncate">{station.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-fg-muted truncate">{station.distance ? `${station.distance} km away` : station.address}</p>
                        {station.accuracy_votes > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-fg-muted flex-shrink-0">
                            <Star className="w-3 h-3 fill-star text-star" aria-hidden /> {station.pump_accuracy}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-semibold tabular flex items-baseline justify-end" style={{ color: station.price_pms !== null ? getPriceColor(station.updated_by_role) : undefined }}>
                      {station.price_pms !== null ? formatPrice(station.price_pms, "text-xs") : <span className="text-sm font-medium text-fg-subtle">No price</span>}
                    </div>
                    {station.price_pms && (
                      <div className="flex items-center justify-end gap-1 text-xs text-fg-subtle mt-0.5">
                        <Clock className="w-3 h-3" aria-hidden /> {timeAgo(station.last_updated)}
                      </div>
                    )}
                  </div>
                </button>
              ))}
              {sortedAndFilteredList.length === 0 && (
                <div className="col-span-full text-center py-10">
                  <Droplet className="w-8 h-8 mx-auto mb-2 text-fg-subtle" aria-hidden />
                  <p className="text-sm font-medium text-fg-muted">
                    {isFetchingDynamic ? "Finding stations near you…" : mergedStations.length === 0 ? "No stations loaded yet. Try moving the map." : "No stations match this filter."}
                  </p>
                </div>
              )}
            </div>
        </section>

        {/* ======================= NEEDS PRICING LIST ======================= */}
        <div className="order-4 lg:order-4 lg:col-start-3 h-fit">
          <section className={cx(ui.card, 'p-5 sm:p-6')} aria-labelledby="needs-price-heading">
            <h2 id="needs-price-heading" className={ui.h2}>Help fill the gaps</h2>
            <p className="text-sm text-fg-muted mt-0.5 mb-4">These stations have no price yet.</p>
            <div className="flex flex-col gap-2">
              {needsPricing.map((station) => (
                <button 
                  type="button"
                  key={station.id} 
                  onClick={() => { setSelectedStation(station); window.scrollTo({ top: 0, behavior: 'smooth' }); }} 
                  className="text-left flex justify-between items-center p-3 rounded-lg bg-surface hover:bg-surface-2 border border-line hover:border-line-strong cursor-pointer gap-3 transition-colors"
                >
                  <div className="flex items-center flex-1 min-w-0">
                    <ListLogo name={station.name} customLogoUrl={station.custom_logo_url} />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-fg text-sm truncate">{station.name}</h3>
                      <p className="text-xs text-fg-muted truncate">{station.distance ? `${station.distance} km away` : station.address}</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-accent flex-shrink-0">Add price</span>
                </button>
              ))}
              {needsPricing.length === 0 && (
                <p className="text-sm text-fg-subtle py-4 text-center">Every nearby station has a price. Nice.</p>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* ======================= PERMANENT MOBILE BOTTOM CAROUSEL AD ======================= */}
      <div className="fixed bottom-0 left-0 right-0 z-[100] bg-brand border-t border-brand-line pb-2 lg:hidden shadow-[0_-8px_24px_rgb(0_0_0/0.25)]">
        <div className="w-full h-[60px] flex items-center justify-center relative overflow-hidden">
           <span className="text-xs font-medium text-on-brand-muted uppercase tracking-[0.08em]">Advertisement</span>
           <div className="absolute bottom-1.5 flex gap-1.5" aria-hidden>
             <div className="w-1.5 h-1.5 rounded-full bg-brand-accent"></div>
             <div className="w-1.5 h-1.5 rounded-full bg-on-brand-muted/40"></div>
             <div className="w-1.5 h-1.5 rounded-full bg-on-brand-muted/40"></div>
           </div>
        </div>
      </div>

      {/* ======================= GLOBAL FOOTER ======================= */}
      <footer className="bg-brand text-on-brand-muted pt-10 pb-28 lg:pb-10 text-sm mt-8 border-t border-brand-line w-full">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-5">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <Wordmark tone="brand" size="md" />
            <span className="text-xs">© {new Date().getFullYear()} {SITE.name}. All rights reserved.</span>
          </div>
          <nav className="flex gap-x-6 gap-y-2 font-medium text-sm flex-wrap justify-center" aria-label="Footer">
            <a href="/privacy" className="hover:text-on-brand transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-on-brand transition-colors">Terms</a>
            <a href={`mailto:${SITE.contactEmail}`} className="hover:text-on-brand transition-colors">Contact</a>
          </nav>
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
          className={`fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-[200] px-4 py-3 rounded-lg shadow-xl text-sm font-medium flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-[90vw] border ${toast.type === 'success' ? 'bg-brand text-on-brand border-brand-line' : 'bg-danger-soft text-on-danger-soft border-danger-line'}`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-brand-accent" aria-hidden /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}