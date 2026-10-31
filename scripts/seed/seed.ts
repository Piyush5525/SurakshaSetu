/**
 * Seeds the Firebase EMULATORS (Firestore + Auth) with the fictional "Demo Plant — Line 3".
 * All data is synthetic. Uses the real triage, board-projection and receipt code from functions/src,
 * so seeded documents look exactly like production ones.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { projectBoardItem, shouldPublish } from '../../functions/src/board';
import {
  DEFAULTS,
  HAZARD_TYPES,
  type HazardType,
  type ReportStatus,
  type Shift,
} from '../../functions/src/domain';
import { receiptCode } from '../../functions/src/receipt';
import { triageReport } from '../../functions/src/triage/triage';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
const app = initializeApp({ projectId: 'demo-plant-line3' });
const db = getFirestore(app);

// Deterministic PRNG so seed output is repeatable.
let s = 42;
const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const clientId = () => Array.from({ length: 20 }, () => pick([...ID_CHARS])).join('');

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
const locById = new Map(locations.map((l) => [l.id, l]));

// Synthetic transcripts in English, Hindi and Hinglish; many reports have none.
const transcripts: Partial<Record<HazardType, string[]>> = {
  pinch_jam: [
    'label jam, hand almost caught in the roller',
    'हाथ फंस गया था बेल्ट में',
    'jam clear karte time haath fas gaya',
    'conveyor jam again at the end of shift',
  ],
  forklift: [
    'forklift came round the corner too fast',
    'forklift se takra gaya tha almost',
    'फोर्कलिफ्ट बहुत पास से निकली',
  ],
  chemical_spill: ['oil spilled near the pump', 'tel gira hua hai floor par'],
  slip_trip: ['wet floor by the capper', 'cable across the walkway'],
  other: [
    'loud hissing from the air hose',
    'steam from the valve',
    'machine left on, running empty',
    'lots of scrap bottles by the labeller',
    'हवा लीक हो रही है',
  ],
};

const shifts: readonly Shift[] = ['A', 'B', 'C'];
const DAY = 86_400_000;
const now = Date.now();
const nowDate = new Date(now);
const tz = DEFAULTS.plantTimeZone;

function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function clear(col: string) {
  const snap = await db.collection(col).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

async function seedStaff() {
  const auth = getAuth(app);
  const staff = [
    { email: 'supervisor@demo.local', role: 'supervisor' },
    { email: 'ehs@demo.local', role: 'ehs_admin' },
  ];
  for (const u of staff) {
    const existing = await auth.getUserByEmail(u.email).catch(() => null);
    if (existing) await auth.deleteUser(existing.uid);
    const created = await auth.createUser({
      email: u.email,
      password: 'demo1234',
      emailVerified: true,
    });
    await auth.setCustomUserClaims(created.uid, { role: u.role });
  }
}

async function main() {
  for (const c of [
    'locations',
    'reports',
    'boardItems',
    'events',
    'actions',
    'assumptions',
    'feedback',
    'kpiSnapshots',
  ]) {
    await clear(c);
  }
  await seedStaff();

  const batch = db.batch();
  for (const { id, ...l } of locations) {
    batch.set(db.collection('locations').doc(id), {
      ...l,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  let nReports = 0;
  let nBoard = 0;
  for (let w = 7; w >= 0; w--) {
    // Volume grows over 8 weeks: a reporting culture improving (synthetic).
    const count = 5 + (7 - w) + Math.floor(rnd() * 3);
    for (let i = 0; i < count; i++) {
      const hot = rnd() < 0.5;
      const locationId = hot
        ? pick(['filler', 'case-packer', 'forklift-lane'])
        : pick(locations.map((l) => l.id));
      const hazardType: HazardType =
        locationId === 'forklift-lane' ? 'forklift' : hot ? 'pinch_jam' : pick(HAZARD_TYPES);
      const loc = locById.get(locationId)!;
      const createdMs = now - (w * 7 + Math.floor(rnd() * 7)) * DAY - Math.floor(rnd() * DAY);
      const createdAt = new Date(createdMs);
      const id = clientId();
      nReports++;

      const texts = transcripts[hazardType];
      const transcript = texts && rnd() < 0.6 ? pick(texts) : '';
      const seriousHarmFlag =
        (hazardType === 'pinch_jam' || hazardType === 'forklift') && rnd() < 0.25;
      const injuryNow = nReports === 3; // one synthetic example of the emergency route
      const t = triageReport(
        { hazardType, seriousHarmFlag, injuryNow, transcript },
        { name: loc.name, riskWeight: loc.riskWeight },
      );

      const old = w > 1;
      const closed = old || rnd() < 0.4;
      const status: ReportStatus = closed ? 'fixed' : pick(['received', 'being_fixed'] as const);
      const shift = pick(shifts);
      const createdTs = Timestamp.fromMillis(createdMs);

      batch.set(db.collection('reports').doc(id), {
        locationId,
        hazardType,
        seriousHarmFlag,
        injuryNow,
        transcript,
        transcriptStatus: transcript ? 'transcribed' : 'no_audio',
        audioPath: null,
        photoPath: null,
        lang: /[ऀ-ॿ]/.test(transcript) ? 'hi' : 'en',
        shift,
        status,
        createdAt: createdTs,
        receiptCode: receiptCode(id),
        source: 'worker',
        severity: t.severity,
        severityRaw: t.severityRaw,
        severityReason: t.severityReason,
        severityBreakdown: t.severityBreakdown,
        ecoTag: t.ecoTag,
        ecoReason: t.ecoReason,
        route: t.route,
        actionId: t.action ? id : null,
        triagedBy: 'rules',
        updatedAt: createdTs,
      });

      let actionForBoard = null;
      if (t.action) {
        const actionStatus =
          status === 'fixed' ? 'closed' : status === 'being_fixed' ? 'in_progress' : 'open';
        const closedAt =
          status === 'fixed'
            ? new Date(createdMs + (6 + Math.floor(rnd() * 90)) * 3_600_000)
            : null;
        const publicFixText = status === 'received' ? '' : 'Seed example fix (fictional)';
        const featured = status === 'fixed' && rnd() < 0.1;
        batch.set(db.collection('actions').doc(id), {
          reportId: id,
          locationId,
          title: t.action.title,
          owner: t.action.owner,
          dueDate: Timestamp.fromMillis(createdMs + t.action.dueInDays * DAY),
          status: actionStatus,
          controlLevel: pick(['engineer', 'admin', 'eliminate'] as const),
          internalNotes: '',
          publicFixText,
          visibleFix: status === 'fixed' && rnd() < 0.8,
          featured,
          closedAt: closedAt ? Timestamp.fromDate(closedAt) : null,
          createdAt: createdTs,
          updatedAt: createdTs,
        });
        actionForBoard = { publicFixText, featured, closedAt };
      }

      if (shouldPublish(status, createdAt, nowDate)) {
        batch.set(
          db.collection('boardItems').doc(id),
          projectBoardItem(id, { hazardType, status, shift, createdAt }, loc, actionForBoard, tz),
        );
        nBoard++;
      }
    }
  }

  // Feedback: 8 anonymous entries per location x shift group (>= 5 minimum), spread over the 8 weeks.
  let nFeedback = 0;
  for (const l of locations) {
    for (const shift of shifts) {
      for (let i = 0; i < 8; i++) {
        const when = new Date(now - (i * 7 + Math.floor(rnd() * 7)) * DAY);
        batch.set(db.collection('feedback').doc(), {
          score: 3 + Math.floor(rnd() * 3),
          locationId: l.id,
          shift,
          weekKey: weekKey(when),
          createdAt: Timestamp.fromDate(when),
        });
        nFeedback++;
      }
    }
  }

  const events = [
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
    // Dismissed events keep only the verdict: no snapshot, measure or confidence.
    {
      rule: 'hand_in_danger_zone',
      loc: 'case-packer',
      zoneId: 'case-packer-danger-1',
      measure: null,
      status: 'dismissed',
    },
  ];
  events.forEach((e, i) => {
    const t = Timestamp.fromMillis(now - i * DAY);
    const reviewed = e.status !== 'pending';
    const dismissed = e.status === 'dismissed';
    batch.set(db.collection('events').doc(`seed-e${i + 1}`), {
      rule: e.rule,
      zoneId: e.zoneId,
      locationId: e.loc,
      shift: pick(shifts),
      detectedAt: t,
      confidence: dismissed ? null : 0.8 + i * 0.03,
      measure: e.measure,
      snapshotPath: null, // real pixelated snapshots arrive with the vision service (M5)
      status: e.status,
      reviewedByRole: reviewed ? 'supervisor' : null,
      reviewedAt: reviewed ? t : null,
      reportId: null,
      simulated: true,
      createdAt: t,
      updatedAt: t,
    });
  });

  // Every number here is an ASSUMPTION; none is a measurement.
  const assumptions = [
    {
      key: 'board_publish_delay_hours',
      value: DEFAULTS.boardPublishDelayHours,
      unit: 'hours',
      label: 'Hold unreviewed reports off the public board for this long',
    },
    {
      key: 'snapshot_retention_days',
      value: DEFAULTS.snapshotRetentionDays,
      unit: 'days',
      label: 'Delete pixelated camera snapshots after this many days',
    },
    {
      key: 'air_leak_kwh_per_event',
      value: 50,
      unit: 'kWh',
      label: 'Energy saved per compressed-air leak fixed (estimate)',
    },
    {
      key: 'steam_leak_kwh_per_event',
      value: 80,
      unit: 'kWh',
      label: 'Energy saved per steam leak fixed (estimate)',
    },
    {
      key: 'spill_kg_per_event',
      value: 5,
      unit: 'kg',
      label: 'Material saved per spill prevented (estimate)',
    },
    {
      key: 'idle_machine_kwh_per_event',
      value: 20,
      unit: 'kWh',
      label: 'Energy saved per idle-machine episode (estimate)',
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
    `Seeded ${locations.length} locations, ${nReports} reports (${nBoard} published to the board), ${nFeedback} feedback, ${events.length} events, ${assumptions.length} assumptions, 2 staff users (emulator, synthetic).`,
  );
  console.log(
    'Staff logins (emulator only): supervisor@demo.local / ehs@demo.local, password demo1234',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
