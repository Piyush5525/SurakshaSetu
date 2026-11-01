"use strict";
/**
 * Emergency escalation router: SIMULATED. Nothing here contacts real police, ambulance or emergency numbers.
 * "Dispatch" only writes a log entry that the mock dispatcher screen shows. The Twilio notifier is a stub.
 *
 * Routing rule (see docs/data-model.md): only `injuryNow` (someone is hurt right now) starts the EMERGENCY
 * chain. A high-potential near miss with nobody hurt starts the FAST-TRACK chain: supervisor only.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwilioNotifier = exports.SimulatedNotifier = exports.FAST_TRACK_CHAIN = exports.EMERGENCY_CHAIN = void 0;
exports.buildChain = buildChain;
exports.kindForRoute = kindForRoute;
exports.dueSteps = dueSteps;
/** Assumed timers (configurable); the order follows the brief. */
exports.EMERGENCY_CHAIN = [
    { role: 'first_aider', label: 'On-site first-aider / emergency response team', afterMinutes: 0 },
    { role: 'supervisor', label: 'Shift supervisor', afterMinutes: 2 },
    { role: 'medical', label: 'Plant medical room / ambulance (simulated)', afterMinutes: 5 },
    {
        role: 'national_emergency',
        label: 'National emergency number 112 (simulated, nothing is dialled)',
        afterMinutes: 8,
    },
    { role: 'site_head', label: 'Site head', afterMinutes: 10 },
];
exports.FAST_TRACK_CHAIN = [
    {
        role: 'supervisor',
        label: 'Shift supervisor (high-potential near miss, nobody hurt)',
        afterMinutes: 0,
    },
];
/** Default notifier: writes what WOULD have been sent. Safe in demos. */
class SimulatedNotifier {
    notify(p) {
        const { photoPath: _photo, ...rest } = p;
        void _photo;
        return Promise.resolve({
            ...rest,
            simulated: true,
            message: `SIMULATED: would alert ${p.label} about severity ${p.severity} at ${p.locationName}; assembly point: ${p.assemblyPoint}`,
        });
    }
}
exports.SimulatedNotifier = SimulatedNotifier;
/** Stub for a real SMS/call provider (e.g. Twilio). Intentionally not implemented: swap in later with credentials. */
class TwilioNotifier {
    notify(_p) {
        void _p;
        return Promise.reject(new Error('TwilioNotifier is a stub: configure a provider before using it.'));
    }
}
exports.TwilioNotifier = TwilioNotifier;
function buildChain(kind, start, chain = kind === 'emergency' ? exports.EMERGENCY_CHAIN : exports.FAST_TRACK_CHAIN) {
    return chain.map((c, i) => ({
        ...c,
        step: i,
        dueAt: new Date(start.getTime() + c.afterMinutes * 60_000),
        state: 'pending',
        notifiedAt: null,
    }));
}
function kindForRoute(route) {
    if (route === 'emergency')
        return 'emergency';
    if (route === 'supervisor_fast_track')
        return 'fast_track';
    return null;
}
/**
 * Steps that are due. `timeScale` > 1 speeds up the simulated clock for demos (1 real second = `timeScale` simulated seconds).
 * An acknowledged or resolved escalation has no due steps: once a human has taken it, the chain stops.
 */
function dueSteps(status, steps, startedAt, now, timeScale = 1) {
    if (status !== 'active')
        return [];
    const simNow = startedAt.getTime() + (now.getTime() - startedAt.getTime()) * Math.max(1, timeScale);
    return steps.filter((s) => s.state === 'pending' && s.dueAt.getTime() <= simNow);
}
