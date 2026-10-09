import type { SupabaseClient } from '@supabase/supabase-js';

/** A station a member has bookmarked (table: saved_stations, own rows only via RLS). */
export interface SavedStation {
  station_id: string;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

const MISSING_TABLE = /saved_stations|schema cache|does not exist/i;

/** Friendly message when the database update that adds saved stations has not been run yet. */
export function savedStationsError(message: string): string {
  return MISSING_TABLE.test(message) && /relation|schema cache|does not exist/i.test(message)
    ? 'Saving stations is not available yet. Please try again later.'
    : message;
}

export async function listSavedStations(supabase: SupabaseClient): Promise<{ rows: SavedStation[]; error: string | null }> {
  const { data, error } = await supabase
    .from('saved_stations')
    .select('station_id, name, address, lat, lng, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return { rows: [], error: savedStationsError(error.message) };
  return { rows: (data || []) as SavedStation[], error: null };
}

export async function saveStation(
  supabase: SupabaseClient,
  s: { id: string; name?: string | null; address?: string | null; lat?: number | null; lng?: number | null }
): Promise<string | null> {
  const { error } = await supabase.from('saved_stations').insert({
    station_id: s.id,
    name: s.name ? s.name.slice(0, 200) : null,
    address: s.address ? s.address.slice(0, 400) : null,
    lat: typeof s.lat === 'number' ? s.lat : null,
    lng: typeof s.lng === 'number' ? s.lng : null,
  });
  // Already saved (double tap / another tab) counts as success
  if (error && error.code !== '23505') return savedStationsError(error.message);
  return null;
}

export async function unsaveStation(supabase: SupabaseClient, stationId: string): Promise<string | null> {
  const { error } = await supabase.from('saved_stations').delete().eq('station_id', stationId);
  return error ? savedStationsError(error.message) : null;
}

