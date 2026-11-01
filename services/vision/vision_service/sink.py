"""Where events go. FirestoreSink writes to the Firebase emulators (default); LocalSink is a dry run to disk."""

from __future__ import annotations

import json
import os
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

from .rules import RuleEvent


def shift_for_hour(hour: int) -> str:
    """ASSUMPTION: A 06-14, B 14-22, C 22-06 (same as the web app)."""
    if 6 <= hour < 14:
        return "A"
    if 14 <= hour < 22:
        return "B"
    return "C"


class Sink(Protocol):
    def emit(self, event: RuleEvent, snapshot_jpeg: bytes, simulated: bool) -> str: ...


def _doc(event: RuleEvent, snapshot_path: str | None, simulated: bool, now: datetime) -> dict:
    return {
        "rule": event.rule,
        "zoneId": event.zone_id,
        "locationId": event.location_id,
        "shift": shift_for_hour(now.astimezone().hour),
        "detectedAt": now,
        "confidence": event.confidence,
        "measure": event.measure,
        "snapshotPath": snapshot_path,
        "status": "pending",
        "reviewedByRole": None,
        "reviewedAt": None,
        "reportId": None,
        "simulated": simulated,
        "createdAt": now,
        "updatedAt": now,
    }


class LocalSink:
    """Dry run: writes event JSON + pixelated JPEG into a folder. No network."""

    def __init__(self, out_dir: str | Path) -> None:
        self.dir = Path(out_dir)
        self.dir.mkdir(parents=True, exist_ok=True)

    def emit(self, event: RuleEvent, snapshot_jpeg: bytes, simulated: bool) -> str:
        eid = uuid.uuid4().hex[:12]
        now = datetime.now(UTC)
        (self.dir / f"{eid}.jpg").write_bytes(snapshot_jpeg)
        doc = _doc(event, f"events/{eid}.jpg", simulated, now)
        doc["detectedAt"] = doc["createdAt"] = doc["updatedAt"] = now.isoformat()
        (self.dir / f"{eid}.json").write_text(json.dumps(doc, indent=2), encoding="utf-8")
        return eid


class FirestoreSink:
    """Posts to Firestore `events` and uploads the pixelated snapshot to Storage `events/{id}.jpg`.

    Uses the emulators via FIRESTORE_EMULATOR_HOST and STORAGE_EMULATOR_HOST (no credentials needed).
    """

    def __init__(self, project: str, bucket: str, auto_report: bool = False) -> None:
        self.auto_report = auto_report
        from google.auth.credentials import AnonymousCredentials
        from google.cloud import firestore, storage

        os.environ.setdefault("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")
        host = os.environ.get("FIREBASE_STORAGE_EMULATOR_HOST", "127.0.0.1:9199")
        os.environ["STORAGE_EMULATOR_HOST"] = host if host.startswith("http") else f"http://{host}"
        creds = AnonymousCredentials()
        self.db = firestore.Client(project=project, credentials=creds)
        self.bucket = storage.Client(project=project, credentials=creds).bucket(bucket)

    def emit(self, event: RuleEvent, snapshot_jpeg: bytes, simulated: bool) -> str:
        ref = self.db.collection("events").document()
        path = f"events/{ref.id}.jpg"
        self.bucket.blob(path).upload_from_string(snapshot_jpeg, content_type="image/jpeg")
        ref.set(_doc(event, path, simulated, datetime.now(UTC)))
        if self.auto_report:
            # Straight to a triaged report (the Cloud Function reacts to pending -> confirmed).
            # Marked "auto" so the dashboard shows nobody reviewed it. Use with care: false alarms.
            ref.update({"status": "confirmed", "reviewedByRole": "auto", "reviewedAt": datetime.now(UTC)})
        return ref.id
