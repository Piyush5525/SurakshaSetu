/**
 * End-to-end check of the Cloud Function triggers against the running emulators (run `npm run dev` first).
 * Creates a report the way a worker would (client-style ID, no triage fields), then verifies triage,
 * action creation, board publication rules and the camera-event flow. Uses synthetic data only.
 */
import { initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { BOARD_FIELDS } from '../../functions/src/board';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
initializeApp({ projectId: 'demo-plant-line3' });
const db = getFirestore();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${JSON.stringify(extra)}`}`);
  if (!ok) failed++;
};

async function waitFor<T>(fn: () => Promise<T | undefined>, ms = 40000): Promise<T | undefined> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(300);
  }
  return undefined;
}

async function main() {
  const id = `smoke${Date.now()}abcdefghij`;
  await db.doc(`reports/${id}`).set({
    locationId: 'filler',
    hazardType: 'pinch_jam',
    seriousHarmFlag: true,
    injuryNow: false,
    transcript: 'haath fas gaya during jam clearing',
    transcriptStatus: 'transcribed',
    lang: 'en',
    shift: 'B',
    status: 'received',
    createdAt: Timestamp.now(),
  });

  const r = await waitFor(async () => {
    const d = (await db.doc(`reports/${id}`).get()).data();
    return d?.severity !== undefined ? d : undefined;
  });
  check('report triaged by function', !!r, r);
  check(
    'severity 5 with reason and 4-part breakdown',
    r?.severity === 5 && r.severityBreakdown?.length === 4 && /Base 3/.test(r.severityReason),
    r,
  );
  check(
    'route is supervisor_fast_track (not emergency)',
    r?.route === 'supervisor_fast_track',
    r?.route,
  );

  const action = await waitFor(async () => (await db.doc(`actions/${id}`).get()).data());
  check(
    'action auto-created for severity >= 3',
    action?.status === 'open' && action.owner === 'Maintenance',
    action,
  );
  check(
    'fresh received report is NOT on the public board',
    !(await db.doc(`boardItems/${id}`).get()).exists,
  );

  await db
    .doc(`actions/${id}`)
    .update({ status: 'in_progress', publicFixText: 'Interlock being fitted' });
  const item = await waitFor(async () => {
    const d = (await db.doc(`boardItems/${id}`).get()).data();
    return d ? d : undefined;
  });
  check('board item appears when work starts', item?.status === 'being_fixed', item);
  check(
    'board item has exactly the whitelisted keys',
    !!item && Object.keys(item).sort().join() === [...BOARD_FIELDS].sort().join(),
    item && Object.keys(item),
  );
  check(
    'board item has no severity / harm flags / times',
    !!item &&
      !/severity|seriousHarm|injuryNow|route|transcript/i.test(JSON.stringify(item)) &&
      !/\d{2}:\d{2}/.test(JSON.stringify(item)),
    item,
  );

  await db
    .doc(`actions/${id}`)
    .update({ status: 'closed', publicFixText: 'Interlock fitted', closedAt: Timestamp.now() });
  const fixed = await waitFor(async () => {
    const d = (await db.doc(`boardItems/${id}`).get()).data();
    return d?.status === 'fixed' ? d : undefined;
  });
  check(
    'closing the action marks board item fixed with fix text',
    fixed?.fixText === 'Interlock fitted' && !!fixed.fixedDay,
    fixed,
  );

  // Camera event: confirm creates a camera-sourced report that is triaged.
  const evId = `smoke-e${Date.now()}`;
  await db.doc(`events/${evId}`).set({
    rule: 'forklift_person_gap',
    zoneId: 'z',
    locationId: 'forklift-lane',
    shift: 'A',
    detectedAt: Timestamp.now(),
    confidence: 0.9,
    measure: 30,
    snapshotPath: null,
    status: 'pending',
    simulated: true,
  });
  await db.doc(`events/${evId}`).update({ status: 'confirmed', reviewedByRole: 'supervisor' });
  const cam = await waitFor(async () => {
    const d = (await db.doc(`reports/cam_${evId}`).get()).data();
    return d?.severity !== undefined ? d : undefined;
  });
  check(
    'confirmed camera event becomes a triaged camera report',
    cam?.source === 'camera' && cam.hazardType === 'forklift',
    cam,
  );

  const evId2 = `smoke-d${Date.now()}`;
  await db.doc(`events/${evId2}`).set({
    rule: 'hand_in_danger_zone',
    zoneId: 'z',
    locationId: 'filler',
    shift: 'A',
    detectedAt: Timestamp.now(),
    confidence: 0.7,
    measure: 3,
    snapshotPath: 'events/none.jpg',
    status: 'pending',
    simulated: true,
  });
  await db.doc(`events/${evId2}`).update({ status: 'dismissed' });
  const dis = await waitFor(async () => {
    const d = (await db.doc(`events/${evId2}`).get()).data();
    return d?.snapshotPurgedAt ? d : undefined;
  });
  check(
    'dismissed event keeps only the verdict',
    dis?.snapshotPath === null && dis.measure === null && dis.confidence === null,
    dis,
  );

  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll smoke checks passed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
