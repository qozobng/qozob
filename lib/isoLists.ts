// =========================================================================
// ISO PICK-LISTS (countries, currencies) built from the browser's own data
// (Intl.DisplayNames / Intl.supportedValuesOf), so admins pick instead of
// typing codes like "GH" or "GHS" by hand. Nothing here is hard-coded except
// a short fallback for very old browsers.
// =========================================================================

export interface IsoOption { code: string; name: string }

// Region codes that are groupings, not countries
const NOT_COUNTRIES = new Set(['EU', 'EZ', 'UN', 'QO', 'ZZ', 'XA', 'XB']);
const FALLBACK_CURRENCIES = ['NGN', 'GHS', 'XOF', 'XAF', 'CDF', 'LRD', 'SLE', 'GMD', 'KES', 'UGX', 'TZS', 'RWF', 'ETB', 'ZAR', 'ZMW',
  'ZWG', 'MZN', 'MWK', 'BWP', 'NAD', 'AOA', 'EGP', 'MAD', 'DZD', 'TND', 'USD', 'EUR', 'GBP'];

let countryCache: IsoOption[] | null = null;
let currencyCache: IsoOption[] | null = null;

/** Every ISO 3166 country/territory with its English name, A→Z. */
export function isoCountries(): IsoOption[] {
  if (countryCache) return countryCache;
  const out: IsoOption[] = [];
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        if (NOT_COUNTRIES.has(code)) continue;
        const name = dn.of(code);
        if (name && name !== code) out.push({ code, name });
      }
    }
  } catch { /* very old browser: empty list → form falls back to typing */ }
  countryCache = out.sort((x, y) => x.name.localeCompare(y.name));
  return countryCache;
}

/** ISO 4217 currencies with English names, A→Z by code. */
export function isoCurrencies(): IsoOption[] {
  if (currencyCache) return currencyCache;
  let codes: string[] = FALLBACK_CURRENCIES;
  const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  try { if (supported) codes = supported('currency'); } catch { /* keep fallback */ }
  let names: Intl.DisplayNames | null = null;
  try { names = new Intl.DisplayNames(['en'], { type: 'currency' }); } catch { /* no names */ }
  currencyCache = [...new Set(codes)].sort().map(code => ({ code, name: names?.of(code) || code }));
  return currencyCache;
}

/** Names used for local areas in different countries (admin pick-list). */
export const AREA_LABELS = [
  'LGA', 'District', 'County', 'Department', 'Province', 'Municipality', 'Region', 'Prefecture', 'Commune',
  'Cercle', 'Territory', 'Zone', 'Constituency', 'Markaz', 'Delegation',
];

