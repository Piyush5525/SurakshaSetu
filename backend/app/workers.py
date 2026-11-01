"""Background threads: unacknowledged-critical escalation and evidence retention."""

import logging
import threading
import time
from datetime import UTC, datetime

from . import db
from .config import settings
from .domain import now_iso
from .services import incidents as svc
from .services import notify, realtime

log = logging.getLogger("workers")
_stop = threading.Event()


def escalate_once() -> list[str]:
    """Critical incidents nobody acknowledged within ESCALATE_AFTER_S get one escalation (managers + call)."""
    done = []
    now = datetime.now(UTC).timestamp()
    for r in db.rows("SELECT * FROM incidents WHERE severity>=4 AND status IN ('reported','analysed','alerted')"):
        age = now - datetime.fromisoformat(r["created_at"]).timestamp()
        if age < settings.ESCALATE_AFTER_S:
            continue
        if db.one("SELECT 1 FROM notifications WHERE incident_id=? AND level>=1", (r["id"],)):
            continue
        notify.dispatch_alert(r, 1)
        db.run("UPDATE incidents SET status='escalated', updated_at=? WHERE id=?", (now_iso(), r["id"]))
        svc.audit("escalation", "incident.escalate", r["id"], f"unacknowledged for {int(age)}s")
        db.run("INSERT INTO status_history(incident_id,status,ts,actor,note) VALUES(?,?,?,?,?)", (r["id"], "escalated", now_iso(), "escalation", f"no acknowledgement after {int(age)}s"))
        realtime.publish("incident.updated", {"incident": svc.public_row(svc.get_incident(r["id"]) or r)})
        done.append(r["id"])
    return done


def purge_evidence() -> int:
    n = 0
    for e in db.rows("SELECT id,path FROM evidence WHERE retention_until IS NOT NULL AND retention_until<?", (now_iso(),)):
        try:
            (settings.EVIDENCE_DIR / e["path"]).unlink(missing_ok=True)
        except OSError:
            continue
        db.run("DELETE FROM evidence WHERE id=?", (e["id"],))
        n += 1
    return n


def _loop() -> None:
    last_purge = 0.0
    while not _stop.wait(10):
        try:
            if settings.ESCALATION_ENABLED:
                escalate_once()
            if time.time() - last_purge > 3600:
                purge_evidence()
                last_purge = time.time()
        except Exception:  # keep the thread alive
            log.exception("worker loop error")


def start() -> None:
    _stop.clear()
    threading.Thread(target=_loop, daemon=True, name="escalation").start()


def stop() -> None:
    _stop.set()
