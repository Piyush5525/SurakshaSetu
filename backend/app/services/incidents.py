"""Single entry point that every source (QR, portal, CCTV, audio, admin) uses to create an incident."""

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from .. import db
from ..config import settings
from ..domain import OPEN_STATUSES, can_move, now_iso, triage
from . import notify, realtime

ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_incident_id() -> str:
    day = datetime.now(UTC).strftime("%Y%m%d")
    for _ in range(20):
        cand = f"INC-{day}-" + "".join(secrets.choice(ID_ALPHABET) for _ in range(4))
        if not db.one("SELECT 1 FROM incidents WHERE id=?", (cand,)):
            return cand
    return f"INC-{day}-{uuid.uuid4().hex[:6].upper()}"


def audit(actor: str | None, action: str, target: str | None = None, detail: str = "") -> None:
    db.run("INSERT INTO audit_log(ts,actor,action,target,detail) VALUES(?,?,?,?,?)", (now_iso(), actor, action, target, detail[:500]))


def _history(incident_id: str, status: str, actor: str | None, note: str = "") -> None:
    db.run("INSERT INTO status_history(incident_id,status,ts,actor,note) VALUES(?,?,?,?,?)", (incident_id, status, now_iso(), actor, note))


def create_incident(
    *,
    category: str,
    description: str,
    source: str,
    asset_id: str | None = None,
    camera_id: str | None = None,
    audio_id: str | None = None,
    hazard_type: str | None = None,
    serious_harm: bool = False,
    injury_now: bool = False,
    lang: str = "en",
    reporter_name: str | None = None,
    reporter_user_id: int | None = None,
    ai: dict | None = None,
    requires_verification: bool = False,
    simulated: bool = False,
    created_by: str | None = None,
    severity_override: int | None = None,
    notify_now: bool = True,
) -> dict:
    """Create, triage, route and alert. Returns the stored incident (with a private tracking_code)."""
    loc = {"site": None, "building": None, "floor": None, "zone": None}
    risk = 1.0
    src_row = None
    if asset_id:
        src_row = db.one("SELECT * FROM assets WHERE id=?", (asset_id,))
    elif camera_id:
        src_row = db.one("SELECT * FROM cameras WHERE id=?", (camera_id,))
        if src_row and src_row.get("asset_id"):
            asset_id = src_row["asset_id"]
    if src_row:
        loc = {k: src_row.get(k) for k in loc}
        risk = float(src_row.get("risk_weight") or 1.0)
    if asset_id and not src_row:
        a = db.one("SELECT * FROM assets WHERE id=?", (asset_id,))
        if a:
            loc = {k: a.get(k) for k in loc}
            risk = float(a.get("risk_weight") or 1.0)
    t = triage(category=category, text=description, serious_harm=serious_harm, injury_now=injury_now, risk_weight=risk, source=source)
    sev = t["severity"]
    reasons = list(t["reasons"])
    if severity_override:
        sev = max(1, min(5, int(severity_override)))
        reasons.append(f"Severity set to {sev} by {created_by or 'staff'}")
    iid = new_incident_id()
    ts = now_iso()
    dept = t["department"]
    track = secrets.token_urlsafe(9)
    db.run(
        """INSERT INTO incidents(id,category,description,source,hazard_type,asset_id,camera_id,audio_id,site,building,floor,zone,
        created_at,updated_at,severity,severity_reason_json,ai_model,ai_model_version,ai_class,ai_confidence,ai_meta_json,
        requires_verification,simulated,department,status,injury_now,serious_harm,lang,reporter_name,tracking_code,reporter_user_id,eco_tag)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            iid, category, description[:2000], source, hazard_type, asset_id, camera_id, audio_id,
            loc["site"], loc["building"], loc["floor"], loc["zone"], ts, ts, sev, db.jdump(reasons),
            (ai or {}).get("model"), (ai or {}).get("version"), (ai or {}).get("cls"), (ai or {}).get("confidence"),
            db.jdump((ai or {}).get("meta")) if ai else None,
            int(requires_verification), int(simulated), dept, "reported", int(injury_now), int(serious_harm), lang,
            (reporter_name or None), track, reporter_user_id, t["eco_tag"],
        ),
    )
    _history(iid, "reported", created_by or source, f"via {source}")
    audit(created_by or source, "incident.create", iid, f"{category} sev {sev}")
    _history(iid, "analysed", "triage", "; ".join(reasons)[:300])
    db.run("UPDATE incidents SET status='analysed' WHERE id=?", (iid,))
    inc = get_incident(iid)
    assert inc is not None
    if notify_now:
        alert(inc)
        inc = get_incident(iid) or inc
    realtime.publish("incident.created", {"incident": public_row(inc)})
    inc["tracking_code"] = track
    return inc


def alert(inc: dict) -> None:
    res = notify.dispatch_alert(inc, 0)
    db.run("UPDATE incidents SET status='alerted', updated_at=? WHERE id=? AND status IN ('reported','analysed')", (now_iso(), inc["id"]))
    _history(inc["id"], "alerted", "notifier", ", ".join(f"{r['status']}" for r in res))
    realtime.publish("notification", {"incident_id": inc["id"]})


def change_status(iid: str, new: str, actor: str, note: str = "") -> dict:
    inc = db.one("SELECT * FROM incidents WHERE id=?", (iid,))
    if not inc:
        raise KeyError(iid)
    if not can_move(inc["status"], new):
        raise ValueError(f"Cannot move {inc['status']} -> {new}")
    sets = ["status=?", "updated_at=?"]
    args: list = [new, now_iso()]
    if new == "acknowledged" and not inc["acknowledged_at"]:
        sets.append("acknowledged_at=?")
        args.append(now_iso())
        db.run("UPDATE notifications SET acknowledged_at=? WHERE incident_id=? AND acknowledged_at IS NULL", (now_iso(), iid))
    if new == "resolved":
        sets.append("resolved_at=?")
        args.append(now_iso())
    if new == "closed":
        sets.append("closed_at=?")
        args.append(now_iso())
    args.append(iid)
    db.run(f"UPDATE incidents SET {', '.join(sets)} WHERE id=?", args)
    _history(iid, new, actor, note)
    audit(actor, "incident.status", iid, f"{inc['status']}->{new} {note}")
    out = get_incident(iid)
    realtime.publish("incident.updated", {"incident": public_row(out) if out else {}})
    return out or {}


def save_evidence(incident_id: str, kind: str, filename: str, data: bytes, mime: str, note: str = "") -> dict:
    eid = uuid.uuid4().hex
    ext = Path(filename).suffix.lower() or ".bin"
    folder = settings.EVIDENCE_DIR / incident_id
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{eid}{ext}"
    path.write_bytes(data)
    keep = (datetime.now(UTC) + timedelta(days=settings.EVIDENCE_RETENTION_DAYS)).isoformat(timespec="seconds")
    db.run(
        "INSERT INTO evidence(id,incident_id,kind,path,mime,size,created_at,retention_until,note) VALUES(?,?,?,?,?,?,?,?,?)",
        (eid, incident_id, kind, str(path.relative_to(settings.EVIDENCE_DIR)), mime, len(data), now_iso(), keep, note),
    )
    return {"id": eid, "kind": kind}


def get_incident(iid: str) -> dict | None:
    return db.one("SELECT * FROM incidents WHERE id=?", (iid,))


def public_row(inc: dict) -> dict:
    """What staff dashboards and websockets see (no tracking code, no reporter name)."""
    out = {k: v for k, v in inc.items() if k not in ("tracking_code", "reporter_name", "reporter_user_id")}
    out["severity_reasons"] = db.jload(inc.get("severity_reason_json"), [])
    out["ai_meta"] = db.jload(inc.get("ai_meta_json"), None)
    out.pop("severity_reason_json", None)
    out.pop("ai_meta_json", None)
    return out


def open_status_sql() -> str:
    return ",".join(f"'{s}'" for s in OPEN_STATUSES)
