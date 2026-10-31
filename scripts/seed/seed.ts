/**
 * Seeds the Firestore EMULATOR with the fictional "Demo Plant — Line 3".
 * All data is synthetic. Defaults to the local emulator host.
 * boardItems are NOT written here: the Cloud Function (M1) projects them from reports/actions.
 * Severity/ecoTag values are precomputed placeholders until the triage function (M1) exists.
 */
import { initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
const app = initializeApp({ projectId: 'demo-plant-line3' });
const db = getFirestore(app);

// Deterministic PRNG so seed output is repeatable.
let s = 42;
const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;

const locations = [
  {
    id: 'filler',
    name: 'Filler',
    nameHi: 'फिलर',
    zoneType: 'machine',
    riskWeight: 1.5,
    floorPlan: { x: 40, y: 40, w: 120, h: 80 },
  },
  {
    id: 'capper',
    name: 'Capper',
    nameHi: 'कैपर',
    zoneType: 'machine',
    riskWeight: 1.3,
    floorPlan: { x: 180, y: 40, w: 100, h: 80 },
  },
  {
    id: 'labeller',
    name: 'Labeller',
    nameHi: 'लेबलर',
    zoneType: 'machine',
    riskWeight: 1.2,
    floorPlan: { x: 300, y: 40, w: 100, h: 80 },
  },
  {
    id: 'case-packer',
    name: 'Case packer',
    nameHi: 'केस पैकर',
    zoneType: 'machine',
    riskWeight: 1.4,
    floorPlan: { x: 420, y: 40, w: 120, h: 80 },
  },
  {
    id: 'forklift-lane',
    name: 'Forklift lane',
    nameHi: 'फोर्कलिफ्ट लेन',
    zoneType: 'forklift_lane',
    riskWeight: 1.6,
    floorPlan: { x: 40, y: 150, w: 500, h: 40 },
  },
  {
    id: 'raw-store',
    name: 'Raw-material store',
    nameHi: 'कच्चा माल भंडार',
    zoneType: 'storage',
    riskWeight: 1.1,
    floorPlan: { x: 40, y: 210, w: 200, h: 80 },
  },
].map((l) => ({ ...l, assemblyPoint: 'Assembly point A (fictional)', active: true }));

// hazardType -> base severity and eco-tag candidates (placeholder until M1 triage).
const hazards = [
  { type: 'pinch_jam', sev: 4, eco: ['none'] },
  { type: 'forklift', sev: 3, eco: ['none'] },
  { type: 'chemical_spill', sev: 3, eco: ['spill', 'material_waste'] },
  { type: 'slip_trip', sev: 2, eco: ['spill', 'none'] },
  { type: 'manual_handling', sev: 2, eco: ['none'] },
  { type: 'electrical_lockout', sev: 4, eco: ['idle_machine', 'none'] },
  { type: 'other', sev: 1, eco: ['air_leak', 'steam_leak', 'none'] },
] as const;
const shifts = ['A', 'B', 'C'] as const;
const DAY = 86_400_000;
const now = Date.now();

async function clear(col: string) {
  const snap = await db.collection(col).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

async function main() {
  for (const c of [
    'locations',
    'reports',
    'events',
    'actions',
    'assumptions',
    'feedback',
    'kpiSnapshots',
  ]) {
    await clear(c);
  }
  const batch = db.batch();
  for (const { id, ...l } of locations) {
    batch.set(db.collection('locations').doc(id), {
      ...l,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  // Filler, case packer and forklift lane are hotspots; volume grows over 8 weeks (reporting culture improving).
  let nReports = 0;
  for (let w = 7; w >= 0; w--) {
    const count = 5 + (7 - w) + Math.floor(rnd() * 3);
    for (let i = 0; i < count; i++) {
      const hot = rnd() < 0.5;
      const loc = hot
        ? pick(['filler', 'case-packer', 'forklift-lane'])
        : pick(locations.map((l) => l.id));
      const h = loc === 'forklift-lane' ? hazards[1] : hot ? hazards[0] : pick(hazards);
      const t = Timestamp.fromMillis(
        now - (w * 7 + Math.floor(rnd() * 7)) * DAY - Math.floor(rnd() * DAY),
      );
      const closed = w > 1 || rnd() < 0.4;
      const id = `seed-r${++nReports}`;
      const sev = h.sev;
      batch.set(db.collection('reports').doc(id), {
        receiptCode: `SEED-${String(nReports).padStart(3, '0')}`,
        locationId: loc,
        shift: pick(shifts),
        hazardType: h.type,
        seriousHarmFlag: sev >= 4 && rnd() < 0.5,
        transcript: '',
        transcriptStatus: 'not_transcribed',
        audioPath: null,
        photoPath: null,
        lang: rnd() < 0.5 ? 'hi' : 'en',
        source: 'worker',
        severity: sev,
        severityReason: 'SEED DATA: placeholder value, real triage runs in M1',
        ecoTag: pick(h.eco),
        status: closed ? 'fixed' : pick(['received', 'being_fixed']),
        actionId: sev >= 3 ? `seed-a${nReports}` : null,
        triagedBy: 'seed',
        createdAt: t,
        updatedAt: t,
      });
      if (sev >= 3) {
        const closedAt = Timestamp.fromMillis(
          t.toMillis() + (6 + Math.floor(rnd() * 90)) * 3_600_000,
        );
        batch.set(db.collection('actions').doc(`seed-a${nReports}`), {
          reportId: id,
          locationId: loc,
          title: `Fix: ${h.type.replace('_', ' ')} at ${loc}`,
          owner: 'Maintenance team',
          dueDate: Timestamp.fromMillis(t.toMillis() + 7 * DAY),
          status: closed ? 'closed' : 'open',
          fixDescription: closed ? 'Seed example fix (fictional)' : '',
          visibleFix: closed && rnd() < 0.8,
          closedAt: closed ? closedAt : null,
          controlLevel: pick(['engineer', 'admin', 'eliminate'] as const),
          createdAt: t,
          updatedAt: t,
        });
      }
      if (rnd() < 0.5) {
        batch.set(db.collection('feedback').doc(`seed-f${nReports}`), {
          reportId: id,
          score: 3 + Math.floor(rnd() * 3),
          createdAt: t,
        });
      }
    }
  }

  const ev = [
    {
      rule: 'forklift_person_gap',
      loc: 'forklift-lane',
      zoneId: 'forklift-lane-1',
      measure: 38,
      status: 'pending',
    },
    {
      rule: 'hand_in_danger_zone',
      loc: 'filler',
      zoneId: 'filler-danger-1',
      measure: 4.2,
      status: 'pending',
    },
    {
      rule: 'forklift_person_gap',
      loc: 'forklift-lane',
      zoneId: 'forklift-lane-1',
      measure: 52,
      status: 'confirmed',
    },
    {
      rule: 'hand_in_danger_zone',
      loc: 'case-packer',
      zoneId: 'case-packer-danger-1',
      measure: 3.1,
      status: 'dismissed',
    },
  ];
  ev.forEach((e, i) => {
    const t = Timestamp.fromMillis(now - i * DAY);
    const reviewed = e.status !== 'pending';
    batch.set(db.collection('events').doc(`seed-e${i + 1}`), {
      rule: e.rule,
      zoneId: e.zoneId,
      locationId: e.loc,
      shift: pick(shifts),
      detectedAt: t,
      confidence: 0.8 + i * 0.03,
      measure: e.measure,
      snapshotPath: null,
      status: e.status,
      reviewedByRole: reviewed ? 'supervisor' : null,
      reviewedAt: reviewed ? t : null,
      reportId: null,
      simulated: true,
      createdAt: t,
      updatedAt: t,
    });
  });

  // Every number here is an ASSUMPTION (see docs/eco-impact.md in M6); none is a measurement.
  const assumptions = [
    {
      key: 'air_leak_kwh_per_event',
      value: 50,
      unit: 'kWh',
      label: 'Energy saved per compressed-air leak fixed',
    },
    {
      key: 'steam_leak_kwh_per_event',
      value: 80,
      unit: 'kWh',
      label: 'Energy saved per steam leak fixed',
    },
    {
      key: 'spill_kg_per_event',
      value: 5,
      unit: 'kg',
      label: 'Material saved per spill prevented',
    },
    {
      key: 'idle_machine_kwh_per_event',
      value: 20,
      unit: 'kWh',
      label: 'Energy saved per idle-machine episode',
    },
    {
      key: 'workers_on_line',
      value: 40,
      unit: 'people',
      label: 'Headcount for per-100-workers KPI (fictional plant)',
    },
  ];
  assumptions.forEach(({ key, ...a }) =>
    batch.set(db.collection('assumptions').doc(key), { ...a, source: 'assumption' }),
  );

  await batch.commit();
  console.log(
    `Seeded ${locations.length} locations, ${nReports} reports, ${ev.length} events, ${assumptions.length} assumptions (emulator, synthetic).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
