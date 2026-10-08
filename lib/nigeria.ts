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

export interface DialCode { code: string; label: string }

export const DIAL_CODES: DialCode[] = [
  { code: '+234', label: 'NG' },
  { code: '+233', label: 'GH' },
  { code: '+1', label: 'US' },
  { code: '+44', label: 'UK' },
];

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
