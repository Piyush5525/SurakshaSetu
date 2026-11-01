/** Shared types and constants. Pure: no firebase imports, so the seed script and tests can use them. */

export const HAZARD_TYPES = [
  'pinch_jam',
  'forklift',
  'chemical_spill',
  'slip_trip',
  'manual_handling',
  'electrical_lockout',
  'other',
] as const;
export type HazardType = (typeof HAZARD_TYPES)[number];

export const ECO_TAGS = [
  'none',
  'air_leak',
  'steam_leak',
  'spill',
  'idle_machine',
  'material_waste',
] as const;
export type EcoTag = (typeof ECO_TAGS)[number];

export type ReportStatus = 'received' | 'being_fixed' | 'fixed' | 'dismissed';
export type Shift = 'A' | 'B' | 'C';
export type Route = 'emergency' | 'supervisor_fast_track' | 'standard';

/** Defaults for values that are configurable in the `assumptions` collection. All are assumptions. */
export const DEFAULTS = {
  boardPublishDelayHours: 48,
  snapshotRetentionDays: 30,
  plantTimeZone: 'Asia/Kolkata',
} as const;

export const MIN_GROUP_SIZE = 5;

/** ISO week key like 2026-W44 (UTC). */
export function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Default shift from the local hour. ASSUMPTION: A 06-14, B 14-22, C 22-06. The worker can change it.
 */
export function shiftForHour(hour: number): Shift {
  if (hour >= 6 && hour < 14) return 'A';
  if (hour >= 14 && hour < 22) return 'B';
  return 'C';
}
