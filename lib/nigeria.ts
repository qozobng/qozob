// =========================================================================
// NIGERIA REFERENCE DATA
// State names match public.lgas.state exactly (geoBoundaries / GRID3 import),
// so they can be used for advert targeting and LGA look-ups without mapping.
// =========================================================================

export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta',
  'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'Federal Capital Territory', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano',
  'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun',
  'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
] as const;

export type NigerianState = (typeof NIGERIAN_STATES)[number];

/** Short label for the long FCT name in tight UI. */
export function stateLabel(state: string): string {
  return state === 'Federal Capital Territory' ? 'FCT (Abuja)' : state;
}

/** Matches free-typed state names ("lagos", "Abuja", "FCT", "Lagos State") to the official list. */
export function normaliseState(input: string | null | undefined): NigerianState | null {
  const s = String(input || '').trim().toLowerCase().replace(/\s+state$/, '').replace(/\s+/g, ' ');
  if (!s) return null;
  if (s === 'fct' || s === 'abuja' || s.startsWith('federal capital')) return 'Federal Capital Territory';
  if (s === 'nassarawa') return 'Nasarawa';
  return NIGERIAN_STATES.find(st => st.toLowerCase() === s) ?? null;
}

export interface DialCode { code: string; label: string; country: string }

/** Dial codes for every Qozob country (+ US/UK for the diaspora). `label` is shown in the picker. */
export const DIAL_CODES: DialCode[] = [
  { code: '+234', label: 'NG', country: 'NG' },
  { code: '+233', label: 'GH', country: 'GH' },
  { code: '+229', label: 'BJ', country: 'BJ' },
  { code: '+228', label: 'TG', country: 'TG' },
  { code: '+225', label: 'CI', country: 'CI' },
  { code: '+221', label: 'SN', country: 'SN' },
  { code: '+226', label: 'BF', country: 'BF' },
  { code: '+223', label: 'ML', country: 'ML' },
  { code: '+227', label: 'NE', country: 'NE' },
  { code: '+237', label: 'CM', country: 'CM' },
  { code: '+235', label: 'TD', country: 'TD' },
  { code: '+241', label: 'GA', country: 'GA' },
  { code: '+242', label: 'CG', country: 'CG' },
  { code: '+243', label: 'CD', country: 'CD' },
  { code: '+231', label: 'LR', country: 'LR' },
  { code: '+232', label: 'SL', country: 'SL' },
  { code: '+220', label: 'GM', country: 'GM' },
  { code: '+254', label: 'KE', country: 'KE' },
  { code: '+256', label: 'UG', country: 'UG' },
  { code: '+255', label: 'TZ', country: 'TZ' },
  { code: '+250', label: 'RW', country: 'RW' },
  { code: '+251', label: 'ET', country: 'ET' },
  { code: '+27', label: 'ZA', country: 'ZA' },
  { code: '+260', label: 'ZM', country: 'ZM' },
  { code: '+263', label: 'ZW', country: 'ZW' },
  { code: '+258', label: 'MZ', country: 'MZ' },
  { code: '+265', label: 'MW', country: 'MW' },
  { code: '+267', label: 'BW', country: 'BW' },
  { code: '+264', label: 'NA', country: 'NA' },
  { code: '+244', label: 'AO', country: 'AO' },
  { code: '+20', label: 'EG', country: 'EG' },
  { code: '+212', label: 'MA', country: 'MA' },
  { code: '+213', label: 'DZ', country: 'DZ' },
  { code: '+216', label: 'TN', country: 'TN' },
  { code: '+1', label: 'US', country: 'US' },
  { code: '+44', label: 'UK', country: 'GB' },
];

/** Dial code for a country code ("GH" → "+233"); null when not listed. */
export function dialCodeFor(countryCode: string | null | undefined): string | null {
  if (!countryCode) return null;
  return DIAL_CODES.find(d => d.country === countryCode.toUpperCase())?.code ?? null;
}

/**
 * Joins a dial code and a national number into E.164-style text.
 * "0803 123 4567" with +234 → "+2348031234567" (the trunk 0 is dropped).
 */
export function joinPhone(code: string, national: string): string {
  let digits = String(national || '').replace(/\D/g, '');
  const cc = code.replace(/\D/g, '');
  if (cc && digits.startsWith(cc) && digits.length > cc.length + 6) digits = digits.slice(cc.length);
  digits = digits.replace(/^0+/, '');
  return digits ? `${code}${digits}` : '';
}

