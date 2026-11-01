"""Login-free reporting for the QR sticker app and the worker portal, plus status tracking and the public board."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel

from .. import db
from ..domain import CATEGORIES, DEPARTMENT_BY_CATEGORY
from ..security import classify_upload, optional_user, rate_limit, rate_limit_read
from ..services import incidents as svc

router = APIRouter(prefix="/public")

HAZARD_TO_CATEGORY = {
    "pinch_jam": "machinery_accident",
    "electrical_lockout": "machinery_accident",
    "forklift": "warehouse_accident",
    "chemical_spill": "chemical_spill",
    "slip_trip": "worker_safety",
    "manual_handling": "storage_handling",
    "other": "other",
}


@router.get("/help")
def help_info() -> dict:
    """Emergency page details. Nothing here places a call; the contact is only displayed if the plant set one."""
    from ..config import settings

    return {"site": "Demo Plant — Line 3", "contact": settings.SITE_EMERGENCY_CONTACT, "assembly_point": settings.ASSEMBLY_POINT}


@router.get("/facts")
def facts() -> dict:
    """Verified public L'Oréal information with sources. Not internal data; see facts.py for the integrity rules."""
    from ..facts import FACTS, NOT_VERIFIED, RETRIEVED

    return {"retrieved": RETRIEVED, "facts": FACTS, "not_verified": NOT_VERIFIED}


@router.get("/categories")
def categories() -> list[dict]:
    from ..domain import AI_COVERAGE

    return [
        {"id": k, "label": v, "department": DEPARTMENT_BY_CATEGORY[k], "ai": AI_COVERAGE[k]}
        for k, v in CATEGORIES.items()
    ]


@router.post("/reports", dependencies=[Depends(rate_limit)])
async def submit_report(
    request: Request,
    category: str | None = Form(None),
    hazard_type: str | None = Form(None),
    description: str = Form("", max_length=2000),
    asset_id: str | None = Form(None),
    qr_token: str | None = Form(None),
    source: str = Form("portal"),
    serious_harm: bool = Form(False),
    injury_now: bool = Form(False),
    lang: str = Form("en"),
    reporter_name: str | None = Form(None, max_length=60),
    files: list[UploadFile] = File(default=[]),
    user: dict | None = Depends(optional_user),
) -> dict:
    """No login needed. A QR scan sends qr_token (the machine is resolved server-side); the portal sends asset_id."""
    if source not in ("qr", "portal"):
        raise HTTPException(422, "source must be qr or portal")
    if qr_token:
        a = db.one("SELECT id,qr_active FROM assets WHERE qr_token=?", (qr_token,))
        if not a:
            raise HTTPException(404, "Unknown QR code")
        if not a["qr_active"]:
            raise HTTPException(410, "This QR code has been disabled")
        asset_id = a["id"]
        source = "qr"
    if asset_id and not db.one("SELECT 1 FROM assets WHERE id=?", (asset_id,)):
        raise HTTPException(404, "Unknown machine/location")
    cat = category or HAZARD_TO_CATEGORY.get(hazard_type or "other", "other")
    if cat not in CATEGORIES:
        raise HTTPException(422, "Unknown category")
    if not description.strip() and not files and not hazard_type and not category:
        raise HTTPException(422, "Please add a category, some details, or a photo")
    if len(files) > 6:
        raise HTTPException(413, "At most 6 files")
    prepared = []
    for f in files:
        data = await f.read()
        kind = classify_upload(f.filename or "file", f.content_type or "", len(data))
        prepared.append((kind, f.filename or "file", data, f.content_type or ""))
    inc = svc.create_incident(
        category=cat,
        description=description.strip(),
        source=source,
        asset_id=asset_id,
        hazard_type=hazard_type,
        serious_harm=serious_harm,
        injury_now=injury_now,
        lang="hi" if lang == "hi" else "en",
        reporter_name=(reporter_name or "").strip() or None,
        reporter_user_id=int(user["sub"]) if user else None,
        notify_now=False,
    )
    for kind, name, data, mime in prepared:
        svc.save_evidence(inc["id"], kind, name, data, mime)
    svc.alert(inc)  # alert after evidence exists so the dashboard shows it immediately
    return {"id": inc["id"], "tracking_code": inc["tracking_code"], "severity": None, "department": inc["department"]}


class TrackItem(BaseModel):
    id: str
    code: str


def _tracked(i: dict) -> dict:
    hist = db.rows("SELECT status,ts,note FROM status_history WHERE incident_id=? AND actor NOT IN ('triage','notifier') ORDER BY id", (i["id"],))
    stage = {"reported": "Received", "analysed": "Received", "alerted": "Sent to the safety team", "acknowledged": "Seen by the team",
             "assigned": "Assigned", "in_progress": "Being fixed", "resolved": "Fixed", "closed": "Closed",
             "rejected": "Not accepted", "false_positive": "Checked: no hazard found", "duplicate": "Already reported", "escalated": "Escalated"}
    return {
        "id": i["id"], "category": i["category"], "category_label": CATEGORIES.get(i["category"], i["category"]),
        "created_at": i["created_at"], "status": i["status"], "status_label": stage.get(i["status"], i["status"]),
        "department": i["department"], "asset_id": i["asset_id"], "public_update": i["public_update"],
        "history": [{"status": h["status"], "label": stage.get(h["status"], h["status"]), "ts": h["ts"]} for h in hist],
    }


@router.post("/track", dependencies=[Depends(rate_limit_read)])
def track(items: list[TrackItem]) -> list[dict]:
    """The reporter's own phone keeps (id, code) pairs. Only a matching code reveals anything."""
    out = []
    for it in items[:50]:
        r = db.one("SELECT * FROM incidents WHERE id=? AND tracking_code=?", (it.id, it.code))
        if r:
            out.append(_tracked(r))
    return out


@router.get("/my-reports")
def my_reports(user: dict | None = Depends(optional_user)) -> list[dict]:
    if not user:
        raise HTTPException(401, "Sign in to see reports linked to your account")
    return [_tracked(r) for r in db.rows("SELECT * FROM incidents WHERE reporter_user_id=? ORDER BY created_at DESC LIMIT 100", (int(user["sub"]),))]


@router.get("/board")
def board() -> list[dict]:
    """'You said, we did': only fixed items with a public update; no reporter data, no evidence, no free text."""
    return db.rows(
        """SELECT i.id, i.category, i.public_update AS fix_text, i.resolved_at, a.name AS location, a.name_hi AS location_hi
        FROM incidents i LEFT JOIN assets a ON a.id=i.asset_id
        WHERE i.status IN ('resolved','closed') AND i.public_update!='' AND i.source IN ('qr','portal')
        ORDER BY i.resolved_at DESC LIMIT 60"""
    )
