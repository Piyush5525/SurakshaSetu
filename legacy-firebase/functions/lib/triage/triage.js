"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.triageReport = triageReport;
const config_1 = require("./config");
const match_1 = require("./match");
const clamp = (n) => Math.min(5, Math.max(1, n));
function triageReport(input, location) {
    const hits = (0, match_1.findTerms)(input.transcript, config_1.SEVERE_KEYWORDS);
    const highRiskLocation = location.riskWeight >= config_1.HIGH_RISK_LOCATION_WEIGHT;
    const severityBreakdown = [
        {
            key: 'base',
            label: 'Hazard type',
            points: config_1.BASE_SEVERITY[input.hazardType],
            detail: config_1.HAZARD_LABEL[input.hazardType],
        },
        {
            key: 'seriousHarm',
            label: 'Worker flagged potential for serious harm',
            points: input.seriousHarmFlag ? 1 : 0,
        },
        {
            key: 'locationWeight',
            label: 'High-risk location',
            points: highRiskLocation ? 1 : 0,
            detail: `${location.name}, risk weight ${location.riskWeight}`,
        },
        {
            key: 'keyword',
            label: 'Severe keyword in transcript',
            points: hits.length > 0 ? 1 : 0,
            ...(hits.length > 0 ? { detail: hits.join(', ') } : {}),
        },
    ];
    const severityRaw = severityBreakdown.reduce((sum, c) => sum + c.points, 0);
    const severity = clamp(severityRaw);
    const route = input.injuryNow
        ? 'emergency'
        : severity >= config_1.FAST_TRACK_SEVERITY
            ? 'supervisor_fast_track'
            : 'standard';
    const eco = ecoTag(input);
    return {
        severity,
        severityRaw,
        severityReason: buildReason(severityBreakdown, severityRaw, severity, route),
        severityBreakdown,
        ecoTag: eco.tag,
        ecoReason: eco.reason,
        route,
        action: severity >= config_1.ACTION_MIN_SEVERITY
            ? {
                owner: config_1.ACTION_OWNER[input.hazardType],
                dueInDays: config_1.ACTION_DUE_DAYS[severity] ?? 7,
                title: `Fix: ${config_1.HAZARD_LABEL[input.hazardType]} at ${location.name}`,
            }
            : null,
    };
}
function buildReason(parts, raw, severity, route) {
    const base = parts[0];
    const extras = parts
        .slice(1)
        .filter((p) => p.points > 0)
        .map((p) => `+${p.points} ${p.label.toLowerCase()}${p.detail ? ` (${p.detail})` : ''}`);
    let s = `Base ${base?.points} (${base?.detail})`;
    if (extras.length)
        s += ` ${extras.join(' ')}`;
    else
        s += ', no extra factors';
    s += ` = ${raw}`;
    if (raw !== severity)
        s += `, capped to ${severity}`;
    s += '.';
    if (route === 'emergency')
        s += ' Injury reported now: emergency path (simulated dispatch).';
    else if (route === 'supervisor_fast_track')
        s += ' High potential, nobody hurt: fast-tracked to supervisor.';
    return s;
}
function ecoTag(input) {
    for (const rule of config_1.ECO_RULES) {
        const hits = (0, match_1.findTerms)(input.transcript, rule.keywords);
        if (hits.length)
            return { tag: rule.tag, reason: `Transcript mentions "${hits[0]}"` };
        if (rule.tag === 'spill' && input.hazardType === 'chemical_spill') {
            return { tag: 'spill', reason: 'Hazard icon: chemical / spill' };
        }
    }
    return { tag: 'none', reason: 'No eco-relevant signal' };
}
