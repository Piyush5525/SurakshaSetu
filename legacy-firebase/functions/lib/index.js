"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.advanceEscalations = exports.purgeExpiredSnapshots = exports.publishDueBoardItems = exports.onEventReviewed = exports.onActionWritten = exports.onReportWritten = exports.onReportCreated = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("firebase-functions/v2/firestore");
const board_1 = require("./board");
const camera_1 = require("./camera");
const domain_1 = require("./domain");
const escalation_1 = require("./escalation");
const receipt_1 = require("./receipt");
const retention_1 = require("./retention");
const triage_1 = require("./triage/triage");
(0, app_1.initializeApp)({ storageBucket: `${process.env.GCLOUD_PROJECT ?? 'demo-plant-line3'}.appspot.com` });
const db = (0, firestore_1.getFirestore)();
const toDate = (t) => (t instanceof firestore_1.Timestamp ? t.toDate() : new Date());
async function setting(key, fallback) {
    const snap = await db.doc(`assumptions/${key}`).get();
    const v = snap.data()?.value;
    return typeof v === 'number' ? v : fallback;
}
/** Triage a new report: severity + reason + breakdown, eco-tag, route, and an action for severity >= 3. */
exports.onReportCreated = (0, firestore_2.onDocumentCreated)('reports/{id}', async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const r = snap.data();
    if (r.severity !== undefined)
        return; // already triaged (seed or retry)
    const id = event.params.id;
    const loc = (await db.doc(`locations/${r.locationId}`).get()).data();
    const location = {
        name: String(loc?.name ?? r.locationId),
        riskWeight: Number(loc?.riskWeight ?? 1),
    };
    const t = (0, triage_1.triageReport)({
        hazardType: r.hazardType,
        seriousHarmFlag: r.seriousHarmFlag === true,
        injuryNow: r.injuryNow === true,
        transcript: typeof r.transcript === 'string' ? r.transcript : '',
    }, location);
    const now = firestore_1.Timestamp.now();
    if (t.action) {
        await db
            .doc(`actions/${id}`)
            .create({
            reportId: id,
            locationId: r.locationId,
            title: t.action.title,
            owner: t.action.owner,
            dueDate: firestore_1.Timestamp.fromMillis(now.toMillis() + t.action.dueInDays * 86_400_000),
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
            .catch((e) => {
            if (e.code !== 6)
                throw e; // 6 = ALREADY_EXISTS (retry): fine
        });
    }
    await snap.ref.update({
        receiptCode: (0, receipt_1.receiptCode)(id),
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
    const kind = (0, escalation_1.kindForRoute)(t.route);
    if (kind)
        await startEscalation(id, kind, r, location.name, t.severity, now.toDate());
});
/** Create/update/delete the public boardItem for a report, through the whitelisted projection. */
async function syncBoard(id) {
    const ref = db.doc(`boardItems/${id}`);
    const rs = await db.doc(`reports/${id}`).get();
    const r = rs.data();
    if (!r || r.severity === undefined)
        return; // wait for triage
    const delay = await setting('board_publish_delay_hours', domain_1.DEFAULTS.boardPublishDelayHours);
    const created = toDate(r.createdAt);
    if (!(0, board_1.shouldPublish)(r.status, created, new Date(), delay)) {
        await ref.delete();
        return;
    }
    const loc = (await db.doc(`locations/${r.locationId}`).get()).data();
    const a = (await db.doc(`actions/${id}`).get()).data();
    const item = (0, board_1.projectBoardItem)(id, { hazardType: r.hazardType, status: r.status, shift: r.shift, createdAt: created }, {
        name: String(loc?.name ?? r.locationId),
        nameHi: String(loc?.nameHi ?? loc?.name ?? r.locationId),
    }, a
        ? {
            publicFixText: a.publicFixText,
            featured: a.featured,
            closedAt: a.closedAt ? toDate(a.closedAt) : null,
        }
        : null);
    await ref.set(item);
}
exports.onReportWritten = (0, firestore_2.onDocumentWritten)('reports/{id}', (event) => syncBoard(event.params.id));
/** Action progress drives report status; then the board is re-projected. */
exports.onActionWritten = (0, firestore_2.onDocumentWritten)('actions/{id}', async (event) => {
    const id = event.params.id;
    const a = event.data?.after.data();
    if (!a)
        return;
    const next = a.status === 'in_progress' ? 'being_fixed' : a.status === 'closed' ? 'fixed' : null;
    if (next) {
        const ref = db.doc(`reports/${id}`);
        const cur = (await ref.get()).data();
        if (cur && cur.status !== next && cur.status !== 'dismissed') {
            await ref.update({ status: next, updatedAt: firestore_1.FieldValue.serverTimestamp() });
            return; // the report trigger will sync the board
        }
    }
    await syncBoard(id);
});
/** Confirmed camera event -> camera-sourced report (triaged by onReportCreated). Dismissed -> keep only the verdict. */
exports.onEventReviewed = (0, firestore_2.onDocumentUpdated)('events/{id}', async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || before.status !== 'pending' || before.status === after.status)
        return;
    const id = event.params.id;
    const ref = event.data.after.ref;
    if (after.status === 'confirmed') {
        const rid = `cam_${id}`;
        await db
            .doc(`reports/${rid}`)
            .create((0, camera_1.reportFromEvent)({
            rule: after.rule,
            locationId: after.locationId,
            shift: after.shift,
            detectedAt: toDate(after.detectedAt),
        }))
            .catch((e) => {
            if (e.code !== 6)
                throw e;
        });
        await ref.update({ reportId: rid });
    }
    else if (after.status === 'dismissed') {
        await deleteSnapshot(after.snapshotPath);
        await ref.update({ ...retention_1.DISMISSED_SCRUB, snapshotPurgedAt: firestore_1.FieldValue.serverTimestamp() });
    }
});
async function deleteSnapshot(path) {
    if (typeof path !== 'string' || !path)
        return;
    await (0, storage_1.getStorage)().bucket().file(path).delete({ ignoreNotFound: true });
}
function requireStaff(role) {
    if (role !== 'supervisor' && role !== 'ehs_admin') {
        throw new https_1.HttpsError('permission-denied', 'Staff only');
    }
}
/** Publish reports older than the configured delay. In production this would run on a schedule. */
exports.publishDueBoardItems = (0, https_1.onCall)(async (req) => {
    requireStaff(req.auth?.token.role);
    const delay = await setting('board_publish_delay_hours', domain_1.DEFAULTS.boardPublishDelayHours);
    const cutoff = firestore_1.Timestamp.fromMillis(Date.now() - delay * 3_600_000);
    const due = await db
        .collection('reports')
        .where('status', '==', 'received')
        .where('createdAt', '<=', cutoff)
        .get();
    await Promise.all(due.docs.map((d) => syncBoard(d.id)));
    return { checked: due.size };
});
/** Delete pixelated snapshots older than the retention window. In production this would run on a schedule. */
exports.purgeExpiredSnapshots = (0, https_1.onCall)(async (req) => {
    requireStaff(req.auth?.token.role);
    const days = await setting('snapshot_retention_days', domain_1.DEFAULTS.snapshotRetentionDays);
    const all = await db.collection('events').where('snapshotPath', '!=', null).get();
    const expired = (0, retention_1.expiredSnapshots)(all.docs.map((d) => ({
        id: d.id,
        snapshotPath: d.data().snapshotPath,
        status: d.data().status,
        detectedAt: toDate(d.data().detectedAt),
    })), new Date(), days);
    for (const e of expired) {
        await deleteSnapshot(e.snapshotPath);
        await db
            .doc(`events/${e.id}`)
            .update({ snapshotPath: null, snapshotPurgedAt: firestore_1.FieldValue.serverTimestamp() });
    }
    return { purged: expired.length };
});
// ---- Escalation router (SIMULATED dispatch) ----------------------------------------------------
const notifier = new escalation_1.SimulatedNotifier(); // swap for a real provider later (see escalation.ts)
const stepToDoc = (s) => ({
    ...s,
    dueAt: firestore_1.Timestamp.fromDate(s.dueAt),
    notifiedAt: s.notifiedAt ? firestore_1.Timestamp.fromDate(s.notifiedAt) : null,
});
const docToStep = (s) => ({
    ...s,
    dueAt: toDate(s.dueAt),
    notifiedAt: s.notifiedAt ? toDate(s.notifiedAt) : null,
});
async function startEscalation(reportId, kind, report, locationName, severity, startedAt) {
    const loc = (await db.doc(`locations/${report.locationId}`).get()).data();
    await db
        .doc(`escalations/${reportId}`)
        .create({
        reportId,
        kind,
        status: 'active',
        simulated: true,
        locationId: report.locationId,
        locationName,
        severity,
        assemblyPoint: String(loc?.assemblyPoint ?? ''),
        photoPath: report.photoPath ?? null,
        startedAt: firestore_1.Timestamp.fromDate(startedAt),
        chain: (0, escalation_1.buildChain)(kind, startedAt).map(stepToDoc),
        dispatchLog: [],
        createdAt: firestore_1.Timestamp.fromDate(startedAt),
        updatedAt: firestore_1.Timestamp.fromDate(startedAt),
    })
        .catch((e) => {
        if (e.code !== 6)
            throw e;
    });
    await runDueSteps(reportId, 1);
}
/** Notify every due step (simulated) and record it in the dispatch log. */
async function runDueSteps(id, timeScale) {
    const ref = db.doc(`escalations/${id}`);
    const d = (await ref.get()).data();
    if (!d)
        return 0;
    const steps = d.chain.map(docToStep);
    const due = (0, escalation_1.dueSteps)(d.status, steps, toDate(d.startedAt), new Date(), timeScale);
    if (!due.length)
        return 0;
    const log = [...d.dispatchLog];
    for (const s of due) {
        const entry = await notifier.notify({
            reportId: id,
            kind: d.kind,
            role: s.role,
            label: s.label,
            locationName: String(d.locationName),
            severity: Number(d.severity),
            photoPath: d.photoPath ?? null,
            at: new Date(),
            assemblyPoint: String(d.assemblyPoint ?? ''),
        });
        s.state = 'notified';
        s.notifiedAt = new Date();
        log.push({ ...entry, at: firestore_1.Timestamp.fromDate(entry.at) });
    }
    await ref.update({
        chain: steps.map(stepToDoc),
        dispatchLog: log,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return due.length;
}
/**
 * Advance active escalations. The dispatcher screen calls this every few seconds while it is open;
 * in production this would be a scheduled function. `timeScale` speeds up the simulated clock for demos.
 */
exports.advanceEscalations = (0, https_1.onCall)(async (req) => {
    requireStaff(req.auth?.token.role);
    const scale = Math.min(120, Math.max(1, Number(req.data?.timeScale) || 1));
    const active = await db.collection('escalations').where('status', '==', 'active').get();
    let notified = 0;
    for (const d of active.docs)
        notified += await runDueSteps(d.id, scale);
    return { active: active.size, notified };
});
