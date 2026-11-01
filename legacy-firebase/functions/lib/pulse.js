"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pulseBy = pulseBy;
const domain_1 = require("./domain");
/** Aggregate-only pulse: groups below MIN_GROUP_SIZE are suppressed, never shown. */
function pulseBy(entries, keyOf, minGroup = domain_1.MIN_GROUP_SIZE) {
    const groups = new Map();
    for (const e of entries) {
        const k = keyOf(e);
        groups.set(k, [...(groups.get(k) ?? []), e.score]);
    }
    return [...groups.entries()]
        .map(([key, scores]) => ({
        key,
        n: scores.length,
        mean: scores.length >= minGroup
            ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
            : null,
    }))
        .sort((a, b) => a.key.localeCompare(b.key));
}
