import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // 1. Grab the latitude and longitude from the request URL
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  
  if (!lat || !lng) {
    return NextResponse.json({ error: 'Missing coordinates' }, { status: 400 });
  }

  // 2. Safely grab your API key from the server environment
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const radius = 5000; // 5km search radius
  
  // 3. Build the secure Google REST API URL
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=gas_station&key=${apiKey}`;

  try {
    // 4. THE MAGIC: Fetch from Google, but CACHE the result for 3600 seconds (1 hour)
    // This protects your billing account from traffic spikes!
    const res = await fetch(url, { next: { revalidate: 3600 } });
    const data = await res.json();
    
    return NextResponse.json({ results: data.results });
  } catch (error) {
    console.error("Backend fetch error:", error);
    return NextResponse.json({ error: 'Failed to fetch stations from Google' }, { status: 500 });
  }
}