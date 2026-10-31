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
