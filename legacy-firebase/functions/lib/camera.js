"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportFromEvent = reportFromEvent;
/** Report fields (before triage) for a confirmed camera event. Contains no image and no person data. */
function reportFromEvent(e) {
    const hazardType = e.rule === 'forklift_person_gap' || e.rule === 'person_in_forklift_lane'
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
        transcriptStatus: 'no_audio',
        audioPath: null,
        photoPath: null,
        lang: 'en',
        shift: e.shift,
        status: 'received',
        source: 'camera',
        createdAt: e.detectedAt,
    };
}
