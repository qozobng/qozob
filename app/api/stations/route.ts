import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Client for backend operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  
  if (!lat || !lng) {
    return NextResponse.json({ error: 'Missing coordinates' }, { status: 400 });
  }

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);

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
      .limit(20);

    // If we have stations saved in this area, return them instantly!
    if (cachedStations && cachedStations.length > 2) {
      console.log(`🤑 CACHE HIT: Found ${cachedStations.length} stations in Supabase. Bypassing Google API.`);
      
      // Format them to match exactly what your frontend expects from Google
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

      return NextResponse.json({ results: formattedResults });
    }
  } catch (err) {
    console.error("Supabase cache check failed, falling back to Google:", err);
  }

  // =========================================================================
  // STEP 2: FETCH FROM GOOGLE "PLACES API (NEW)" (ZERO ATMOSPHERE COST)
  // =========================================================================
  
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
    console.error("CRITICAL ERROR: GOOGLE_MAPS_API_KEY is missing from .env.local");
    return NextResponse.json({ error: 'API key missing on server' }, { status: 500 });
  }

  // The New Places API Endpoint
  const url = `https://places.googleapis.com/v1/places:searchNearby`;

  // We explicitly declare the field mask. This absolutely blocks Atmosphere/Contact Data.
  const fieldMask = 'places.id,places.displayName,places.formattedAddress,places.location';

  const requestBody = {
    includedTypes: ["gas_station"],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: {
          latitude: latNum,
          longitude: lngNum
        },
        radius: 5000.0 // 5km radius
      }
    }
  };

  try {
    const res = await fetch(url, { 
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask
      },
      body: JSON.stringify(requestBody),
      next: { revalidate: 3600 } 
    });
    
    const data = await res.json();
    
    if (data.error) {
      console.error("GOOGLE API REJECTED THE REQUEST:", data.error.message);
      return NextResponse.json({ error: 'Failed to fetch stations from Google' }, { status: 500 });
    }
    
    // Format the "New" API response to match our older frontend structure
    const formattedResults = (data.places || []).map((place: any) => ({
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

    console.log(`📡 CACHE MISS: Fetched ${formattedResults.length} stations from Google.`);

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
    
    return NextResponse.json({ results: formattedResults });
  } catch (error) {
    console.error("Backend fetch error:", error);
    return NextResponse.json({ error: 'Failed to fetch stations from Google' }, { status: 500 });
  }
}