import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Client for backend operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Station *locations* for an area change rarely (prices are loaded separately by the client),
// so let Vercel's CDN serve repeat requests for the same coordinates without invoking this function.
const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=86400' };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  
  if (!lat || !lng) {
    return NextResponse.json({ error: 'Missing coordinates' }, { status: 400 });
  }

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
  }

  // =========================================================================
  // STEP 1: CHECK SUPABASE FIRST (COST: $0.00)
  // =========================================================================
  
  // Create a rough bounding box (~5km radius) to search your database
  const latOffset = 0.045; 
  const lngOffset = 0.045;

  try {
    const { data: cachedStations, error: dbError } = await supabase
      .from('stations')
      .select('station_id, name, address, lat, lng')
      .gte('lat', latNum - latOffset)
      .lte('lat', latNum + latOffset)
      .gte('lng', lngNum - lngOffset)
      .lte('lng', lngNum + lngOffset)
      .limit(150); // Increased limit to ensure no stations are hidden in dense areas

    if (dbError) console.error("Supabase cache query error:", dbError.message);

    // If we have stations saved in this area, return them instantly!
    if (cachedStations && cachedStations.length > 2) {
      console.log(`🤑 CACHE HIT: Found ${cachedStations.length} stations in Supabase. Bypassing Google API.`);
      
      // Format them to match exactly what your frontend expects
      const formattedResults = cachedStations.map(station => ({
        place_id: station.station_id,
        name: station.name,
        vicinity: station.address,
        geometry: {
          location: {
            lat: station.lat,
            lng: station.lng
          }
        }
      }));

      return NextResponse.json({ results: formattedResults }, { headers: CACHE_HEADERS });
    }
  } catch (err) {
    console.error("Supabase cache check failed, falling back to Google:", err);
  }

  // =========================================================================
  // STEP 2: FETCH FROM GOOGLE "PLACES API (NEW)" (ZERO ATMOSPHERE COST)
  // =========================================================================
  
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
    console.error("CRITICAL ERROR: GOOGLE_MAPS_API_KEY is missing from environment variables");
    return NextResponse.json({ error: 'API key missing on server' }, { status: 500 });
  }

  // The explicit field mask absolutely blocks costly Atmosphere/Contact Data
  const fieldMask = 'places.id,places.displayName,places.formattedAddress,places.location';
  
  // Base headers for both requests
  const headers = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': apiKey,
    'X-Goog-FieldMask': fieldMask
  };

  // URL 1: Strict Category Search (Finds official gas stations)
  const nearbyUrl = `https://places.googleapis.com/v1/places:searchNearby`;
  const nearbyBody = {
    includedTypes: ["gas_station"],
    maxResultCount: 20,
    locationRestriction: {
      circle: { center: { latitude: latNum, longitude: lngNum }, radius: 5000.0 }
    }
  };

  // URL 2: Broad Keyword Search (Finds miscategorized stations and missing brands)
  const textUrl = `https://places.googleapis.com/v1/places:searchText`;
  const textBody = {
    textQuery: "MRS OR NNPC OR Bovas OR Total OR Mobil OR Oando OR Conoil OR Rainoil OR filling station OR petrol station OR fuel",
    maxResultCount: 20,
    locationBias: {
      circle: { center: { latitude: latNum, longitude: lngNum }, radius: 5000.0 }
    }
  };

  try {
    // Run BOTH API requests simultaneously for maximum speed
    const [nearbyRes, textRes] = await Promise.all([
      fetch(nearbyUrl, { method: 'POST', headers, body: JSON.stringify(nearbyBody) }),
      fetch(textUrl, { method: 'POST', headers, body: JSON.stringify(textBody) })
    ]);
    
    // Parse both bodies in parallel (a failed body parse shouldn't sink the other request)
    const [nearbyData, textData] = await Promise.all([
      nearbyRes.json().catch(() => ({})),
      textRes.json().catch(() => ({})),
    ]);
    
    if (nearbyData.error) console.error("Nearby API Error:", nearbyData.error.message);
    if (textData.error) console.error("Text API Error:", textData.error.message);

    // Combine both result arrays
    const combinedPlaces = [...(nearbyData.places || []), ...(textData.places || [])];

    // Deduplicate! Remove any station found in both searches using its unique 'id'
    // (and skip malformed places with no id or coordinates)
    const uniqueStationsMap = new Map();
    combinedPlaces.forEach((place: any) => {
      if (!place?.id || place.location?.latitude == null || place.location?.longitude == null) return;
      if (!uniqueStationsMap.has(place.id)) {
        uniqueStationsMap.set(place.id, place);
      }
    });
    const deduplicatedPlaces = Array.from(uniqueStationsMap.values());

    // Format the combined "New" API response to match our frontend structure
    const formattedResults = deduplicatedPlaces.map((place: any) => ({
      place_id: place.id,
      name: place.displayName?.text || "Unknown Station",
      vicinity: place.formattedAddress || "No address provided",
      geometry: {
        location: {
          lat: place.location?.latitude,
          lng: place.location?.longitude
        }
      }
    }));

    console.log(`📡 CACHE MISS: Fetched and merged ${formattedResults.length} unique stations from Google.`);

    // =========================================================================
    // STEP 3: SAVE GOOGLE DATA TO SUPABASE (SO IT'S FREE NEXT TIME)
    // =========================================================================
    
    if (formattedResults.length > 0) {
      const stationsToInsert = formattedResults.map((place: any) => ({
        station_id: place.place_id,
        name: place.name,
        address: place.vicinity,
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng,
        // Default values for new stations so your frontend doesn't crash
        price_pms: null,
        queue_status: 'Unknown',
        verified: false,
        updated_by_role: 'System',
        pump_accuracy: 0,
        accuracy_votes: 0,
        last_updated: 'Never'
      }));

      // Insert into DB. 'onConflict' ensures we don't duplicate existing stations
      const { error: insertError } = await supabase
        .from('stations')
        .upsert(stationsToInsert, { onConflict: 'station_id', ignoreDuplicates: true });

      if (insertError) {
        console.error("Error saving new stations to Supabase:", insertError);
      } else {
        console.log("💾 Successfully cached new Google stations into Supabase database.");
      }
    }
    
    // Only cache non-empty results so a transient Google failure isn't pinned at the CDN
    return NextResponse.json(
      { results: formattedResults },
      formattedResults.length > 0 ? { headers: CACHE_HEADERS } : undefined
    );
  } catch (error) {
    console.error("Backend fetch error:", error);
    return NextResponse.json({ error: 'Failed to fetch stations from Google' }, { status: 500 });
  }
}