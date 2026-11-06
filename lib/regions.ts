// =========================================================================
// REGIONS (countries Qozob runs in)
// Read from public.regions / public.reward_programs (20261105). Cached per
// page load. If the database update hasn't been run yet, Nigeria is assumed,
// so the app keeps working exactly as before.
// =========================================================================
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Region {
  country_code: string;
  name: string;
  default_currency: string;
  currencies: string[];
  aliases?: string[];
  price_min: number | null;
  price_max: number | null;
  is_open: boolean;
  area_label: string;
}

export interface RewardProgram {
  country_code: string;
  currency: string;
  program_active: boolean;
  monthly_prize: number;
  annual_prize: number | null;
  wht_percent: number;
  voucher_enabled: boolean;
  voucher_bonus_pct: number;
  min_active_days: number;
  annual_min_active_days: number;
  min_area_updates_quorum: number;
  min_area_stations_quorum: number;
  min_area_participants_quorum: number;
  active_payout_scope: 'all' | 'selected_areas';
  active_area_ids: number[] | null;
  note?: string | null;
}

export const HOME_COUNTRY = 'NG';

export const NIGERIA_FALLBACK: Region = {
  country_code: 'NG', name: 'Nigeria', default_currency: 'NGN', currencies: [], price_min: 300, price_max: 3000,
  is_open: true, area_label: 'LGA',
};

let regionsPromise: Promise<Record<string, Region>> | null = null;
let programsPromise: Promise<Record<string, RewardProgram>> | null = null;

/** All regions keyed by country code (cached). */
export function loadRegions(supabase: SupabaseClient, force = false): Promise<Record<string, Region>> {
  if (!regionsPromise || force) {
    regionsPromise = (async () => {
      const { data, error } = await supabase
        .from('regions')
        .select('country_code, name, default_currency, currencies, aliases, price_min, price_max, is_open, area_label')
        .order('name');
      if (error || !data?.length) return { NG: NIGERIA_FALLBACK };
      return Object.fromEntries((data as Region[]).map(r => [r.country_code, { ...r, currencies: r.currencies || [] }]));
    })();
  }
  return regionsPromise;
}

/** Reward programmes keyed by country code (cached). Empty when the update isn't run yet. */
export function loadRewardPrograms(supabase: SupabaseClient, force = false): Promise<Record<string, RewardProgram>> {
  if (!programsPromise || force) {
    programsPromise = (async () => {
      const { data, error } = await supabase.from('reward_programs').select('*');
      if (error || !data) return {};
      return Object.fromEntries((data as RewardProgram[]).map(p => [p.country_code, p]));
    })();
  }
  return programsPromise;
}

/** Currencies an owner may choose for a station in this region (default first). */
export function allowedCurrencies(region: Region | null | undefined): string[] {
  if (!region) return [];
  return [region.default_currency, ...(region.currencies || []).filter(c => c !== region.default_currency)];
}

/** Matches a free-typed country ("Nigeria", "gh", "Ivory Coast") to a region code. */
export function countryCodeFromName(input: string | null | undefined, regions: Record<string, Region>): string | null {
  const s = String(input || '').trim().toLowerCase();
  if (!s) return null;
  for (const r of Object.values(regions)) {
    if (r.country_code.toLowerCase() === s || r.name.toLowerCase() === s || (r.aliases || []).includes(s)) return r.country_code;
  }
  return null;
}

/** 🇳🇬 from "NG" (regional indicator letters; shows as letters where flags aren't supported). */
export function flagEmoji(code: string | null | undefined): string {
  const c = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '🌍';
  return String.fromCodePoint(...[...c].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

export function regionName(code: string | null | undefined, regions: Record<string, Region>): string {
  if (!code) return 'Unknown country';
  return regions[code]?.name || code;
}

