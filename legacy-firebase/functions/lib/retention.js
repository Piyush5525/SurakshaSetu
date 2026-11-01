"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DISMISSED_SCRUB = void 0;
exports.expiredSnapshots = expiredSnapshots;
const domain_1 = require("./domain");
/** Events whose pixelated snapshot is older than the retention window and still stored. */
function expiredSnapshots(events, now, retentionDays = domain_1.DEFAULTS.snapshotRetentionDays) {
    const cutoff = now.getTime() - retentionDays * 86_400_000;
    return events.filter((e) => e.snapshotPath !== null && e.detectedAt.getTime() <= cutoff);
}
/** A dismissed event keeps only the verdict: the image and detection details are removed. */
exports.DISMISSED_SCRUB = { snapshotPath: null, measure: null, confidence: null };
