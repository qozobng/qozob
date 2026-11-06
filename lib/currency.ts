// =========================================================================
// MONEY FORMATTING (multi-currency)
// Every amount is shown in its own currency: the station's currency for fuel
// prices, the programme's currency for prizes. Uses the browser's Intl data,
// so any ISO-4217 code works (unknown symbols fall back to the code).
// =========================================================================

export const DEFAULT_CURRENCY = 'NGN';

const cache = new Map<string, { f: Intl.NumberFormat; withSymbol: boolean }>();

function formatter(currency: string, decimals: number): { f: Intl.NumberFormat; withSymbol: boolean } {
  const key = `${currency}:${decimals}`;
  let entry = cache.get(key);
  if (!entry) {
    try {
      entry = {
        f: new Intl.NumberFormat('en', {
          style: 'currency', currency, currencyDisplay: 'narrowSymbol',
          minimumFractionDigits: decimals, maximumFractionDigits: decimals,
        }),
        withSymbol: true,
      };
    } catch {
      // Very old browsers: no currencyDisplay support → plain number, code added below
      entry = { f: new Intl.NumberFormat('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }), withSymbol: false };
    }
    cache.set(key, entry);
  }
  return entry;
}

function cleanCode(currency: string | null | undefined): string {
  const c = String(currency || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : DEFAULT_CURRENCY;
}

/** Whole numbers stay whole ("₦1,250"); amounts with kobo/cents show 2 decimals ("$1.25"). */
export function formatMoney(amount: number | string | null | undefined, currency?: string | null, opts: { decimals?: number } = {}): string {
  if (amount === null || amount === undefined || amount === '' || !Number.isFinite(Number(amount))) return '—';
  const n = Number(amount);
  const code = cleanCode(currency);
  const decimals = opts.decimals ?? (Number.isInteger(n) ? 0 : 2);
  const { f, withSymbol } = formatter(code, decimals);
  return withSymbol ? f.format(n) : `${code} ${f.format(n)}`;
}

/** Symbol alone, e.g. "₦", "GH₵", "$", "F CFA". */
export function currencySymbol(currency?: string | null): string {
  const code = cleanCode(currency);
  const { f, withSymbol } = formatter(code, 0);
  if (!withSymbol) return code;
  return f.formatToParts(0).find(p => p.type === 'currency')?.value || code;
}

/** Symbol and number separately, for styled price displays (small symbol, big number). */
export function moneyParts(amount: number | string | null | undefined, currency?: string | null, opts: { decimals?: number } = {}) {
  if (amount === null || amount === undefined || amount === '' || !Number.isFinite(Number(amount))) return null;
  const n = Number(amount);
  const decimals = opts.decimals ?? (Number.isInteger(n) ? 0 : 2);
  const value = n.toLocaleString('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return { symbol: currencySymbol(currency), value };
}

/** Short label for selects: "NGN (₦)". */
export function currencyLabel(currency: string): string {
  const s = currencySymbol(currency);
  return s && s !== currency ? `${currency} (${s})` : currency;
}
