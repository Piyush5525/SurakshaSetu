"""Staff-only: incident list/detail/workflow, evidence viewing, responders, notifications, analytics, map."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .. import db
from ..config import settings
from ..domain import CATEGORIES, DEPARTMENTS, OPEN_STATUSES, STATUSES, now_iso
from ..security import require, sign_evidence, verify_evidence_sig
from ..services import incidents as svc
from ..services import notify, realtime

router = APIRouter()


def _visible(user: dict) -> tuple[str, list]:
    """Department managers and responders only see their department's incidents; admin sees everything."""
    if user["role"] in ("admin",) or not user.get("dept"):
        return "1=1", []
    return "(department=? OR EXISTS (SELECT 1 FROM responders r WHERE r.id=incidents.assigned_responder_id AND r.department=?))", [user["dept"], user["dept"]]


@router.get("/incidents")
def list_incidents(
    status: str | None = None, category: str | None = None, source: str | None = None, department: str | None = None,
    severity_min: int | None = None, asset_id: str | None = None, q: str | None = None, open_only: bool = False,
    limit: int = Query(200, le=500), offset: int = 0, user: dict = Depends(require("responder")),
) -> dict:
    where, args = _visible(user)
    clauses = [where]
    for col, val in (("status", status), ("category", category), ("source", source), ("department", department), ("asset_id", asset_id)):
        if val:
            clauses.append(f"{col}=?")
            args.append(val)
    if severity_min:
        clauses.append("severity>=?")
        args.append(severity_min)
    if open_only:
        clauses.append(f"status IN ({svc.open_status_sql()})")
    if q:
        clauses.append("(id LIKE ? OR description LIKE ?)")
        args += [f"%{q}%", f"%{q}%"]
    sql = " AND ".join(clauses)
    total = db.one(f"SELECT COUNT(*) n FROM incidents WHERE {sql}", args)["n"]  # type: ignore[index]
    rowsx = db.rows(f"SELECT * FROM incidents WHERE {sql} ORDER BY created_at DESC LIMIT ? OFFSET ?", [*args, limit, offset])
    return {"total": total, "items": [svc.public_row(r) for r in rowsx]}


@router.get("/incidents/{iid}")
def incident_detail(iid: str, user: dict = Depends(require("responder"))) -> dict:
    r = svc.get_incident(iid)
    if not r:
        raise HTTPException(404)
    where, args = _visible(user)
    if not db.one(f"SELECT 1 FROM incidents WHERE id=? AND {where}", [iid, *args]):
        raise HTTPException(403, "Not your department")
    ev = db.rows("SELECT id,kind,mime,size,created_at,note FROM evidence WHERE incident_id=? ORDER BY created_at", (iid,))
    for e in ev:
        e["url"] = f"/api/evidence/{e['id']}?{sign_evidence(e['id'])}"
    return {
        **svc.public_row(r),
        "evidence": ev,
        "history": db.rows("SELECT status,ts,actor,note FROM status_history WHERE incident_id=? ORDER BY id", (iid,)),
        "notifications": db.rows("SELECT * FROM notifications WHERE incident_id=? ORDER BY id", (iid,)),
        "responder": db.one("SELECT id,name,department FROM responders WHERE id=?", (r["assigned_responder_id"],)) if r["assigned_responder_id"] else None,
    }


@router.get("/evidence/{eid}")
def evidence_file(eid: str, exp: int, sig: str) -> FileResponse:
    """Short-lived signed link (issued only to signed-in staff), so <img>/<video> tags work without headers."""
    if not verify_evidence_sig(eid, exp, sig):
        raise HTTPException(403, "Link expired or invalid")
    e = db.one("SELECT path,mime FROM evidence WHERE id=?", (eid,))
    if not e:
        raise HTTPException(404)
    p = (settings.EVIDENCE_DIR / e["path"]).resolve()
    if settings.EVIDENCE_DIR.resolve() not in p.parents or not p.exists():
        raise HTTPException(404)
    return FileResponse(p, media_type=e["mime"] or "application/octet-stream")


class StatusBody(BaseModel):
    status: str
    note: str = ""


@router.post("/incidents/{iid}/status")
def set_status(iid: str, body: StatusBody, user: dict = Depends(require("responder"))) -> dict:
    if body.status not in STATUSES:
        raise HTTPException(422, "unknown status")
    try:
        return svc.public_row(svc.change_status(iid, body.status, user["u"], body.note))
    except KeyError:
        raise HTTPException(404) from None
    except ValueError as e:
        raise HTTPException(409, str(e)) from None


class AssignBody(BaseModel):
    department: str | None = None
    responder_id: int | None = None


@router.post("/incidents/{iid}/assign")
def assign(iid: str, body: AssignBody, user: dict = Depends(require("manager"))) -> dict:
    inc = svc.get_incident(iid)
    if not inc:
        raise HTTPException(404)
    if body.department:
        if body.department not in DEPARTMENTS:
            raise HTTPException(422, "unknown department")
        db.run("UPDATE incidents SET department=?, updated_at=? WHERE id=?", (body.department, now_iso(), iid))
    if body.responder_id:
        r = db.one("SELECT * FROM responders WHERE id=?", (body.responder_id,))
        if not r:
            raise HTTPException(404, "responder not found")
        dept = body.department or inc["department"]
        if r["department"] != dept:
            raise HTTPException(409, f"{r['name']} belongs to {r['department']}, not {dept}")
        if not r["available"]:
            raise HTTPException(409, f"{r['name']} is not available")
        db.run("UPDATE incidents SET assigned_responder_id=?, updated_at=? WHERE id=?", (r["id"], now_iso(), iid))
        if r.get("telegram_chat_id"):
            notify.send_telegram(iid, "You have been assigned:\n" + notify.build_message(svc.get_incident(iid) or inc), r["telegram_chat_id"])
        try:
            svc.change_status(iid, "assigned", user["u"], f"assigned to {r['name']}")
        except ValueError:
            pass
    svc.audit(user["u"], "incident.assign", iid, f"{body.department} {body.responder_id}")
    out = svc.get_incident(iid) or inc
    realtime.publish("incident.updated", {"incident": svc.public_row(out)})
    return svc.public_row(out)


class NotesBody(BaseModel):
    investigation_notes: str | None = Field(None, max_length=4000)
    root_cause: str | None = Field(None, max_length=2000)
    corrective_action: str | None = Field(None, max_length=2000)
    preventive_action: str | None = Field(None, max_length=2000)
    public_update: str | None = Field(None, max_length=300)
    severity: int | None = Field(None, ge=1, le=5)
    category: str | None = None


@router.patch("/incidents/{iid}")
def update_notes(iid: str, body: NotesBody, user: dict = Depends(require("responder"))) -> dict:
    inc = svc.get_incident(iid)
    if not inc:
        raise HTTPException(404)
    data = body.model_dump(exclude_none=True)
    if "category" in data and data["category"] not in CATEGORIES:
        raise HTTPException(422, "unknown category")
    if "severity" in data or "category" in data:
        if user["role"] not in ("manager", "admin"):
            raise HTTPException(403, "Only managers can change severity or category")
    for k, v in data.items():
        db.run(f"UPDATE incidents SET {k}=?, updated_at=? WHERE id=?", (v, now_iso(), iid))  # keys come from the model
    if "severity" in data:
        reasons = db.jload(inc["severity_reason_json"], [])
        reasons.append(f"Severity set to {data['severity']} by {user['u']} (human assessment)")
        db.run("UPDATE incidents SET severity_reason_json=? WHERE id=?", (db.jdump(reasons), iid))
    svc.audit(user["u"], "incident.update", iid, ",".join(data))
    out = svc.get_incident(iid) or inc
    realtime.publish("incident.updated", {"incident": svc.public_row(out)})
    return svc.public_row(out)


class ManualIncident(BaseModel):
    category: str
    description: str = Field(max_length=2000)
    asset_id: str | None = None
    serious_harm: bool = False
    injury_now: bool = False


@router.post("/incidents")
def create_manual(body: ManualIncident, user: dict = Depends(require("responder"))) -> dict:
    if body.category not in CATEGORIES:
        raise HTTPException(422, "unknown category")
    inc = svc.create_incident(
        category=body.category, description=body.description, source="admin", asset_id=body.asset_id,
        serious_harm=body.serious_harm, injury_now=body.injury_now, created_by=user["u"],
    )
    return svc.public_row(inc)


# ---- Responders ------------------------------------------------------------------------------------------
class ResponderIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    department: str
    role: str = "responder"
    telegram_chat_id: str | None = None
    phone: str | None = None
    available: bool = True


@router.get("/responders")
def responders(department: str | None = None, _: dict = Depends(require("responder"))) -> list[dict]:
    sql = "SELECT id,name,department,role,available,(telegram_chat_id IS NOT NULL AND telegram_chat_id!='') AS has_telegram FROM responders"
    return db.rows(sql + (" WHERE department=?" if department else "") + " ORDER BY department,name", (department,) if department else ())


@router.post("/responders")
def add_responder(body: ResponderIn, user: dict = Depends(require("manager"))) -> dict:
    if body.department not in DEPARTMENTS:
        raise HTTPException(422, "unknown department")
    rid = db.run(
        "INSERT INTO responders(name,department,role,telegram_chat_id,phone,available) VALUES(?,?,?,?,?,?)",
        (body.name, body.department, body.role, body.telegram_chat_id, body.phone, int(body.available)),
    )
    svc.audit(user["u"], "responder.create", str(rid))
    return {"id": rid}


@router.patch("/responders/{rid}")
def responder_available(rid: int, available: bool, user: dict = Depends(require("responder"))) -> dict:
    db.run("UPDATE responders SET available=? WHERE id=?", (int(available), rid))
    svc.audit(user["u"], "responder.availability", str(rid), str(available))
    return {"ok": True}


class RouteIn(BaseModel):
    department: str
    secondary: str | None = None


@router.get("/routing")
def get_routing(_: dict = Depends(require("responder"))) -> list[dict]:
    from ..domain import DEPARTMENT_BY_CATEGORY, SECONDARY_DEPARTMENT

    over = {r["category"]: r for r in db.rows("SELECT * FROM routing")}
    return [
        {
            "category": c,
            "label": CATEGORIES[c],
            "department": over[c]["department"] if c in over else DEPARTMENT_BY_CATEGORY[c],
            "secondary": over[c]["secondary"] if c in over else SECONDARY_DEPARTMENT.get(c),
            "customised": c in over,
        }
        for c in CATEGORIES
    ]


@router.put("/routing/{category}")
def put_routing(category: str, body: RouteIn, user: dict = Depends(require("admin"))) -> dict:
    if category not in CATEGORIES:
        raise HTTPException(404, "unknown category")
    for d in (body.department, body.secondary):
        if d and d not in DEPARTMENTS:
            raise HTTPException(422, f"unknown department {d}")
    db.run("INSERT OR REPLACE INTO routing(category,department,secondary) VALUES(?,?,?)", (category, body.department, body.secondary or None))
    svc.audit(user["u"], "routing.update", category, f"{body.department}/{body.secondary}")
    return {"ok": True}


# ---- Notifications ---------------------------------------------------------------------------------------
@router.get("/notifications")
def notifications(limit: int = 200, _: dict = Depends(require("responder"))) -> list[dict]:
    return db.rows("SELECT * FROM notifications ORDER BY id DESC LIMIT ?", (min(limit, 500),))


@router.get("/audit")
def audit_log(limit: int = 200, _: dict = Depends(require("admin"))) -> list[dict]:
    return db.rows("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (min(limit, 1000),))


@router.get("/system/status")
def system_status(_: dict = Depends(require("responder"))) -> dict:
    return {
        "demo_mode": settings.DEMO_MODE,
        "telegram_configured": bool(settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID),
        "calls_configured": bool(settings.OMNIDIM_API_KEY and settings.OMNIDIM_AGENT_ID and settings.ALERT_PHONE_NUMBER),
        "calls_enabled": settings.CALLS_ENABLED,
        "escalate_after_s": settings.ESCALATE_AFTER_S,
        "evidence_retention_days": settings.EVIDENCE_RETENTION_DAYS,
        "mode_text": "SIMULATED notifications (nothing is sent)" if settings.DEMO_MODE else "LIVE notifications are ON",
    }


class TestAlert(BaseModel):
    channel: str = "telegram"  # telegram | call


@router.post("/system/test-alert")
def test_alert(body: TestAlert, user: dict = Depends(require("admin"))) -> dict:
    """One clearly labelled test message. Respects DEMO_MODE: simulated unless the operator turned it off."""
    text = f"TEST ALERT from the control centre ({user['u']}). No incident. {now_iso()}"
    if body.channel == "call":
        res = notify.place_call("TEST", text, None)
    else:
        res = notify.send_telegram("TEST", text, None)
    svc.audit(user["u"], "system.test_alert", body.channel, res["status"])
    return res


# ---- Analytics + map -------------------------------------------------------------------------------------
def _mins(a: str | None, b: str | None) -> float | None:
    if not a or not b:
        return None
    return (datetime.fromisoformat(b) - datetime.fromisoformat(a)).total_seconds() / 60


@router.get("/analytics")
def analytics(days: int = 30, user: dict = Depends(require("responder"))) -> dict:
    where, args = _visible(user)
    since = (datetime.now(UTC) - timedelta(days=days)).isoformat(timespec="seconds")
    base = f"{where} AND created_at>=?"
    a = [*args, since]
    allrows = db.rows(f"SELECT * FROM incidents WHERE {base}", a)

    def group(col: str) -> list[dict]:
        return db.rows(f"SELECT {col} AS key, COUNT(*) AS n FROM incidents WHERE {base} GROUP BY {col} ORDER BY n DESC", a)

    ack = [m for r in allrows if (m := _mins(r["created_at"], r["acknowledged_at"])) is not None]
    res = [m for r in allrows if (m := _mins(r["created_at"], r["resolved_at"])) is not None]
    ai = [r for r in allrows if r["source"] in ("cctv", "audio")]
    fp = [r for r in ai if r["status"] == "false_positive"]
    reviewed = [r for r in ai if r["status"] not in ("reported", "analysed", "alerted")]
    trend = db.rows(f"SELECT substr(created_at,1,10) AS day, COUNT(*) AS n FROM incidents WHERE {base} GROUP BY day ORDER BY day", a)
    repeat = db.rows(
        f"SELECT asset_id AS key, COUNT(*) AS n FROM incidents WHERE {base} AND asset_id IS NOT NULL GROUP BY asset_id HAVING n>=3 ORDER BY n DESC LIMIT 10", a
    )
    return {
        "days": days,
        "total": len(allrows),
        "open": sum(1 for r in allrows if r["status"] in OPEN_STATUSES),
        "critical": sum(1 for r in allrows if r["severity"] >= 4 and r["status"] in OPEN_STATUSES),
        "awaiting_ack": sum(1 for r in allrows if r["status"] in ("reported", "analysed", "alerted")),
        "resolved": sum(1 for r in allrows if r["status"] in ("resolved", "closed")),
        "by_category": group("category"),
        "by_department": group("department"),
        "by_location": group("COALESCE(asset_id, zone, 'unknown')"),
        "by_source": group("source"),
        "trend": trend,
        "avg_ack_minutes": round(sum(ack) / len(ack), 1) if ack else None,
        "avg_resolve_minutes": round(sum(res) / len(res), 1) if res else None,
        "repeat_locations": repeat,
        "ai_events": len(ai),
        "ai_reviewed": len(reviewed),
        "false_positive_rate": round(len(fp) / len(reviewed), 3) if reviewed else None,
        "false_positive_note": "Share of reviewed AI events marked false positive. Simulated events are included only if present.",
        "simulated_count": sum(1 for r in allrows if r["simulated"]),
    }


@router.get("/map")
def factory_map(user: dict = Depends(require("responder"))) -> dict:
    assets = db.rows(
        f"""SELECT a.id,a.name,a.kind,a.x,a.y,a.w,a.h,a.zone,
        (SELECT COUNT(*) FROM incidents i WHERE i.asset_id=a.id AND i.status IN ({svc.open_status_sql()})) AS open_count,
        (SELECT COUNT(*) FROM incidents i WHERE i.asset_id=a.id) AS total_count FROM assets a"""
    )
    cams = db.rows("SELECT id,name,kind,x,y,status,enabled,simulated,zone FROM cameras")
    pins = db.rows(
        f"""SELECT i.id,i.category,i.severity,i.source,i.status,i.simulated,COALESCE(a.x,c.x) AS x,COALESCE(a.y,c.y) AS y
        FROM incidents i LEFT JOIN assets a ON a.id=i.asset_id LEFT JOIN cameras c ON c.id=i.camera_id
        WHERE i.status IN ({svc.open_status_sql()}) AND COALESCE(a.x,c.x) IS NOT NULL"""
    )
    return {"assets": assets, "cameras": cams, "incidents": pins}
