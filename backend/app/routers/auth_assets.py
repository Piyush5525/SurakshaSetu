"""Sign-in, users, machines/assets and their QR codes."""

import io
import re
import secrets

import segno
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .. import db
from ..config import settings
from ..domain import now_iso
from ..security import check_pw, hash_pw, make_token, rate_limit, rate_limit_read, require
from ..services.departments import names as department_names
from ..services.incidents import audit

router = APIRouter()


class Login(BaseModel):
    username: str
    password: str


@router.post("/auth/login", dependencies=[Depends(rate_limit)])
def login(body: Login) -> dict:
    u = db.one("SELECT * FROM users WHERE username=? AND active=1", (body.username.strip().lower(),))
    if not u or not check_pw(body.password, u["pw_hash"]):
        raise HTTPException(401, "Wrong username or password")
    audit(u["username"], "auth.login")
    return {"token": make_token(u), "user": {"id": u["id"], "username": u["username"], "role": u["role"], "department": u["department"], "name": u["display_name"]}}


@router.get("/auth/me")
def me(user: dict = Depends(require("worker"))) -> dict:
    return {"id": int(user["sub"]), "username": user["u"], "role": user["role"], "department": user["dept"]}


class NewUser(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-z0-9._-]+$")
    password: str = Field(min_length=8, max_length=100)
    role: str
    department: str | None = None
    display_name: str | None = None


@router.get("/users")
def list_users(_: dict = Depends(require("admin"))) -> list[dict]:
    return db.rows("SELECT id,username,role,department,display_name,active FROM users ORDER BY id")


@router.post("/users")
def create_user(body: NewUser, user: dict = Depends(require("admin"))) -> dict:
    if body.role not in ("worker", "responder", "manager", "admin"):
        raise HTTPException(422, "bad role")
    if db.one("SELECT 1 FROM users WHERE username=?", (body.username,)):
        raise HTTPException(409, "username taken")
    uid = db.run(
        "INSERT INTO users(username,pw_hash,role,department,display_name) VALUES(?,?,?,?,?)",
        (body.username, hash_pw(body.password), body.role, body.department, body.display_name),
    )
    audit(user["u"], "user.create", body.username, body.role)
    return {"id": uid}


# ---- Assets (machines, areas, labs, warehouse zones) ------------------------------------------------------
def new_qr_token() -> str:
    return secrets.token_urlsafe(10)  # opaque: guessing one is infeasible, and it carries no machine info


class AssetIn(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_-]{2,40}$")
    name: str = Field(min_length=1, max_length=80)
    name_hi: str | None = None
    kind: str = "machine"
    site: str = "Demo Plant"
    building: str = "Line 3"
    floor: str = "G"
    zone: str = ""
    department: str = "EHS"
    x: float = 0
    y: float = 0
    w: float = 10
    h: float = 10
    risk_weight: float = 1.0


@router.get("/public/assets")
def public_assets() -> list[dict]:
    """Names for pickers. No QR tokens."""
    return db.rows("SELECT id,name,name_hi,kind,zone,building,floor FROM assets ORDER BY name")


@router.get("/public/qr/{token}")
def resolve_qr(token: str, response: Response, _=Depends(rate_limit_read)) -> dict:
    response.headers["Cache-Control"] = "no-store"  # a disabled sticker must not stay "disabled" in a phone cache after it is re-enabled
    a = db.one("SELECT id,name,name_hi,kind,site,building,floor,zone,department,qr_active FROM assets WHERE qr_token=?", (token,))
    if not a:
        raise HTTPException(404, "Unknown QR code", headers={"Cache-Control": "no-store"})
    db.run("INSERT INTO qr_scans(asset_id,ts,outcome) VALUES(?,?,?)", (a["id"], now_iso(), "ok" if a["qr_active"] else "disabled"))
    if not a["qr_active"]:
        raise HTTPException(410, "This QR code has been disabled. Ask your supervisor for a new sticker.", headers={"Cache-Control": "no-store"})
    return a


@router.get("/assets")
def list_assets(_: dict = Depends(require("responder"))) -> list[dict]:
    return db.rows(
        """SELECT a.*, (SELECT COUNT(*) FROM incidents i WHERE i.asset_id=a.id) AS incident_count,
        (SELECT COUNT(*) FROM incidents i WHERE i.asset_id=a.id AND i.status NOT IN ('resolved','closed','rejected','false_positive','duplicate')) AS open_count,
        (SELECT COUNT(*) FROM incidents i WHERE i.asset_id=a.id AND i.source='qr') AS qr_report_count,
        (SELECT COUNT(*) FROM qr_scans s WHERE s.asset_id=a.id AND s.outcome='ok') AS scan_count,
        (SELECT MAX(ts) FROM qr_scans s WHERE s.asset_id=a.id) AS last_scanned_at
        FROM assets a ORDER BY a.name"""
    )


@router.post("/assets")
def create_asset(body: AssetIn, user: dict = Depends(require("manager"))) -> dict:
    if body.department not in department_names():
        raise HTTPException(422, f"department must be one of {department_names()}")
    if db.one("SELECT 1 FROM assets WHERE id=?", (body.id,)):
        raise HTTPException(409, "id exists")
    db.run(
        """INSERT INTO assets(id,name,name_hi,kind,site,building,floor,zone,department,qr_token,qr_active,x,y,w,h,risk_weight,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?)""",
        (body.id, body.name, body.name_hi, body.kind, body.site, body.building, body.floor, body.zone, body.department,
         new_qr_token(), body.x, body.y, body.w, body.h, body.risk_weight, now_iso()),
    )
    audit(user["u"], "asset.create", body.id)
    return {"id": body.id}


class AssetPatch(BaseModel):
    name: str | None = None
    name_hi: str | None = None
    zone: str | None = None
    department: str | None = None
    qr_active: bool | None = None
    x: float | None = None
    y: float | None = None
    risk_weight: float | None = None


@router.patch("/assets/{aid}")
def patch_asset(aid: str, body: AssetPatch, user: dict = Depends(require("manager"))) -> dict:
    if not db.one("SELECT 1 FROM assets WHERE id=?", (aid,)):
        raise HTTPException(404)
    data = body.model_dump(exclude_none=True)
    if "qr_active" in data:
        data["qr_active"] = int(data["qr_active"])
    for k, v in data.items():
        db.run(f"UPDATE assets SET {k}=? WHERE id=?", (v, aid))  # keys come from the model, not the client
    audit(user["u"], "asset.update", aid, str(list(data)))
    return {"ok": True}


@router.post("/assets/{aid}/regenerate-qr")
def regenerate(aid: str, user: dict = Depends(require("manager"))) -> dict:
    if not db.one("SELECT 1 FROM assets WHERE id=?", (aid,)):
        raise HTTPException(404)
    db.run("UPDATE assets SET qr_token=?, qr_active=1 WHERE id=?", (new_qr_token(), aid))
    audit(user["u"], "asset.qr_regenerate", aid)
    return {"ok": True}


def _qr_url(token: str, base: str | None) -> str:
    return f"{(base or settings.QR_BASE_URL).rstrip('/')}/q/{token}"


@router.get("/assets/{aid}/scans")
def asset_scans(aid: str, _: dict = Depends(require("responder"))) -> dict:
    return {
        "scans": db.rows("SELECT ts,outcome FROM qr_scans WHERE asset_id=? ORDER BY id DESC LIMIT 100", (aid,)),
        "reports": db.rows("SELECT id,category,severity,status,created_at FROM incidents WHERE asset_id=? AND source='qr' ORDER BY created_at DESC LIMIT 50", (aid,)),
    }


@router.get("/assets/{aid}/sticker.png")
def sticker_png(aid: str, template: str = "general", base: str | None = Query(None), _: dict = Depends(require("responder"))) -> Response:
    from ..services.stickers import TEMPLATES, render_png

    a = db.one("SELECT * FROM assets WHERE id=?", (aid,))
    if not a:
        raise HTTPException(404)
    if template not in TEMPLATES or (base and not re.match(r"^https?://[\w.:-]+$", base)):
        raise HTTPException(422, "bad template or base")
    return Response(
        render_png(a, _qr_url(a["qr_token"], base), template),
        media_type="image/png",
        headers={"Content-Disposition": f'attachment; filename="sticker-{aid}-{template}.png"'},
    )


@router.get("/assets/stickers.pdf")
def stickers_pdf(template: str = "general", ids: str = "", base: str | None = Query(None), _: dict = Depends(require("responder"))) -> Response:
    from ..services.stickers import TEMPLATES, render_pdf

    if template not in TEMPLATES or (base and not re.match(r"^https?://[\w.:-]+$", base)):
        raise HTTPException(422, "bad template or base")
    want = [i for i in ids.split(",") if i]
    rows = [a for a in db.rows("SELECT * FROM assets WHERE qr_active=1 ORDER BY name") if not want or a["id"] in want]
    return Response(
        render_pdf([(a, _qr_url(a["qr_token"], base)) for a in rows], template),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="stickers-{template}.pdf"'},
    )


@router.get("/sticker-templates")
def sticker_templates() -> list[dict]:
    from ..services.stickers import TEMPLATES

    return [{"id": k, "label": v["label"], "tip": v["tip"], "color": "#{:02x}{:02x}{:02x}".format(*v["primary"])} for k, v in TEMPLATES.items()]


@router.get("/departments")
def departments(_: dict = Depends(require("responder"))) -> list[dict]:
    return db.rows("SELECT d.name, d.description, d.active, (SELECT COUNT(*) FROM responders r WHERE r.department=d.name) AS responders FROM departments d ORDER BY d.name")


class DeptIn(BaseModel):
    name: str = Field(min_length=2, max_length=40)
    description: str = Field("", max_length=200)


@router.post("/departments")
def add_department(body: DeptIn, user: dict = Depends(require("admin"))) -> dict:
    if db.one("SELECT 1 FROM departments WHERE name=?", (body.name,)):
        raise HTTPException(409, "department exists")
    db.run("INSERT INTO departments(name,description) VALUES(?,?)", (body.name, body.description))
    audit(user["u"], "department.create", body.name)
    return {"ok": True}


@router.patch("/departments/{name}")
def toggle_department(name: str, active: bool, user: dict = Depends(require("admin"))) -> dict:
    db.run("UPDATE departments SET active=? WHERE name=?", (int(active), name))
    audit(user["u"], "department.active", name, str(active))
    return {"ok": True}


@router.get("/assets/{aid}/qr.png")
def qr_png(aid: str, base: str | None = Query(None), scale: int = 10, _: dict = Depends(require("responder"))) -> Response:
    a = db.one("SELECT qr_token FROM assets WHERE id=?", (aid,))
    if not a:
        raise HTTPException(404)
    if base and not re.match(r"^https?://[\w.:-]+$", base):
        raise HTTPException(422, "bad base")
    buf = io.BytesIO()
    segno.make(_qr_url(a["qr_token"], base), error="m").save(buf, kind="png", scale=max(4, min(scale, 20)), border=2)
    return Response(buf.getvalue(), media_type="image/png", headers={"Content-Disposition": f'attachment; filename="qr-{aid}.png"'})


@router.get("/assets/qr-sheet.pdf")
def qr_sheet(base: str | None = Query(None), _: dict = Depends(require("responder"))) -> Response:
    """A4 PDF, one sticker per machine (6 per page)."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    if base and not re.match(r"^https?://[\w.:-]+$", base):
        raise HTTPException(422, "bad base")
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    cw, ch = W / 2, H / 3
    for i, a in enumerate(db.rows("SELECT id,name,zone,qr_token,qr_active FROM assets WHERE qr_active=1 ORDER BY name")):
        if i and i % 6 == 0:
            c.showPage()
        col, row = i % 2, (i % 6) // 2
        x0, y0 = col * cw, H - (row + 1) * ch
        c.setFillColorRGB(1, 0.9, 0.2)
        c.rect(x0 + 12, y0 + 12, cw - 24, ch - 24, fill=1, stroke=1)
        c.setFillColorRGB(0, 0, 0)
        c.setFont("Helvetica-Bold", 20)
        c.drawCentredString(x0 + cw / 2, y0 + ch - 48, a["name"][:28])
        q = io.BytesIO()
        segno.make(_qr_url(a["qr_token"], base), error="m").save(q, kind="png", scale=8, border=2)
        q.seek(0)
        c.drawImage(ImageReader(q), x0 + cw / 2 - 80, y0 + 62, 160, 160)
        c.setFont("Helvetica-Bold", 14)
        c.drawCentredString(x0 + cw / 2, y0 + 40, "Spot it. Scan it. Say it.")
        c.setFont("Helvetica", 8)
        c.drawCentredString(x0 + cw / 2, y0 + 26, f"{a['id']} | Demo Plant (fictional) | anonymous, 30 seconds")
    c.save()
    return Response(buf.getvalue(), media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="qr-stickers.pdf"'})
