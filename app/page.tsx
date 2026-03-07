"use client";
import React, { useState, useEffect } from 'react';
import { 
  Navigation, Droplet, ShieldCheck, Clock,
  X, UploadCloud, CheckCircle2, AlertTriangle, Search, Filter, ArrowUpDown, Star
} from 'lucide-react';
import { 
  APIProvider, Map, AdvancedMarker, InfoWindow, 
  useMap, useMapsLibrary 
} from '@vis.gl/react-google-maps';
import { createClient } from '@supabase/supabase-js';

// --- Supabase Setup ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl, supabaseKey);

// ---> PUT YOUR API KEY HERE <---
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string;

// --- Helpers: Distance Calculation ---
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) + 
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c).toFixed(3); 
}

// --- Helpers: Time Ago Formatter ---
function timeAgo(dateString) {
  if (!dateString || dateString === "Never") return "Never";
  if (dateString === "Just now") return "Just now";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "Recently"; 
  
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// --- Helpers: Dynamic Color by Role (Google Hex) ---
function getPriceColor(role) {
  if (!role) return '#FBBC05'; 
  const cleanRole = role.replace(/['"]/g, '').trim().toLowerCase();
  
  switch(cleanRole) {
    case 'qozob rep': return '#34A853'; // Google Green
    case 'owner': return '#4285F4';     // Google Blue
    case 'user': return '#FBBC05';      // Google Yellow
    default: return '#FBBC05';          // Default to Yellow for unknown
  }
}

// --- Dynamic Google Places Fetcher (Upgraded for 2026 API) ---
function GasStationFetcher({ onStationsFound, userLoc, searchCenter }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const centerPoint = searchCenter || userLoc || { lat: 6.5244, lng: 3.3792 };
    map.panTo(centerPoint);
    
    async function fetchNewPlaces() {
      try {
        // Import the new 2026 required Places library
        const { Place } = await window.google.maps.importLibrary("places");
        
        const request = {
          fields: ['id', 'displayName', 'location', 'formattedAddress'],
          locationRestriction: {
            center: centerPoint,
            radius: 5000,
          },
          includedPrimaryTypes: ['gas_station'],
        };
        
        // Execute the new search Nearby method
        const { places } = await Place.searchNearby(request);
        
        if (places && places.length > 0) {
          // Format the new data to perfectly match our existing Qozob app logic
          const formattedPlaces = places.map(p => ({
            place_id: p.id,
            name: p.displayName,
            vicinity: p.formattedAddress,
            geometry: {
              location: {
                lat: () => p.location.lat(),
                lng: () => p.location.lng()
              }
            }
          }));
          onStationsFound(formattedPlaces);
        }
      } catch (error) {
        console.error("Qozob Places API Error:", error);
      }
    }

    fetchNewPlaces();
  }, [map, onStationsFound, userLoc, searchCenter]);
  
  return null;
}

// --- Custom Station Marker (Clearbit Logo API with Fallback) ---
function StationMarker({ name, hasPrice }) {
  const lowerName = name?.toLowerCase() || "";
  
  let domain = null;
  let fallbackColor = "#10b981"; 
  let fallbackText = name ? name.substring(0, 2).toUpperCase() : "GS";
  
  if (lowerName.includes("nnpc")) { 
    domain = "nnpcgroup.com"; fallbackColor = "#ef4444"; fallbackText = "NN"; 
  } else if (lowerName.includes("total")) { 
    domain = "totalenergies.com"; fallbackColor = "#1e3a8a"; fallbackText = "TO"; 
  } else if (lowerName.includes("mobil")) { 
    domain = "mobil.com"; fallbackColor = "#2563eb"; fallbackText = "MO"; 
  } else if (lowerName.includes("oando")) { 
    domain = "oandoplc.com"; fallbackColor = "#dc2626"; fallbackText = "OA"; 
  } else if (lowerName.includes("conoil")) { 
    domain = "conoilplc.com"; fallbackColor = "#eab308"; fallbackText = "CO"; 
  } else if (lowerName.includes("ardova") || lowerName.includes("ap")) { 
    domain = "ardovaplc.com"; fallbackColor = "#ea580c"; fallbackText = "AP"; 
  } else if (lowerName.includes("shell")) { 
    domain = "shell.com"; fallbackColor = "#facc15"; fallbackText = "SH"; 
  }

  const logoUrl = domain ? `https://logo.clearbit.com/${domain}?size=80` : null;

  return (
    <div className={`relative flex items-center justify-center w-10 h-10 rounded-full shadow-lg border-2 border-white bg-white transition-all duration-300 ${!hasPrice ? 'grayscale opacity-70 scale-90' : 'scale-110 z-10'}`}>
      
      {logoUrl && (
        <img 
          src={logoUrl} 
          alt={name} 
          className="w-full h-full object-contain rounded-full p-0.5" 
          onError={(e) => { 
            e.target.style.display = 'none'; 
            e.target.nextSibling.style.display = 'flex'; 
          }} 
        />
      )}

      <div 
        className="w-full h-full rounded-full items-center justify-center" 
        style={{ backgroundColor: fallbackColor, display: logoUrl ? 'none' : 'flex' }}
      >
         <span className="text-white font-black text-[10px] tracking-tighter leading-none">
           {fallbackText}
         </span>
      </div>

      <div className="absolute -bottom-1.5 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white"></div>
    </div>
  );
}

// =========================================================================
// ISOLATED MODALS (Prevents Input Focus Dropping)
// =========================================================================

function PriceUpdateModal({ station, onClose }) {
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
      price_pms: parseInt(suggestedPrice),
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
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full relative shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-800"><X className="w-6 h-6" /></button>
        <h2 className="text-2xl font-black text-indigo-950 mb-1">Update Price</h2>
        <p className="text-sm text-slate-500 mb-6">{station.name}</p>
        
        <label className="text-xs font-bold text-slate-500 uppercase">PMS Price (₦)</label>
        <input 
          type="number" value={suggestedPrice} onChange={(e) => setSuggestedPrice(e.target.value)} 
          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-4 mt-1 mb-4 text-2xl font-black outline-none focus:border-emerald-500 transition-colors" 
          placeholder="e.g. 950" autoFocus 
        />
        
        <label className="text-xs font-bold text-slate-500 uppercase">Current Queue Status</label>
        <select value={suggestedQueue} onChange={(e) => setSuggestedQueue(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-4 mt-1 mb-6 outline-none cursor-pointer">
          <option value="No Queue">No Queue (Fast)</option>
          <option value="Moderate">Moderate</option>
          <option value="Heavy">Heavy Queue</option>
          <option value="No Fuel">No Fuel Dispensing</option>
        </select>

        <button onClick={handleSuggestPrice} disabled={!suggestedPrice || isSubmittingPrice} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-xl transition-all disabled:opacity-50">
          {isSubmittingPrice ? "Saving..." : "Submit to Map"}
        </button>
      </div>
    </div>
  );
}

function ClaimStationModal({ station, onClose }) {
  const [applicantName, setApplicantName] = useState("");
  const [cacNumber, setCacNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [cacFile, setCacFile] = useState(null);
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);

  const handleSendOTP = async () => { setOtpSent(true); alert(`Mock OTP sent to ${phone}. Use 123456 to test.`); };
  const handleVerifyOTP = async () => { if(otp === "123456" || otp.length === 6) setPhoneVerified(true); else alert("Invalid OTP"); };

  const handleFinalSubmitClaim = async () => {
    if (!cacFile || !applicantName || !cacNumber || !phoneVerified) return alert("Please fill all fields, verify phone, and upload CAC document.");
    setIsSubmittingClaim(true);
    try {
      const fileExt = cacFile.name.split('.').pop();
      const fileName = `cac_${station.id}_${Date.now()}.${fileExt}`;
      const { data: uploadData, error: uploadError } = await supabase.storage.from('cac_documents').upload(fileName, cacFile);
      if (uploadError) throw new Error(uploadError.message);
      const { data: publicUrlData } = supabase.storage.from('cac_documents').getPublicUrl(fileName);

      const { error: dbError } = await supabase.from('station_claims').insert({
        station_id: station.id, station_name: station.name, applicant_name: applicantName,
        applicant_role: "Manager", business_reg_number: cacNumber, official_email: "pending@email.com",
        phone_number: phone, document_url: publicUrlData.publicUrl, status: 'Pending Review'
      });
      if (dbError) throw new Error(dbError.message);

      alert("Claim submitted successfully!");
      onClose();
    } catch (err) { alert("Error: " + err.message); } 
    finally { setIsSubmittingClaim(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full relative shadow-2xl overflow-y-auto max-h-[90vh]">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-800"><X className="w-6 h-6" /></button>
        <h2 className="text-2xl font-black text-indigo-950 mb-2">Claim Station</h2>
        <p className="text-sm text-slate-500 mb-6">Verify ownership of <strong>{station.name}</strong>.</p>
        
        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 mb-4">
            <label className="text-xs font-bold text-indigo-900 uppercase flex items-center gap-2">
              1. Verify Phone {phoneVerified && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            </label>
            {!phoneVerified && (
              <div className="mt-2 flex flex-col gap-2">
                <input type="tel" disabled={otpSent} value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-3 outline-none focus:border-indigo-500" placeholder="08012345678" autoFocus />
                {!otpSent ? (
                  <button onClick={handleSendOTP} className="bg-indigo-600 text-white font-bold py-2 rounded-lg">Send OTP</button>
                ) : (
                  <div className="flex gap-2">
                    <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)} className="w-2/3 bg-white border rounded-lg p-3 text-center tracking-widest font-bold outline-none focus:border-indigo-500" placeholder="123456" maxLength={6} />
                    <button onClick={handleVerifyOTP} className="w-1/3 bg-emerald-500 text-white font-bold py-2 rounded-lg">Verify</button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={`transition-all duration-300 flex flex-col gap-1 ${!phoneVerified ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <label className="text-xs font-bold text-slate-500 uppercase mt-2">2. Applicant Name</label>
            <input type="text" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2 outline-none focus:border-indigo-500" placeholder="e.g. Adebayo Johnson" />
            <label className="text-xs font-bold text-slate-500 uppercase mt-2">CAC Reg Number</label>
            <input type="text" value={cacNumber} onChange={(e) => setCacNumber(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2 outline-none focus:border-indigo-500" placeholder="RC-123456" />
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2 mt-2"><UploadCloud className="w-4 h-4" /> Upload CAC Document (PDF/JPG)</label>
            <input type="file" accept=".pdf, image/jpeg, image/png" onChange={(e) => setCacFile(e.target.files ? e.target.files[0] : null)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 mb-4 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200" />
          </div>

          <button onClick={handleFinalSubmitClaim} disabled={!phoneVerified || isSubmittingClaim} className="w-full bg-indigo-900 text-white font-black py-4 rounded-xl transition-all disabled:opacity-50">
              {isSubmittingClaim ? "Uploading..." : "Submit Claim for Review"}
          </button>
      </div>
    </div>
  );
}

// === PUBLIC LITRE INTEGRITY RATING MODAL ===
function RateStationModal({ station, onClose }) {
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
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full relative shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-800"><X className="w-6 h-6" /></button>
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
                className="transition-transform hover:scale-110"
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

        <button onClick={handleSubmitRating} disabled={selectedStar === 0 || isSubmitting} className="w-full bg-indigo-900 hover:bg-indigo-800 text-white font-black py-4 rounded-xl transition-all disabled:opacity-50">
          {isSubmitting ? "Submitting..." : "Submit Public Rating"}
        </button>
      </div>
    </div>
  );
}

// =========================================================================
// MAIN APP COMPONENT
// =========================================================================

export default function QozobApp() {
  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <QozobLanding />
    </APIProvider>
  );
}

function QozobLanding() {
  const [googleStations, setGoogleStations] = useState([]);
  const [supabasePrices, setSupabasePrices] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const [userLoc, setUserLoc] = useState(null);
  
  const [searchCenter, setSearchCenter] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  
  const [listFilter, setListFilter] = useState("All");
  const [listSort, setListSort] = useState("Distance");

  const [showClaimForm, setShowClaimForm] = useState(false);
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [showRateForm, setShowRateForm] = useState(false);

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

  useEffect(() => {
    async function fetchPrices() {
      const { data } = await supabase.from('stations').select('*');
      if (data) setSupabasePrices(data);
    }
    fetchPrices();
  }, []);

  const mergedStations = googleStations.map(googlePlace => {
    const dbData = supabasePrices.find(db => db.station_id === googlePlace.place_id);
    const statLat = googlePlace.geometry?.location?.lat();
    const statLng = googlePlace.geometry?.location?.lng();
    const distance = userLoc ? getDistanceFromLatLonInKm(userLoc.lat, userLoc.lng, statLat, statLng) : null;

    return {
      id: googlePlace.place_id,
      name: googlePlace.name,
      address: googlePlace.vicinity,
      lat: statLat,
      lng: statLng,
      distance: distance,
      price_pms: dbData ? dbData.price_pms : null,
      queue_status: dbData ? dbData.queue_status : "Unknown",
      verified: dbData ? dbData.verified : false,
      last_updated: dbData ? dbData.last_updated : "Never",
      updated_by_role: dbData ? (dbData.updated_by_role || "User") : "User",
      pump_accuracy: dbData ? (dbData.pump_accuracy || 0) : 0, 
      accuracy_votes: dbData ? (dbData.accuracy_votes || 0) : 0 
    };
  });

  const pricedStations = mergedStations.filter(s => s.price_pms !== null);
  
  // HERO CARD SORTING (Prices + Proximity Tie-Breaker)
  const sortedByPriceAndDistance = [...pricedStations].sort((a, b) => {
    if (a.price_pms === b.price_pms) {
      const distA = parseFloat(a.distance || "0");
      const distB = parseFloat(b.distance || "0");
      
      // If proximity is identical (within half a kilometer), tie-break with Integrity Rating
      if (Math.abs(distA - distB) <= 0.5) {
        const ratingA = a.pump_accuracy || 0;
        const ratingB = b.pump_accuracy || 0;
        if (ratingA !== ratingB) {
          return ratingB - ratingA; // Push higher rated to the top
        }
      }
      return distA - distB; 
    }
    return a.price_pms - b.price_pms;
  });
  const heroStation = sortedByPriceAndDistance[0];

  // LIST FILTERING
  const filteredList = mergedStations.filter(s => {
    if (listFilter === "Priced") return s.price_pms !== null;
    if (listFilter === "No Queue") return s.queue_status === "No Queue";
    if (listFilter === "Top Rated") return (s.pump_accuracy || 0) >= 4.0; // Show 4+ stars
    return true;
  });

  // LIST SORTING
  const sortedAndFilteredList = [...filteredList].sort((a, b) => {
    if (listSort === "Distance") {
      const distA = a.distance ? parseFloat(a.distance) : 9999;
      const distB = b.distance ? parseFloat(b.distance) : 9999;
      return distA - distB; 
    }
    if (listSort === "Price") {
      const priceA = a.price_pms || 999999; 
      const priceB = b.price_pms || 999999;
      return priceA - priceB; 
    }
    if (listSort === "Recent") {
      const timeA = (a.last_updated && a.last_updated !== "Never" && a.last_updated !== "Just now") 
        ? new Date(a.last_updated).getTime() : (a.last_updated === "Just now" ? Date.now() : 0);
      const timeB = (b.last_updated && b.last_updated !== "Never" && b.last_updated !== "Just now") 
        ? new Date(b.last_updated).getTime() : (b.last_updated === "Just now" ? Date.now() : 0);
      return timeB - timeA; 
    }
    if (listSort === "Rating") {
      const ratingA = a.pump_accuracy || 0;
      const ratingB = b.pump_accuracy || 0;
      return ratingB - ratingA; // Highest rated first
    }
    if (listSort === "Name") return (a.name || "").localeCompare(b.name || "");
    return 0;
  });

  const handleLocationSearch = () => {
    if (!searchInput) return;
    if (!window.google || !window.google.maps) return alert("Map is still loading, please wait.");
    
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: searchInput }, (results, status) => {
      if (status === "OK" && results[0]) {
        setSearchCenter({ lat: results[0].geometry.location.lat(), lng: results[0].geometry.location.lng() });
      } else alert("Could not find that location.");
    });
  };

  const getDirectionsUrl = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans relative">
      
      <nav className="bg-indigo-900 text-white p-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <h1 className="text-2xl font-black tracking-tighter text-emerald-400">Qozob.</h1>
          <div className="flex-1 w-full md:max-w-md relative">
             <input 
                type="text" placeholder="Search location or station (e.g. Lekki)..." 
                value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLocationSearch()}
                className="w-full bg-white/10 border border-white/20 rounded-full py-2 pl-10 pr-16 text-sm text-white placeholder-indigo-300 focus:outline-none focus:bg-white focus:text-indigo-900 transition-all"
              />
              <Search className="w-4 h-4 absolute left-4 top-2.5 text-indigo-300" />
              <button onClick={handleLocationSearch} className="absolute right-1.5 top-1.5 bg-emerald-400 text-indigo-900 px-3 py-1 rounded-full text-xs font-bold hover:bg-emerald-300 transition-colors">Go</button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 flex flex-col lg:grid lg:grid-cols-3 gap-6 mt-4">
        
        {/* ORDER 1: Best Option Near You (Hero Card) */}
        <div className="order-1 lg:order-2 lg:col-start-3 flex flex-col h-full">
          {heroStation && (
            <div className="bg-indigo-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden border border-indigo-700 h-full">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-400 rounded-full blur-3xl opacity-20 -mr-10 -mt-10"></div>
              <div className="flex items-center gap-2 mb-2 relative z-10">
                <AlertTriangle className="text-emerald-400 w-5 h-5" />
                <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-widest">Best Option Near You</h3>
              </div>
              <h2 className="text-3xl font-black mb-1 relative z-10">{heroStation.name}</h2>
              <p className="text-indigo-200 text-sm mb-2 relative z-10">{heroStation.distance}km away • {heroStation.queue_status} Queue</p>
              
              {heroStation.accuracy_votes > 0 && (
                <div className="flex items-center gap-1 text-xs font-bold text-amber-400 mb-4 relative z-10">
                  <Star className="w-4 h-4 fill-amber-400" /> {heroStation.pump_accuracy}/5 Integrity ({heroStation.accuracy_votes} reviews)
                </div>
              )}
              
              <div className="text-5xl font-black mb-1 relative z-10" style={{ color: getPriceColor(heroStation.updated_by_role), textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
                ₦{heroStation.price_pms} <span className="text-sm font-normal text-indigo-300">/ liter</span>
              </div>
              
              <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-300 relative z-10 mb-6 uppercase tracking-wider">
                <Clock className="w-3 h-3" /> Updated {timeAgo(heroStation.last_updated)}
              </div>
              
              <a href={getDirectionsUrl(heroStation.lat, heroStation.lng)} target="_blank" rel="noopener noreferrer" className="w-full bg-emerald-400 hover:bg-emerald-300 text-indigo-950 font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-colors relative z-10 shadow-lg mt-auto">
                <Navigation className="w-5 h-5" /> Navigate Now
              </a>
            </div>
          )}
        </div>

        {/* ORDER 2: Map View */}
        <div className="order-2 lg:order-1 lg:col-span-2 lg:col-start-1 h-full">
          <div className="bg-slate-300 rounded-3xl h-[50vh] lg:h-[65vh] relative overflow-hidden shadow-lg border-4 border-white">
            <Map defaultZoom={13} center={searchCenter || userLoc || { lat: 6.5244, lng: 3.3792 }} mapId="QOZOB_MAIN_MAP" disableDefaultUI={true} gestureHandling={'greedy'}>
              <GasStationFetcher onStationsFound={setGoogleStations} userLoc={userLoc} searchCenter={searchCenter} />

              {mergedStations.map((station) => (
                <AdvancedMarker key={station.id} position={{ lat: station.lat, lng: station.lng }} onClick={() => setSelectedStation(station)}>
                  <StationMarker name={station.name} hasPrice={station.price_pms !== null} />
                </AdvancedMarker>
              ))}

              {selectedStation && (
                <InfoWindow position={{ lat: selectedStation.lat, lng: selectedStation.lng }} onCloseClick={() => setSelectedStation(null)} headerDisabled={true}>
                  <div className="p-3 min-w-[240px] font-sans">
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-extrabold text-indigo-950 text-lg">{selectedStation.name}</h3>
                      {selectedStation.verified && <ShieldCheck className="w-5 h-5 text-blue-500" title="Verified Official Price" />}
                    </div>
                    <p className="text-xs text-slate-500 mb-1">{selectedStation.address}</p>
                    
                    {selectedStation.accuracy_votes > 0 && (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-amber-500 mb-2">
                        <Star className="w-3 h-3 fill-amber-400" /> Pump Integrity: {selectedStation.pump_accuracy}/5
                      </div>
                    )}
                    
                    <a href={getDirectionsUrl(selectedStation.lat, selectedStation.lng)} target="_blank" rel="noopener noreferrer" className="text-indigo-600 text-xs font-bold flex items-center gap-1 mb-4 hover:underline">
                      <Navigation className="w-3 h-3" /> Get Directions ({selectedStation.distance ? `${selectedStation.distance}km away` : 'Calculating...'})
                    </a>
                    
                    <div className="bg-slate-50 p-3 rounded-xl mb-4 border border-slate-100 flex justify-between items-end">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Current PMS Price</p>
                        
                        <div className="text-3xl font-black mb-1" style={{ color: getPriceColor(selectedStation.updated_by_role), textShadow: selectedStation.updated_by_role === 'User' ? '0px 0px 1px rgba(0,0,0,0.2)' : 'none' }}>
                          {selectedStation.price_pms ? `₦${selectedStation.price_pms}` : "---"}
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
                      <button onClick={() => setShowPriceForm(true)} className="w-full bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold py-2 rounded-lg text-sm border border-emerald-300">
                        {selectedStation.price_pms ? "Suggest Price Update" : "Be the first to add price!"}
                      </button>
                      
                      {selectedStation.price_pms && (
                        <button onClick={() => setShowRateForm(true)} className="w-full bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold py-2 rounded-lg text-sm border border-amber-300 flex items-center justify-center gap-2">
                          <Star className="w-4 h-4 fill-amber-500" /> Rate Pump Accuracy
                        </button>
                      )}

                      <button onClick={() => setShowClaimForm(true)} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-lg text-sm flex items-center justify-center gap-2">
                        <ShieldCheck className="w-4 h-4" /> Claim This Station
                      </button>
                    </div>
                  </div>
                </InfoWindow>
              )}
            </Map>
          </div>
        </div>

        {/* ORDER 3: List of Stations */}
        <div className="order-3 lg:order-3 lg:col-span-2 lg:col-start-1 bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
           <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
             <h2 className="text-xl font-extrabold text-indigo-950 flex items-center gap-2">
               <Filter className="w-5 h-5 text-emerald-500" /> Local Stations
             </h2>
             <div className="flex flex-wrap gap-2 w-full sm:w-auto">
               <div className="relative flex-1 sm:flex-none">
                 <select value={listSort} onChange={(e) => setListSort(e.target.value)} className="w-full sm:w-auto bg-indigo-50 border border-indigo-100 text-indigo-900 rounded-lg p-2 pl-8 text-sm font-bold outline-none cursor-pointer appearance-none">
                   <option value="Distance">Nearest</option>
                   <option value="Price">Cheapest</option>
                   <option value="Rating">Highest Rated</option>
                   <option value="Recent">Recently Updated</option>
                   <option value="Name">Name (A-Z)</option>
                 </select>
                 <ArrowUpDown className="w-4 h-4 absolute left-2 top-2.5 text-indigo-500 pointer-events-none" />
               </div>
               <select value={listFilter} onChange={(e) => setListFilter(e.target.value)} className="flex-1 sm:flex-none bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm font-bold outline-none cursor-pointer">
                 <option value="All">All Found</option>
                 <option value="Priced">Priced Only</option>
                 <option value="Top Rated">Top Rated (4+ Stars)</option>
                 <option value="No Queue">No Queue</option>
               </select>
             </div>
           </div>
           
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2">
             {sortedAndFilteredList.map((station) => (
               <div key={station.id} onClick={() => { setSelectedStation(station); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex justify-between p-4 rounded-xl bg-slate-50 hover:bg-indigo-50 border border-slate-100 cursor-pointer transition-colors">
                 <div>
                   <h3 className="font-bold text-slate-800 text-sm line-clamp-1">{station.name}</h3>
                   <div className="flex items-center gap-2 mt-1">
                     <p className="text-[10px] text-slate-500 line-clamp-1">{station.distance ? `${station.distance}km away` : station.address}</p>
                     
                     {station.accuracy_votes > 0 && (
                       <div className="flex items-center text-[9px] font-bold text-amber-500">
                         <Star className="w-2.5 h-2.5 fill-amber-400 mr-0.5" /> {station.pump_accuracy}
                       </div>
                     )}
                   </div>
                 </div>
                 <div className="text-right ml-2">
                   <div className="text-lg font-black" style={{ color: getPriceColor(station.updated_by_role), textShadow: station.updated_by_role === 'User' ? '0px 0px 1px rgba(0,0,0,0.2)' : 'none' }}>
                     {station.price_pms ? `₦${station.price_pms}` : "---"}
                   </div>
                   {station.price_pms && (
                      <div className="flex items-center justify-end gap-1 text-[8px] font-bold text-slate-400 mt-0.5 uppercase tracking-tighter">
                        <Clock className="w-2.5 h-2.5" /> {timeAgo(station.last_updated)}
                      </div>
                   )}
                   {!station.price_pms && (
                     <div className="text-[9px] font-bold text-slate-400 uppercase mt-1">{station.queue_status}</div>
                   )}
                 </div>
               </div>
             ))}
           </div>
        </div>

        {/* ORDER 4: Needs Pricing Data Card */}
        <div className="order-4 lg:order-4 lg:col-start-3 h-fit">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h2 className="text-lg font-extrabold text-indigo-950 mb-4 flex items-center gap-2">
              <Droplet className="text-emerald-500"/> Needs Pricing Data
            </h2>
            <div className="flex flex-col gap-3">
              {mergedStations.filter(s => !s.price_pms).slice(0, 4).map((station) => (
                <div key={station.id} onClick={() => { setSelectedStation(station); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex justify-between p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 border border-slate-100 cursor-pointer">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm line-clamp-1">{station.name}</h3>
                    <p className="text-[10px] text-slate-500 line-clamp-1">{station.distance ? `${station.distance}km away` : station.address}</p>
                  </div>
                  <div className="text-right text-xs font-bold text-slate-400 mt-2">Update</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* ISOLATED MODALS */}
      {showPriceForm && selectedStation && <PriceUpdateModal station={selectedStation} onClose={() => setShowPriceForm(false)} />}
      {showClaimForm && selectedStation && <ClaimStationModal station={selectedStation} onClose={() => setShowClaimForm(false)} />}
      {showRateForm && selectedStation && <RateStationModal station={selectedStation} onClose={() => setShowRateForm(false)} />}
    </div>
  );
}