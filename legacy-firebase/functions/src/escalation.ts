/**
 * Emergency escalation router: SIMULATED. Nothing here contacts real police, ambulance or emergency numbers.
 * "Dispatch" only writes a log entry that the mock dispatcher screen shows. The Twilio notifier is a stub.
 *
 * Routing rule (see docs/data-model.md): only `injuryNow` (someone is hurt right now) starts the EMERGENCY
 * chain. A high-potential near miss with nobody hurt starts the FAST-TRACK chain: supervisor only.
 */

export type EscalationKind = 'emergency' | 'fast_track';
export type StepState = 'pending' | 'notified' | 'skipped';
export type EscalationStatus = 'active' | 'acknowledged' | 'resolved';

export interface ChainStepConfig {
  role: string;
  label: string;
  afterMinutes: number;
}
export interface EscalationStep extends ChainStepConfig {
  step: number;
  dueAt: Date;
  state: StepState;
  notifiedAt: Date | null;
}

/** Assumed timers (configurable); the order follows the brief. */
export const EMERGENCY_CHAIN: readonly ChainStepConfig[] = [
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
export const FAST_TRACK_CHAIN: readonly ChainStepConfig[] = [
  {
    role: 'supervisor',
    label: 'Shift supervisor (high-potential near miss, nobody hurt)',
    afterMinutes: 0,
  },
];

export interface DispatchPayload {
  reportId: string;
  kind: EscalationKind;
  role: string;
  label: string;
  locationName: string;
  severity: number;
  photoPath: string | null;
  at: Date;
  assemblyPoint: string;
}
export interface DispatchLogEntry extends Omit<DispatchPayload, 'photoPath'> {
  simulated: true;
  message: string;
}

export interface Notifier {
  notify(payload: DispatchPayload): Promise<DispatchLogEntry>;
}

/** Default notifier: writes what WOULD have been sent. Safe in demos. */
export class SimulatedNotifier implements Notifier {
  notify(p: DispatchPayload): Promise<DispatchLogEntry> {
    const { photoPath: _photo, ...rest } = p;
    void _photo;
    return Promise.resolve({
      ...rest,
      simulated: true,
      message: `SIMULATED: would alert ${p.label} about severity ${p.severity} at ${p.locationName}; assembly point: ${p.assemblyPoint}`,
    });
  }
}

/** Stub for a real SMS/call provider (e.g. Twilio). Intentionally not implemented: swap in later with credentials. */
export class TwilioNotifier implements Notifier {
  notify(_p: DispatchPayload): Promise<DispatchLogEntry> {
    void _p;
    return Promise.reject(
      new Error('TwilioNotifier is a stub: configure a provider before using it.'),
    );
  }
}

export function buildChain(
  kind: EscalationKind,
  start: Date,
  chain: readonly ChainStepConfig[] = kind === 'emergency' ? EMERGENCY_CHAIN : FAST_TRACK_CHAIN,
): EscalationStep[] {
  return chain.map((c, i) => ({
    ...c,
    step: i,
    dueAt: new Date(start.getTime() + c.afterMinutes * 60_000),
    state: 'pending' as const,
    notifiedAt: null,
  }));
}

export function kindForRoute(route: string): EscalationKind | null {
  if (route === 'emergency') return 'emergency';
  if (route === 'supervisor_fast_track') return 'fast_track';
  return null;
}

/**
 * Steps that are due. `timeScale` > 1 speeds up the simulated clock for demos (1 real second = `timeScale` simulated seconds).
 * An acknowledged or resolved escalation has no due steps: once a human has taken it, the chain stops.
 */
export function dueSteps(
  status: EscalationStatus,
  steps: readonly EscalationStep[],
  startedAt: Date,
  now: Date,
  timeScale = 1,
): EscalationStep[] {
  if (status !== 'active') return [];
  const simNow =
    startedAt.getTime() + (now.getTime() - startedAt.getTime()) * Math.max(1, timeScale);
  return steps.filter((s) => s.state === 'pending' && s.dueAt.getTime() <= simNow);
}
