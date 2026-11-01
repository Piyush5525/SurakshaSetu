"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPEAT_HOTSPOT_DAYS = exports.REPEAT_HOTSPOT_MIN = void 0;
exports.reportsPer100WorkersPerMonth = reportsPer100WorkersPerMonth;
exports.medianHoursToClose = medianHoursToClose;
exports.pctClosedWithVisibleFix = pctClosedWithVisibleFix;
exports.repeatHotspots = repeatHotspots;
exports.weeklyTrend = weeklyTrend;
exports.hotspotCounts = hotspotCounts;
exports.estimatedSavings = estimatedSavings;
const domain_1 = require("./domain");
const DAY = 86_400_000;
/** Near-miss reports per 100 workers in the 30 days before `now`. `workers` is an assumption for the demo plant. */
function reportsPer100WorkersPerMonth(reports, workers, now) {
    if (workers <= 0)
        return null;
    const since = now.getTime() - 30 * DAY;
    const n = reports.filter((r) => r.status !== 'dismissed' && r.createdAt.getTime() >= since && r.createdAt <= now).length;
    return Math.round((n / workers) * 100 * 10) / 10;
}
/** Median hours from action creation to closure, over closed actions. null when none. */
function medianHoursToClose(actions) {
    const hrs = actions
        .filter((a) => a.status === 'closed' && a.closedAt)
        .map((a) => (a.closedAt.getTime() - a.createdAt.getTime()) / 3_600_000)
        .sort((a, b) => a - b);
    if (!hrs.length)
        return null;
    const mid = Math.floor(hrs.length / 2);
    const m = hrs.length % 2 ? hrs[mid] : (hrs[mid - 1] + hrs[mid]) / 2;
    return Math.round(m * 10) / 10;
}
/** Share of closed actions where a visible fix was made on the floor (0-100). null when none closed. */
function pctClosedWithVisibleFix(actions) {
    const closed = actions.filter((a) => a.status === 'closed');
    if (!closed.length)
        return null;
    return Math.round((closed.filter((a) => a.visibleFix).length / closed.length) * 100);
}
exports.REPEAT_HOTSPOT_MIN = 3; // ASSUMPTION: 3+ reports of the same hazard at a location in 28 days
exports.REPEAT_HOTSPOT_DAYS = 28;
/** Location x hazard pairs with at least REPEAT_HOTSPOT_MIN reports in the last 28 days. */
function repeatHotspots(reports, now) {
    const since = now.getTime() - exports.REPEAT_HOTSPOT_DAYS * DAY;
    const counts = new Map();
    for (const r of reports) {
        if (r.status === 'dismissed' || r.createdAt.getTime() < since)
            continue;
        const k = `${r.locationId}|${r.hazardType}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()]
        .filter(([, c]) => c >= exports.REPEAT_HOTSPOT_MIN)
        .map(([k, count]) => {
        const [locationId, hazardType] = k.split('|');
        return { locationId, hazardType, count };
    })
        .sort((a, b) => b.count - a.count);
}
/** Reports per ISO week, oldest first, including empty weeks between first and last. */
function weeklyTrend(reports, now, weeks = 8) {
    const keys = [];
    for (let i = weeks - 1; i >= 0; i--)
        keys.push((0, domain_1.isoWeekKey)(new Date(now.getTime() - i * 7 * DAY)));
    const counts = new Map(keys.map((k) => [k, 0]));
    for (const r of reports) {
        if (r.status === 'dismissed')
            continue;
        const k = (0, domain_1.isoWeekKey)(r.createdAt);
        if (counts.has(k))
            counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return keys.map((week) => ({ week, count: counts.get(week) ?? 0 }));
}
/** Report counts by location, optionally limited to one shift: drives the floor-plan heat map. */
function hotspotCounts(reports, shift) {
    const out = {};
    for (const r of reports) {
        if (r.status === 'dismissed' || (shift && r.shift !== shift))
            continue;
        out[r.locationId] = (out[r.locationId] ?? 0) + 1;
    }
    return out;
}
/** ESTIMATE only: fixed reports with an eco-tag x per-event assumption. Not a measurement. */
function estimatedSavings(reports, a) {
    const fixed = reports.filter((r) => r.status === 'fixed');
    const n = (t) => fixed.filter((r) => r.ecoTag === t).length;
    const air = n('air_leak');
    const steam = n('steam_leak');
    const idle = n('idle_machine');
    const spill = n('spill');
    return {
        kwh: air * a.air_leak_kwh_per_event +
            steam * a.steam_leak_kwh_per_event +
            idle * a.idle_machine_kwh_per_event,
        kg: spill * a.spill_kg_per_event,
        events: { air_leak: air, steam_leak: steam, idle_machine: idle, spill },
    };
}
