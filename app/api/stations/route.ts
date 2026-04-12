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
  // STEP 2: FETCH FROM GOOGLE (IF SUPABASE IS EMPTY)
  // =========================================================================
  
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
    console.error("CRITICAL ERROR: GOOGLE_MAPS_API_KEY is missing from .env.local");
    return NextResponse.json({ error: 'API key missing on server' }, { status: 500 });
  }

  const radius = 5001; 
  
  // THE BILLING LEAK FIX: We added the '&fields=' parameter.
  // This explicitly blocks Google from attaching expensive 'Atmosphere Data' (reviews/ratings).
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=gas_station&fields=name,geometry,vicinity,place_id&key=${apiKey}`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    const data = await res.json();
    
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error("GOOGLE API REJECTED THE REQUEST:", data.status, data.error_message);
      return NextResponse.json({ error: 'Failed to fetch stations from Google' }, { status: 500 });
    }
    
    console.log(`📡 CACHE MISS: Fetched ${data.results?.length || 0} stations from Google.`);

    // =========================================================================
    // STEP 3: SAVE GOOGLE DATA TO SUPABASE (SO IT'S FREE NEXT TIME)
    // =========================================================================
    
    if (data.results && data.results.length > 0) {
      const stationsToInsert = data.results.map((place: any) => ({
        station_id: place.place_id,
        name: place.name,
        address: place.vicinity || "No address provided",
        lat: place.geometry?.location?.lat,
        lng: place.geometry?.location?.lng,
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
    
    return NextResponse.json({ results: data.results || [] });
  } catch (error) {
    console.error("Backend fetch error:", error);
    return NextResponse.json({ error: 'Failed to fetch stations from Google' }, { status: 500 });
  }
}