"""Second backend patch for the redesign: responder workload, evidence upload to existing incidents, sites."""

import pathlib

B = pathlib.Path(__file__).resolve().parents[1] / "backend" / "app"


def sub(path: str, old: str, new: str) -> None:
    p = B / path
    s = p.read_text(encoding="utf-8")
    assert old in s, (path, old[:70])
    p.write_text(s.replace(old, new, 1), encoding="utf-8", newline="\n")


sub(
    "routers/staff.py",
    '@router.post("/responders")',
    '''@router.get("/responders/workload")
def responder_workload(_: dict = Depends(require("responder"))) -> list[dict]:
    """Per responder: open assigned incidents, total handled, mean minutes to acknowledge, resolved count."""
    out = []
    for r in db.rows("SELECT id,name,department,role,available FROM responders ORDER BY department,name"):
        mine = db.rows("SELECT status,created_at,acknowledged_at,resolved_at,severity FROM incidents WHERE assigned_responder_id=?", (r["id"],))
        ack = [m for i in mine if (m := _mins(i["created_at"], i["acknowledged_at"])) is not None]
        esc = db.one("SELECT COUNT(*) n FROM status_history h JOIN incidents i ON i.id=h.incident_id WHERE i.assigned_responder_id=? AND h.status='escalated'", (r["id"],)) or {}
        out.append({
            **r,
            "open": sum(1 for i in mine if i["status"] in OPEN_STATUSES),
            "handled": len(mine),
            "resolved": sum(1 for i in mine if i["status"] in ("resolved", "closed")),
            "avg_ack_min": round(sum(ack) / len(ack), 1) if ack else None,
            "escalations": esc.get("n") or 0,
        })
    return out


@router.post("/incidents/{iid}/evidence")
async def add_evidence(iid: str, files: list[UploadFile] = File(...), user: dict = Depends(require("responder"))) -> dict:
    """Staff can attach more evidence to an existing incident (same type/size checks as public uploads)."""
    from ..security import classify_upload

    if not svc.get_incident(iid):
        raise HTTPException(404)
    n = 0
    for f in files[:6]:
        data = await f.read()
        kind = classify_upload(f.filename or "file", f.content_type or "", len(data))
        svc.save_evidence(iid, kind, f.filename or "file", data, f.content_type or "", f"added by {user['u']}")
        n += 1
    svc.audit(user["u"], "incident.evidence", iid, f"{n} file(s)")
    realtime.publish("incident.updated", {"incident": svc.public_row(svc.get_incident(iid) or {})})
    return {"added": n}


@router.post("/responders")''',
)
sub("routers/staff.py", "from fastapi import APIRouter, Depends, HTTPException, Query", "from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile")
print("patched")
