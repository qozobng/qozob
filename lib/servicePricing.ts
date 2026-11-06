// =========================================================================
// AUTO-SERVICE PRICES (WITH ENGINE/BODY-TYPE TIERS & COMPREHENSIVE RATE %)
// The live price list is in the database (service_catalog + service_state_prices,
// see supabase/migrations/20261106_service_pricing.sql & 20261107_vehicle_details.sql).
// Admins change prices in Admin → Auto services → Prices; partner companies
// propose prices that go live only after an admin approves them.
// =========================================================================
import type { SupabaseClient } from '@supabase/supabase-js';
import { AUTO_SERVICE_CATALOG, type ServiceCategory, type TierPriceMap } from '@/types/services';
import type { VehicleTier } from '@/lib/vehicles';

export type VehicleUsage = 'private' | 'commercial';

export interface StatePrice {
  state: string;
  private_price: number;
  commercial_price: number | null;
  tier_prices?: TierPriceMap;
}

export interface CatalogItem {
  id: string;
  title: string;
  category: ServiceCategory;
  description: string;
  statutory: boolean;
  turnaround: string;
  private_price: number;
  /** null = same as the private price */
  commercial_price: number | null;
  tier_prices: TierPriceMap;
  rate_percent: number | null;
  min_price: number | null;
  currency: string;
  sort_order: number;
  state_prices: StatePrice[];
}

export const SERVICE_CATEGORY_LABEL: Record<ServiceCategory, string> = {
  papers_renewal: 'Papers & permits',
  new_registration: 'Registration & plates',
  auto_insurance: 'Auto insurance',
  gps_tracker: 'GPS tracker',
  fleet_solution: 'Fleet solution',
};

/** The built-in list (used until the price tables exist, and to fill in newly added services). */
export const FALLBACK_CATALOG: CatalogItem[] = AUTO_SERVICE_CATALOG.map((i, n) => ({
  id: i.id,
  title: i.title,
  category: i.category,
  description: i.description,
  statutory: i.statutory,
  turnaround: i.turnaroundDays,
  private_price: i.privatePrice,
  commercial_price: i.commercialPrice ?? null,
  tier_prices: i.tierPrices ?? {},
  rate_percent: i.ratePercent ?? null,
  min_price: i.minPrice ?? null,
  currency: 'NGN',
  sort_order: (n + 1) * 10,
  state_prices: [],
}));

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : num(v));

function parseTierPrices(raw: unknown): TierPriceMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: TierPriceMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      out[k as VehicleTier] = {
        private: numOrNull(obj.private),
        commercial: numOrNull(obj.commercial),
      };
    }
  }
  return out;
}

function tierLookup(map: TierPriceMap | undefined, tier: VehicleTier | null | undefined, usage: VehicleUsage): number | null {
  if (!map || !tier) return null;
  const entry = map[tier];
  if (!entry) return null;
  if (usage === 'commercial' && entry.commercial !== null && entry.commercial !== undefined) {
    return entry.commercial;
  }
  if (entry.private !== null && entry.private !== undefined) {
    return entry.private;
  }
  return null;
}

/**
 * Price of one service for a vehicle usage, state, engine/body-type tier, and optional vehicle value (for Comprehensive Insurance).
 * Priority:
 *  1. Percentage-of-value calculator when `rate_percent` is set and `vehicleValue > 0`
 *  2. State tier price (`state_prices.tier_prices[tier]`)
 *  3. State flat price (`state_prices.private_price / commercial_price`)
 *  4. National tier price (`tier_prices[tier]`)
 *  5. National flat price (`private_price / commercial_price`)
 */
export function effectivePrice(
  item: CatalogItem,
  usage: VehicleUsage,
  state?: string | null,
  tier?: VehicleTier | null,
  vehicleValue?: number | null,
): number {
  const sp = state ? item.state_prices.find(s => s.state.toLowerCase() === state.trim().toLowerCase()) : undefined;
  const basePriv = sp ? sp.private_price : item.private_price;
  const baseComm = sp ? sp.commercial_price : item.commercial_price;
  const baseFloor = usage === 'commercial' && baseComm !== null ? baseComm : basePriv;

  // Value-based percentage calculation (Comprehensive Auto Insurance)
  if (item.rate_percent !== null && item.rate_percent > 0) {
    const val = Number(vehicleValue || 0);
    const minFloor = Math.max(baseFloor, item.min_price ?? 0);
    if (val <= 0) return minFloor;
    const rate = usage === 'commercial' ? item.rate_percent + 1.0 : item.rate_percent;
    const calculated = Math.round((val * rate) / 100);
    return Math.max(minFloor, calculated);
  }

  // State tier price
  if (sp) {
    const stTier = tierLookup(sp.tier_prices, tier, usage);
    if (stTier !== null) return stTier;
    return baseFloor;
  }

  // National tier price
  const natTier = tierLookup(item.tier_prices, tier, usage);
  if (natTier !== null) return natTier;

  return baseFloor;
}

/** True when the state has its own price for this service. */
export function hasStatePrice(item: CatalogItem, state?: string | null): boolean {
  if (!state) return false;
  return item.state_prices.some(s => s.state.toLowerCase() === state.trim().toLowerCase());
}

/** True when this service varies its price by engine/body-type tier. */
export function hasTierPrices(item: CatalogItem, state?: string | null): boolean {
  const sp = state ? item.state_prices.find(s => s.state.toLowerCase() === state.trim().toLowerCase()) : undefined;
  if (sp && sp.tier_prices && Object.keys(sp.tier_prices).length > 0) return true;
  return Boolean(item.tier_prices && Object.keys(item.tier_prices).length > 0);
}

let cache: Promise<{ items: CatalogItem[]; live: boolean }> | null = null;

/**
 * Active services with their state prices and tier prices, in display order.
 * Gracefully falls back if 20261107 columns aren't deployed yet.
 */
export function loadServiceCatalog(supabase: SupabaseClient, force = false): Promise<{ items: CatalogItem[]; live: boolean }> {
  if (cache && !force) return cache;
  cache = (async () => {
    let cat = await supabase.from('service_catalog')
      .select('id, title, category, description, statutory, turnaround, private_price, commercial_price, tier_prices, rate_percent, min_price, currency, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true });

    let sp = await supabase.from('service_state_prices')
      .select('service_id, state, private_price, commercial_price, tier_prices');

    // Fallback if 20261107 columns (tier_prices / rate_percent / min_price) haven't been added yet
    if (cat.error && /column|tier_prices|rate_percent/i.test(cat.error.message)) {
      cat = await supabase.from('service_catalog')
        .select('id, title, category, description, statutory, turnaround, private_price, commercial_price, currency, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('title', { ascending: true }) as typeof cat;
    }
    if (sp.error && /column|tier_prices/i.test(sp.error.message)) {
      sp = await supabase.from('service_state_prices')
        .select('service_id, state, private_price, commercial_price') as typeof sp;
    }

    if (cat.error || !cat.data || cat.data.length === 0) {
      return { items: FALLBACK_CATALOG, live: false };
    }

    const byService = new Map<string, StatePrice[]>();
    for (const r of (sp.data || []) as Record<string, unknown>[]) {
      const sid = String(r.service_id);
      const list = byService.get(sid) || [];
      list.push({
        state: String(r.state),
        private_price: num(r.private_price),
        commercial_price: numOrNull(r.commercial_price),
        tier_prices: parseTierPrices(r.tier_prices),
      });
      byService.set(sid, list);
    }

    const fallbackById = new Map(FALLBACK_CATALOG.map(f => [f.id, f]));
    const items: CatalogItem[] = (cat.data as Record<string, unknown>[]).map(r => {
      const id = String(r.id);
      const fb = fallbackById.get(id);
      const dbTiers = parseTierPrices(r.tier_prices);
      const hasDbTiers = Object.keys(dbTiers).length > 0;
      return {
        id,
        title: String(r.title),
        category: r.category as ServiceCategory,
        description: (r.description as string) || '',
        statutory: Boolean(r.statutory),
        turnaround: (r.turnaround as string) || '',
        private_price: num(r.private_price),
        commercial_price: numOrNull(r.commercial_price),
        tier_prices: hasDbTiers ? dbTiers : (fb?.tier_prices ?? {}),
        rate_percent: r.rate_percent !== undefined && r.rate_percent !== null ? num(r.rate_percent) : (fb?.rate_percent ?? null),
        min_price: r.min_price !== undefined && r.min_price !== null ? num(r.min_price) : (fb?.min_price ?? null),
        currency: (r.currency as string) || 'NGN',
        sort_order: num(r.sort_order),
        state_prices: byService.get(id) || [],
      };
    });

    // If the DB only has the original 8 services (before 20261107 is run), include the 9 new built-in services too
    const seen = new Set(items.map(i => i.id));
    for (const fb of FALLBACK_CATALOG) {
      if (!seen.has(fb.id)) items.push(fb);
    }
    items.sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));

    return { items, live: true };
  })().catch(() => ({ items: FALLBACK_CATALOG, live: false }));
  return cache;
}
