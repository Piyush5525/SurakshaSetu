import type { HazardType } from '../domain';

/**
 * Transparent triage configuration. These weights are a judgement call, NOT calibrated to any plant data.
 * They are listed as an assumption in docs/limitations.md.
 */
export const BASE_SEVERITY: Record<HazardType, number> = {
  pinch_jam: 3,
  electrical_lockout: 3,
  forklift: 3,
  chemical_spill: 2,
  slip_trip: 2,
  manual_handling: 2,
  other: 1,
};

export const HAZARD_LABEL: Record<HazardType, string> = {
  pinch_jam: 'jam clearing / pinch point',
  electrical_lockout: 'electrical / lockout',
  forklift: 'forklift / vehicle',
  chemical_spill: 'chemical / spill',
  slip_trip: 'slip / trip',
  manual_handling: 'manual handling',
  other: 'other hazard',
};

export const HIGH_RISK_LOCATION_WEIGHT = 1.5;

/** Severity at or above this is a "high-potential" near miss: supervisor fast-track, never emergency. */
export const FAST_TRACK_SEVERITY = 4;
/** An action is created automatically at or above this severity. */
export const ACTION_MIN_SEVERITY = 3;

export const ACTION_OWNER: Record<HazardType, string> = {
  pinch_jam: 'Maintenance',
  electrical_lockout: 'Maintenance',
  forklift: 'Logistics',
  chemical_spill: 'Housekeeping & EHS',
  slip_trip: 'Housekeeping & EHS',
  manual_handling: 'EHS',
  other: 'EHS',
};

/** Days until the action is due, by severity (assumed service levels). */
export const ACTION_DUE_DAYS: Record<number, number> = { 3: 7, 4: 3, 5: 1 };

/**
 * Severe-keyword list: English, Hindi (Devanagari) and Hinglish (romanised Hindi).
 * Latin terms match on word boundaries; Devanagari terms match as substrings.
 * Keyword matching is crude and can mis-fire; severity is advisory and every report is reviewable.
 */
export const SEVERE_KEYWORDS: readonly string[] = [
  // English
  'trapped',
  'stuck',
  'caught in',
  'crushed',
  'crush',
  'fire',
  'sparks',
  'smoke',
  'bleeding',
  'almost hit',
  'nearly hit',
  'electric shock',
  'shock',
  'burn',
  'burnt',
  // Hinglish
  'fas gaya',
  'fas gayi',
  'phas gaya',
  'phas gayi',
  'phans',
  'haath fas',
  'hath fas',
  'aag',
  'chingari',
  'dhuan',
  'dhua',
  'khoon',
  'bijli ka jhatka',
  'current laga',
  'karant',
  'jhatka',
  'jal gaya',
  'kat gaya',
  'takra',
  'bal bal bacha',
  'bachi',
  'girne wala',
  // Hindi (Devanagari)
  'फंस',
  'फँस',
  'हाथ फंस',
  'आग',
  'चिंगारी',
  'धुआं',
  'धुँआ',
  'खून',
  'करंट',
  'झटका',
  'जल गया',
  'कट गया',
  'कुचल',
  'टक्कर',
  'टकरा',
  'गिरने वाला',
];

export interface EcoRule {
  tag: 'air_leak' | 'steam_leak' | 'spill' | 'idle_machine' | 'material_waste';
  keywords: readonly string[];
}

/** Checked in order; the first match wins. Latin terms use word boundaries, Devanagari substrings. */
export const ECO_RULES: readonly EcoRule[] = [
  {
    tag: 'air_leak',
    keywords: [
      'hiss',
      'hissing',
      'air leak',
      'compressed air',
      'hawa leak',
      'hawa nikal',
      'सीटी',
      'हवा लीक',
      'हवा निकल',
    ],
  },
  { tag: 'steam_leak', keywords: ['steam', 'bhaap', 'bhap', 'भाप'] },
  {
    tag: 'spill',
    keywords: [
      'spill',
      'spilled',
      'puddle',
      'oil on floor',
      'gira hua',
      'tel gira',
      'फैला',
      'गिरा हुआ',
      'तेल गिरा',
      'रिसाव',
    ],
  },
  {
    tag: 'idle_machine',
    keywords: [
      'running empty',
      'running idle',
      'left on',
      'nobody there',
      'no one there',
      'khali chal',
      'chalu chhod',
      'खाली चल',
      'चालू छोड़',
    ],
  },
  {
    tag: 'material_waste',
    keywords: [
      'waste',
      'wasted',
      'scrap',
      'rejected product',
      'barbaad',
      'bekar maal',
      'बर्बाद',
      'स्क्रैप',
    ],
  },
];
