"use strict";
/** Shared types and constants. Pure: no firebase imports, so the seed script and tests can use them. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_GROUP_SIZE = exports.DEFAULTS = exports.ECO_TAGS = exports.HAZARD_TYPES = void 0;
exports.isoWeekKey = isoWeekKey;
exports.shiftForHour = shiftForHour;
exports.HAZARD_TYPES = [
    'pinch_jam',
    'forklift',
    'chemical_spill',
    'slip_trip',
    'manual_handling',
    'electrical_lockout',
    'other',
];
exports.ECO_TAGS = [
    'none',
    'air_leak',
    'steam_leak',
    'spill',
    'idle_machine',
    'material_waste',
];
/** Defaults for values that are configurable in the `assumptions` collection. All are assumptions. */
exports.DEFAULTS = {
    boardPublishDelayHours: 48,
    snapshotRetentionDays: 30,
    plantTimeZone: 'Asia/Kolkata',
};
exports.MIN_GROUP_SIZE = 5;
/** ISO week key like 2026-W44 (UTC). */
function isoWeekKey(d) {
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
function shiftForHour(hour) {
    if (hour >= 6 && hour < 14)
        return 'A';
    if (hour >= 14 && hour < 22)
        return 'B';
    return 'C';
}
