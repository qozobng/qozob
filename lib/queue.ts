// =========================================================================
// Queue status: one vocabulary for the map, owner dashboard and admin panel.
// The database stores exactly these values (20261014 migrated the old
// "Moderate Queue" / "Long Queue" names).
// =========================================================================

export const QUEUE_OPTIONS = [
  { value: 'No Queue', label: 'No queue' },
  { value: 'Moderate', label: 'Moderate' },
  { value: 'Heavy',    label: 'Heavy queue' },
  { value: 'No Fuel',  label: 'No fuel' },
] as const;

export type QueueStatus = (typeof QUEUE_OPTIONS)[number]['value'] | 'Unknown';

const LEGACY: Record<string, QueueStatus> = {
  'no queue': 'No Queue', 'normal': 'No Queue', 'short queue': 'No Queue', 'none': 'No Queue',
  'moderate': 'Moderate', 'moderate queue': 'Moderate',
  'heavy': 'Heavy', 'heavy queue': 'Heavy', 'long queue': 'Heavy', 'long': 'Heavy',
  'no fuel': 'No Fuel', 'out of fuel': 'No Fuel',
};

/** Maps any stored/legacy value to the canonical one ('Unknown' when empty or unrecognised). */
export function normaliseQueue(value: string | null | undefined): QueueStatus {
  if (!value) return 'Unknown';
  return LEGACY[value.trim().toLowerCase()] ?? 'Unknown';
}

export function queueLabel(value: string | null | undefined): string {
  const q = normaliseQueue(value);
  return QUEUE_OPTIONS.find(o => o.value === q)?.label ?? 'Not reported';
}

