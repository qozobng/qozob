import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  
  if (!lat || !lng) {
    return NextResponse.json({ error: 'Missing coordinates' }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  
  // Failsafe: Check if the key is even loading
  if (!apiKey) {
    console.error("CRITICAL ERROR: GOOGLE_MAPS_API_KEY is missing from .env.local");
    return NextResponse.json({ error: 'API key missing on server' }, { status: 500 });
  }

  const radius = 5001; 
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=gas_station&key=${apiKey}`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    const data = await res.json();
    
    // --- THE DIAGNOSTIC LOGGER ---
    if (data.status !== 'OK') {
      console.error("GOOGLE API REJECTED THE REQUEST:");
      console.error("Status:", data.status);
      console.error("Error Message:", data.error_message);
    } else {
      console.log(`Successfully fetched ${data.results?.length} stations from Google.`);
    }
    
    return NextResponse.json({ results: data.results || [] });
  } catch (error) {
    console.error("Backend fetch error:", error);
    return NextResponse.json({ error: 'Failed to fetch stations from Google' }, { status: 500 });
  }
}