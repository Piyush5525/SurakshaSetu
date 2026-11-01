import { describe, expect, it } from 'vitest';
import { triageReport, type TriageInput } from './triage';

const filler = { name: 'Filler', riskWeight: 1.5 };
const store = { name: 'Raw-material store', riskWeight: 1.1 };
const base: TriageInput = {
  hazardType: 'pinch_jam',
  seriousHarmFlag: false,
  injuryNow: false,
  transcript: '',
};

describe('severity matrix', () => {
  it('scores base only for a low-risk location', () => {
    const r = triageReport(base, store);
    expect(r.severity).toBe(3);
    expect(r.severityBreakdown.map((c) => [c.key, c.points])).toEqual([
      ['base', 3],
      ['seriousHarm', 0],
      ['locationWeight', 0],
      ['keyword', 0],
    ]);
  });

  it('adds location weight at >= 1.5 and serious harm', () => {
    const r = triageReport({ ...base, seriousHarmFlag: true }, filler);
    expect(r.severityRaw).toBe(5);
    expect(r.severity).toBe(5);
    expect(r.severityReason).toContain('Base 3 (jam clearing / pinch point)');
    expect(r.severityReason).toContain('= 5');
  });

  it('clamps above 5 and says so', () => {
    const r = triageReport(
      { ...base, seriousHarmFlag: true, transcript: 'hand stuck, sparks' },
      filler,
    );
    expect(r.severityRaw).toBe(6);
    expect(r.severity).toBe(5);
    expect(r.severityReason).toContain('capped to 5');
  });

  it('never goes below 1', () => {
    expect(triageReport({ ...base, hazardType: 'other' }, store).severity).toBe(1);
  });

  it('always lists four components in order, each with integer points', () => {
    const r = triageReport(base, filler);
    expect(r.severityBreakdown.map((c) => c.key)).toEqual([
      'base',
      'seriousHarm',
      'locationWeight',
      'keyword',
    ]);
    expect(r.severityBreakdown.every((c) => Number.isInteger(c.points))).toBe(true);
  });
});

describe('severe keywords: English, Hindi, Hinglish', () => {
  const kw = (transcript: string) =>
    triageReport({ ...base, hazardType: 'other', transcript }, store).severityBreakdown[3]!.points;

  it.each([
    ['English', 'my sleeve got trapped near the roller'],
    ['English fire', 'small fire at the capper'],
    ['Hinglish', 'haath fas gaya belt mein'],
    ['Hinglish chingari', 'panel se chingari nikli'],
    ['Hindi', 'मशीन में हाथ फंस गया'],
    ['Hindi aag', 'पैनल में आग लग गई'],
  ])('%s triggers the bonus', (_n, text) => expect(kw(text)).toBe(1));

  it.each([
    ['empty transcript', ''],
    ['whitespace only', '   '],
    ['ordinary text', 'label roll was loose'],
  ])('%s gives no bonus', (_n, text) => expect(kw(text)).toBe(0));

  it('does not match inside other words', () => {
    expect(kw('the fireplace-coloured label')).toBe(0);
  });

  it('handles a missing transcript without error', () => {
    const r = triageReport({ ...base, transcript: undefined }, store);
    expect(r.severityBreakdown[3]!.points).toBe(0);
    expect(triageReport({ ...base, transcript: null }, store).severity).toBe(3);
  });
});

describe('routing', () => {
  it('injuryNow is the path to emergency', () => {
    const r = triageReport({ ...base, injuryNow: true }, store);
    expect(r.route).toBe('emergency');
    expect(r.severityReason).toContain('simulated');
    expect(triageReport({ ...base, injuryNow: true, hazardType: 'other' }, store).route).toBe(
      'emergency',
    );
  });

  it('a high-potential near miss fast-tracks to the supervisor', () => {
    const r = triageReport({ ...base, seriousHarmFlag: true }, filler);
    expect(r.severity).toBeGreaterThanOrEqual(4);
    expect(r.route).toBe('supervisor_fast_track');
  });

  it('never routes to emergency without injuryNow, however high the severity', () => {
    for (const loc of [filler, store]) {
      const r = triageReport({ ...base, seriousHarmFlag: true, transcript: 'trapped fire' }, loc);
      expect(r.route).not.toBe('emergency');
    }
  });

  it('low severity is standard', () => {
    expect(triageReport({ ...base, hazardType: 'slip_trip' }, store).route).toBe('standard');
  });
});

describe('actions', () => {
  it('are created only from severity 3', () => {
    expect(triageReport({ ...base, hazardType: 'slip_trip' }, store).action).toBeNull();
    expect(triageReport(base, store).action).toMatchObject({ owner: 'Maintenance', dueInDays: 7 });
  });
  it('get shorter due dates at higher severity', () => {
    expect(triageReport({ ...base, seriousHarmFlag: true }, store).action?.dueInDays).toBe(3);
    expect(triageReport({ ...base, seriousHarmFlag: true }, filler).action?.dueInDays).toBe(1);
  });
});

describe('eco-tag', () => {
  const eco = (hazardType: TriageInput['hazardType'], transcript: string) =>
    triageReport({ ...base, hazardType, transcript }, store).ecoTag;

  it('detects air, steam, spill, idle and waste from text', () => {
    expect(eco('other', 'loud hissing near the valve')).toBe('air_leak');
    expect(eco('other', 'hawa leak at the filler')).toBe('air_leak');
    expect(eco('other', 'steam from the pipe')).toBe('steam_leak');
    expect(eco('other', 'भाप निकल रही है')).toBe('steam_leak');
    expect(eco('slip_trip', 'oil spilled on the floor')).toBe('spill');
    expect(eco('other', 'machine running empty')).toBe('idle_machine');
    expect(eco('other', 'lots of scrap bottles')).toBe('material_waste');
  });
  it('tags spill from the icon alone', () => {
    const r = triageReport({ ...base, hazardType: 'chemical_spill' }, store);
    expect(r.ecoTag).toBe('spill');
    expect(r.ecoReason).toContain('icon');
  });
  it('is none otherwise, with a reason', () => {
    const r = triageReport(base, store);
    expect(r.ecoTag).toBe('none');
    expect(r.ecoReason.length).toBeGreaterThan(0);
  });
});
