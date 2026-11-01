import type { HazardType } from '@shared/domain';

/** Icon-first hazard picker: big emoji + short label (labels come from i18n `hazards.*`). */
export const HAZARD_ICONS: Record<HazardType, { icon: string; ring: string }> = {
  pinch_jam: { icon: '✋', ring: 'border-red-600' },
  forklift: { icon: '🚜', ring: 'border-amber-500' },
  chemical_spill: { icon: '🧪', ring: 'border-fuchsia-600' },
  slip_trip: { icon: '⚠️', ring: 'border-yellow-500' },
  manual_handling: { icon: '📦', ring: 'border-sky-600' },
  electrical_lockout: { icon: '⚡', ring: 'border-orange-500' },
  other: { icon: '❓', ring: 'border-slate-500' },
};
