// =========================================================================
// Rewards: shared labels and helpers used by the map, /rewards, the user
// dashboard and the admin panel. Rules are enforced in the database
// (supabase/migrations/20261011_rewards.sql); this file only explains them.
// =========================================================================
import type { SupabaseClient } from '@supabase/supabase-js';

export interface RewardSettings {
  program_active: boolean;
  monthly_prize_ngn: number;
  annual_prize_ngn: number | null;
  wht_percent: number;
  min_active_days: number;
  annual_min_active_days: number;
  max_distance_m: number;
  cooldown_hours: number;
  daily_cap: number;
  coins_per_update: number;
  coins_fresh_bonus: number;
  outlier_percent: number;
  price_min: number;
  price_max: number;
  max_speed_kmh: number;
  terms_version: string;
}

export const DEFAULT_REWARD_SETTINGS: RewardSettings = {
  program_active: true, monthly_prize_ngn: 10000, annual_prize_ngn: null, wht_percent: 0,
  min_active_days: 8, annual_min_active_days: 60, max_distance_m: 1000, cooldown_hours: 6, daily_cap: 20,
  coins_per_update: 10, coins_fresh_bonus: 5, outlier_percent: 25, price_min: 300, price_max: 3000,
  max_speed_kmh: 150, terms_version: '2026-10',
};

export interface ReportResult {
  id: number;
  status: 'accepted' | 'held' | 'rejected' | 'no_reward';
  coins: number;
  reasons: string[];
  distance_m: number | null;
  lga: string | null;
}

/** Plain-language explanations for each check (shown to the person who reported). */
export const REASON_TEXT: Record<string, string> = {
  fresh_bonus: 'Bonus: first update at this station in 24 hours',
  not_eligible: 'Qozob staff, reps and station owners/managers do not earn coins',
  programme_paused: 'The rewards programme is paused right now',
  price_out_of_range: 'That price is outside the believable range',
  no_location: 'Turn on location so we can confirm you are at the station',
  too_far: 'You need to be at the station (within about 1 km) to earn coins',
  weak_gps: 'Your GPS signal was too weak to confirm you are at the station',
  station_location_unknown: 'This station has no map position yet, so we could not confirm your visit',
  impossible_travel: 'Your location moved too fast since your last update, so this needs a quick review',
  cooldown: 'You already earned coins at this station recently (one every few hours)',
  daily_cap: 'You reached today\u2019s limit of rewarded updates',
  price_outlier: 'This price is very different from nearby prices, so a reviewer will check it',
};

export function describeReport(r: ReportResult): string {
  const lga = r.lga ? ` in ${r.lga}` : '';
  if (r.status === 'accepted') return `+${r.coins} coins${lga}! Thanks for keeping prices fresh.`;
  if (r.status === 'held') return `+${r.coins} coins pending review${lga}. ${REASON_TEXT[r.reasons.find(x => x !== 'fresh_bonus') || ''] || ''}`.trim();
  const why = r.reasons.filter(x => x !== 'fresh_bonus').map(x => REASON_TEXT[x]).filter(Boolean)[0];
  return `Price saved. No coins this time${why ? `: ${why.charAt(0).toLowerCase()}${why.slice(1)}` : ''}.`;
}

export const ID_TYPES: { value: 'nin' | 'voters_card' | 'drivers_licence' | 'passport'; label: string; hint: string }[] = [
  { value: 'nin', label: 'NIN slip / National ID card', hint: '11-digit NIN' },
  { value: 'voters_card', label: "Voter's card (PVC)", hint: 'VIN on the card' },
  { value: 'drivers_licence', label: "Driver's licence", hint: 'Licence number' },
  { value: 'passport', label: 'International passport', hint: 'Passport number' },
];

/** Common Nigerian banks and licensed payment banks / MFBs people use for transfers. */
export const NIGERIAN_BANKS = [
  'Access Bank', 'Citibank Nigeria', 'Ecobank Nigeria', 'Fidelity Bank', 'First Bank of Nigeria', 'First City Monument Bank (FCMB)',
  'Globus Bank', 'Guaranty Trust Bank (GTBank)', 'Jaiz Bank', 'Keystone Bank', 'Kuda Microfinance Bank', 'Lotus Bank',
  'Moniepoint Microfinance Bank', 'OPay', 'Optimus Bank', 'PalmPay', 'Parallex Bank', 'Polaris Bank', 'Premium Trust Bank',
  'Providus Bank', 'Signature Bank', 'Stanbic IBTC Bank', 'Standard Chartered Bank', 'Sterling Bank', 'SunTrust Bank',
  'Taj Bank', 'Titan Trust Bank', 'Union Bank of Nigeria', 'United Bank for Africa (UBA)', 'Unity Bank', 'VFD Microfinance Bank',
  'Wema Bank (incl. ALAT)', 'Zenith Bank',
];

export const naira = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `\u20A6${Math.round(Number(n)).toLocaleString('en-NG')}`;

/** Nigeria is UTC+1 all year. */
export function lagosToday(): Date {
  const now = new Date(Date.now() + 60 * 60 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function monthRange(offset = 0) {
  const t = lagosToday();
  const start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + offset, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return { start: isoDate(start), end: isoDate(end), label: start.toLocaleDateString('en-NG', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
}
export function yearRange(offset = 0) {
  const y = lagosToday().getUTCFullYear() + offset;
  return { start: `${y}-01-01`, end: `${y}-12-31`, label: String(y) };
}

/** Best-effort GPS fix (resolves null if the person says no or it takes too long). */
export function getPosition(timeoutMs = 9000): Promise<GeolocationPosition | null> {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    let done = false;
    const finish = (p: GeolocationPosition | null) => { if (!done) { done = true; resolve(p); } };
    navigator.geolocation.getCurrentPosition(p => finish(p), () => finish(null), { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 });
    setTimeout(() => finish(null), timeoutMs + 1000);
  });
}

/** Records the reward report for a price the signed-in person has just saved. */
export async function recordPriceReport(
  supabase: SupabaseClient,
  stationId: string,
  position: GeolocationPosition | null,
): Promise<ReportResult | null> {
  const { data, error } = await supabase.rpc('record_price_report', {
    p_station_id: stationId,
    p_lat: position?.coords.latitude ?? null,
    p_lng: position?.coords.longitude ?? null,
    p_accuracy: position?.coords.accuracy ?? null,
  });
  if (error) return null;   // rewards not set up yet, or not signed in: the price itself is already saved
  return data as ReportResult;
}

