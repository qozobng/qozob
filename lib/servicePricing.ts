// =========================================================================
// AUTO-SERVICE PRICES
// The live price list is in the database (service_catalog + service_state_prices,
// see supabase/migrations/20261106_service_pricing.sql). Admins change prices in
// Admin → Auto services → Prices; partner companies propose prices that go live
// only after an admin approves them.
// If the price tables are not deployed yet, the built-in list in
// types/services.ts is used so /services keeps working.
// =========================================================================
import type { SupabaseClient } from '@supabase/supabase-js';
import { AUTO_SERVICE_CATALOG, type ServiceCategory } from '@/types/services';

export type VehicleUsage = 'private' | 'commercial';

export interface StatePrice {
  state: string;
  private_price: number;
  commercial_price: number | null;
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
  currency: string;
  sort_order: number;
  state_prices: StatePrice[];
}

export const SERVICE_CATEGORY_LABEL: Record<ServiceCategory, string> = {
  papers_renewal: 'Papers renewal',
  new_registration: 'New registration',
  auto_insurance: 'Auto insurance',
  gps_tracker: 'GPS tracker',
  fleet_solution: 'Fleet solution',
};

/** The built-in list (used until the price tables exist). */
export const FALLBACK_CATALOG: CatalogItem[] = AUTO_SERVICE_CATALOG.map((i, n) => ({
  id: i.id,
  title: i.title,
  category: i.category,
  description: i.description,
  statutory: i.statutory,
  turnaround: i.turnaroundDays,
  private_price: i.privatePrice,
  commercial_price: i.commercialPrice ?? null,
  currency: 'NGN',
  sort_order: (n + 1) * 10,
  state_prices: [],
}));

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : num(v));

/** Price of one service for a vehicle type in a state (state price → national price; commercial empty → private). */
export function effectivePrice(item: CatalogItem, usage: VehicleUsage, state?: string | null): number {
  const sp = state ? item.state_prices.find(s => s.state.toLowerCase() === state.trim().toLowerCase()) : undefined;
  const priv = sp ? sp.private_price : item.private_price;
  const comm = sp ? sp.commercial_price : item.commercial_price;
  return usage === 'commercial' && comm !== null ? comm : priv;
}

/** True when the state has its own price for this service. */
export function hasStatePrice(item: CatalogItem, state?: string | null): boolean {
  if (!state) return false;
  return item.state_prices.some(s => s.state.toLowerCase() === state.trim().toLowerCase());
}

let cache: Promise<{ items: CatalogItem[]; live: boolean }> | null = null;

/**
 * Active services with their state prices, in display order.
 * `live` is false when the built-in list had to be used.
 */
export function loadServiceCatalog(supabase: SupabaseClient, force = false): Promise<{ items: CatalogItem[]; live: boolean }> {
  if (cache && !force) return cache;
  cache = (async () => {
    const [cat, sp] = await Promise.all([
      supabase.from('service_catalog')
        .select('id, title, category, description, statutory, turnaround, private_price, commercial_price, currency, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('title', { ascending: true }),
      supabase.from('service_state_prices').select('service_id, state, private_price, commercial_price'),
    ]);
    if (cat.error || !cat.data || cat.data.length === 0) {
      return { items: FALLBACK_CATALOG, live: false };
    }
    const byService = new Map<string, StatePrice[]>();
    for (const r of (sp.data || []) as { service_id: string; state: string; private_price: unknown; commercial_price: unknown }[]) {
      const list = byService.get(r.service_id) || [];
      list.push({ state: r.state, private_price: num(r.private_price), commercial_price: numOrNull(r.commercial_price) });
      byService.set(r.service_id, list);
    }
    const items: CatalogItem[] = (cat.data as Record<string, unknown>[]).map(r => ({
      id: String(r.id),
      title: String(r.title),
      category: r.category as ServiceCategory,
      description: (r.description as string) || '',
      statutory: Boolean(r.statutory),
      turnaround: (r.turnaround as string) || '',
      private_price: num(r.private_price),
      commercial_price: numOrNull(r.commercial_price),
      currency: (r.currency as string) || 'NGN',
      sort_order: num(r.sort_order),
      state_prices: byService.get(String(r.id)) || [],
    }));
    return { items, live: true };
  })().catch(() => ({ items: FALLBACK_CATALOG, live: false }));
  return cache;
}

