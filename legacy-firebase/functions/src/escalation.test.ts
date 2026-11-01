import { describe, expect, it } from 'vitest';
import {
  EMERGENCY_CHAIN,
  FAST_TRACK_CHAIN,
  SimulatedNotifier,
  TwilioNotifier,
  buildChain,
  dueSteps,
  kindForRoute,
  type DispatchPayload,
} from './escalation';

const t0 = new Date('2026-11-01T10:00:00Z');
const at = (min: number) => new Date(t0.getTime() + min * 60_000);

describe('escalation chain', () => {
  it('emergency chain follows the brief order with ascending timers', () => {
    const c = buildChain('emergency', t0);
    expect(c.map((s) => s.role)).toEqual([
      'first_aider',
      'supervisor',
      'medical',
      'national_emergency',
      'site_head',
    ]);
    expect(c.map((s) => s.afterMinutes)).toEqual(
      [...c.map((s) => s.afterMinutes)].sort((a, b) => a - b),
    );
    expect(c.every((s) => s.state === 'pending' && s.notifiedAt === null)).toBe(true);
    expect(c[0]!.dueAt).toEqual(t0);
  });

  it('labels every outward step as simulated', () => {
    const outward = EMERGENCY_CHAIN.filter((s) =>
      ['medical', 'national_emergency'].includes(s.role),
    );
    expect(outward.every((s) => /simulated/i.test(s.label))).toBe(true);
  });

  it('fast-track (nobody hurt) reaches the supervisor only, never medical or 112', () => {
    expect(FAST_TRACK_CHAIN.map((s) => s.role)).toEqual(['supervisor']);
    const roles = buildChain('fast_track', t0).map((s) => s.role);
    expect(roles).not.toContain('medical');
    expect(roles).not.toContain('national_emergency');
  });

  it('only the emergency route (injuryNow) maps to the emergency chain', () => {
    expect(kindForRoute('emergency')).toBe('emergency');
    expect(kindForRoute('supervisor_fast_track')).toBe('fast_track');
    expect(kindForRoute('standard')).toBeNull();
  });
});

describe('dueSteps', () => {
  const steps = buildChain('emergency', t0);
  it('releases steps as time passes', () => {
    expect(dueSteps('active', steps, t0, at(0)).map((s) => s.step)).toEqual([0]);
    expect(dueSteps('active', steps, t0, at(2.5)).map((s) => s.step)).toEqual([0, 1]);
    expect(dueSteps('active', steps, t0, at(10)).map((s) => s.step)).toEqual([0, 1, 2, 3, 4]);
  });
  it('skips steps already notified', () => {
    const done = steps.map((s) => (s.step === 0 ? { ...s, state: 'notified' as const } : s));
    expect(dueSteps('active', done, t0, at(2.5)).map((s) => s.step)).toEqual([1]);
  });
  it('stops once a human has acknowledged or resolved it', () => {
    expect(dueSteps('acknowledged', steps, t0, at(30))).toEqual([]);
    expect(dueSteps('resolved', steps, t0, at(30))).toEqual([]);
  });
  it('supports a demo time scale', () => {
    expect(dueSteps('active', steps, t0, at(1), 10).map((s) => s.step)).toEqual([0, 1, 2, 3, 4]);
    expect(dueSteps('active', steps, t0, at(1), 1).map((s) => s.step)).toEqual([0]);
  });
});

describe('notifiers', () => {
  const payload: DispatchPayload = {
    reportId: 'r1',
    kind: 'emergency',
    role: 'first_aider',
    label: 'First-aider',
    locationName: 'Filler',
    severity: 4,
    photoPath: 'reports/r1/photo.jpg',
    at: t0,
    assemblyPoint: 'Assembly point A (fictional)',
  };
  it('simulated notifier logs what would be sent, flags simulated and omits the photo path', async () => {
    const e = await new SimulatedNotifier().notify(payload);
    expect(e.simulated).toBe(true);
    expect(e.message).toMatch(/^SIMULATED/);
    expect(JSON.stringify(e)).not.toContain('photo');
  });
  it('twilio notifier is an explicit stub', async () => {
    await expect(new TwilioNotifier().notify(payload)).rejects.toThrow(/stub/);
  });
});
