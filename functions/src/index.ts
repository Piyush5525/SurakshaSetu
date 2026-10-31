import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} from 'firebase-functions/v2/firestore';
import { projectBoardItem, shouldPublish } from './board';
import { reportFromEvent } from './camera';
import { DEFAULTS, type ReportStatus } from './domain';
import { receiptCode } from './receipt';
import { DISMISSED_SCRUB, expiredSnapshots } from './retention';
import { triageReport } from './triage/triage';

initializeApp({ storageBucket: `${process.env.GCLOUD_PROJECT ?? 'demo-plant-line3'}.appspot.com` });
const db = getFirestore();

const toDate = (t: unknown): Date => (t instanceof Timestamp ? t.toDate() : new Date());

async function setting(key: string, fallback: number): Promise<number> {
  const snap = await db.doc(`assumptions/${key}`).get();
  const v: unknown = snap.data()?.value;
  return typeof v === 'number' ? v : fallback;
}

/** Triage a new report: severity + reason + breakdown, eco-tag, route, and an action for severity >= 3. */
export const onReportCreated = onDocumentCreated('reports/{id}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const r = snap.data();
  if (r.severity !== undefined) return; // already triaged (seed or retry)
  const id = event.params.id;
  const loc = (await db.doc(`locations/${r.locationId}`).get()).data();
  const location = {
    name: String(loc?.name ?? r.locationId),
    riskWeight: Number(loc?.riskWeight ?? 1),
  };
  const t = triageReport(
    {
      hazardType: r.hazardType,
      seriousHarmFlag: r.seriousHarmFlag === true,
      injuryNow: r.injuryNow === true,
      transcript: typeof r.transcript === 'string' ? r.transcript : '',
    },
    location,
  );
  const now = Timestamp.now();
  if (t.action) {
    await db
      .doc(`actions/${id}`)
      .create({
        reportId: id,
        locationId: r.locationId,
        title: t.action.title,
        owner: t.action.owner,
        dueDate: Timestamp.fromMillis(now.toMillis() + t.action.dueInDays * 86_400_000),
        status: 'open',
        controlLevel: null,
        internalNotes: '',
        publicFixText: '',
        visibleFix: false,
        featured: false,
        closedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .catch((e: { code?: number }) => {
        if (e.code !== 6) throw e; // 6 = ALREADY_EXISTS (retry): fine
      });
  }
  await snap.ref.update({
    receiptCode: receiptCode(id),
    source: r.source ?? 'worker',
    severity: t.severity,
    severityRaw: t.severityRaw,
    severityReason: t.severityReason,
    severityBreakdown: t.severityBreakdown,
    ecoTag: t.ecoTag,
    ecoReason: t.ecoReason,
    route: t.route,
    actionId: t.action ? id : null,
    triagedBy: 'rules',
    updatedAt: now,
  });
});

/** Create/update/delete the public boardItem for a report, through the whitelisted projection. */
async function syncBoard(id: string): Promise<void> {
  const ref = db.doc(`boardItems/${id}`);
  const rs = await db.doc(`reports/${id}`).get();
  const r = rs.data();
  if (!r || r.severity === undefined) return; // wait for triage
  const delay = await setting('board_publish_delay_hours', DEFAULTS.boardPublishDelayHours);
  const created = toDate(r.createdAt);
  if (!shouldPublish(r.status as ReportStatus, created, new Date(), delay)) {
    await ref.delete();
    return;
  }
  const loc = (await db.doc(`locations/${r.locationId}`).get()).data();
  const a = (await db.doc(`actions/${id}`).get()).data();
  const item = projectBoardItem(
    id,
    { hazardType: r.hazardType, status: r.status, shift: r.shift, createdAt: created },
    {
      name: String(loc?.name ?? r.locationId),
      nameHi: String(loc?.nameHi ?? loc?.name ?? r.locationId),
    },
    a
      ? {
          publicFixText: a.publicFixText,
          featured: a.featured,
          closedAt: a.closedAt ? toDate(a.closedAt) : null,
        }
      : null,
  );
  await ref.set(item);
}

export const onReportWritten = onDocumentWritten('reports/{id}', (event) =>
  syncBoard(event.params.id),
);

/** Action progress drives report status; then the board is re-projected. */
export const onActionWritten = onDocumentWritten('actions/{id}', async (event) => {
  const id = event.params.id;
  const a = event.data?.after.data();
  if (!a) return;
  const next: ReportStatus | null =
    a.status === 'in_progress' ? 'being_fixed' : a.status === 'closed' ? 'fixed' : null;
  if (next) {
    const ref = db.doc(`reports/${id}`);
    const cur = (await ref.get()).data();
    if (cur && cur.status !== next && cur.status !== 'dismissed') {
      await ref.update({ status: next, updatedAt: FieldValue.serverTimestamp() });
      return; // the report trigger will sync the board
    }
  }
  await syncBoard(id);
});

/** Confirmed camera event -> camera-sourced report (triaged by onReportCreated). Dismissed -> keep only the verdict. */
export const onEventReviewed = onDocumentUpdated('events/{id}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after || before.status !== 'pending' || before.status === after.status) return;
  const id = event.params.id;
  const ref = event.data!.after.ref;
  if (after.status === 'confirmed') {
    const rid = `cam_${id}`;
    await db
      .doc(`reports/${rid}`)
      .create(
        reportFromEvent({
          rule: after.rule,
          locationId: after.locationId,
          shift: after.shift,
          detectedAt: toDate(after.detectedAt),
        }),
      )
      .catch((e: { code?: number }) => {
        if (e.code !== 6) throw e;
      });
    await ref.update({ reportId: rid });
  } else if (after.status === 'dismissed') {
    await deleteSnapshot(after.snapshotPath);
    await ref.update({ ...DISMISSED_SCRUB, snapshotPurgedAt: FieldValue.serverTimestamp() });
  }
});

async function deleteSnapshot(path: unknown): Promise<void> {
  if (typeof path !== 'string' || !path) return;
  await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
}

function requireStaff(role: unknown): void {
  if (role !== 'supervisor' && role !== 'ehs_admin') {
    throw new HttpsError('permission-denied', 'Staff only');
  }
}

/** Publish reports older than the configured delay. In production this would run on a schedule. */
export const publishDueBoardItems = onCall(async (req) => {
  requireStaff(req.auth?.token.role);
  const delay = await setting('board_publish_delay_hours', DEFAULTS.boardPublishDelayHours);
  const cutoff = Timestamp.fromMillis(Date.now() - delay * 3_600_000);
  const due = await db
    .collection('reports')
    .where('status', '==', 'received')
    .where('createdAt', '<=', cutoff)
    .get();
  await Promise.all(due.docs.map((d) => syncBoard(d.id)));
  return { checked: due.size };
});

/** Delete pixelated snapshots older than the retention window. In production this would run on a schedule. */
export const purgeExpiredSnapshots = onCall(async (req) => {
  requireStaff(req.auth?.token.role);
  const days = await setting('snapshot_retention_days', DEFAULTS.snapshotRetentionDays);
  const all = await db.collection('events').where('snapshotPath', '!=', null).get();
  const expired = expiredSnapshots(
    all.docs.map((d) => ({
      id: d.id,
      snapshotPath: d.data().snapshotPath as string | null,
      status: d.data().status,
      detectedAt: toDate(d.data().detectedAt),
    })),
    new Date(),
    days,
  );
  for (const e of expired) {
    await deleteSnapshot(e.snapshotPath);
    await db
      .doc(`events/${e.id}`)
      .update({ snapshotPath: null, snapshotPurgedAt: FieldValue.serverTimestamp() });
  }
  return { purged: expired.length };
});
