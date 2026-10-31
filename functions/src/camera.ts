import type { HazardType, Shift } from './domain';

export interface ConfirmedEvent {
  rule: 'forklift_person_gap' | 'hand_in_danger_zone';
  locationId: string;
  shift: Shift;
  detectedAt: Date;
}

/** Report fields (before triage) for a confirmed camera event. Contains no image and no person data. */
export function reportFromEvent(e: ConfirmedEvent) {
  const hazardType: HazardType = e.rule === 'forklift_person_gap' ? 'forklift' : 'pinch_jam';
  return {
    locationId: e.locationId,
    hazardType,
    seriousHarmFlag: false,
    injuryNow: false,
    transcript: '',
    transcriptStatus: 'no_audio' as const,
    audioPath: null,
    photoPath: null,
    lang: 'en' as const,
    shift: e.shift,
    status: 'received' as const,
    source: 'camera' as const,
    createdAt: e.detectedAt,
  };
}
