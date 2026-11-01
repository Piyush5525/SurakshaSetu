import type { HazardType, Shift } from './domain';

export interface ConfirmedEvent {
  rule: 'forklift_person_gap' | 'hand_in_danger_zone' | 'person_in_forklift_lane' | 'idle_machine';
  locationId: string;
  shift: Shift;
  detectedAt: Date;
}

/** Report fields (before triage) for a confirmed camera event. Contains no image and no person data. */
export function reportFromEvent(e: ConfirmedEvent) {
  const hazardType: HazardType =
    e.rule === 'forklift_person_gap' || e.rule === 'person_in_forklift_lane'
      ? 'forklift'
      : e.rule === 'idle_machine'
        ? 'other'
        : 'pinch_jam';
  // An idle-machine event carries a fixed, generated phrase so triage tags it `idle_machine` (energy).
  const transcript = e.rule === 'idle_machine' ? 'machine running empty with nobody there' : '';
  return {
    locationId: e.locationId,
    hazardType,
    seriousHarmFlag: false,
    injuryNow: false,
    transcript,
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
