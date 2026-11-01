"""Backend changes for the UI/UX redesign: departments, QR scan history, stickers, MJPEG stream, dashboard
analytics, richer filters, public facts, routing thresholds. Run once from the repo root."""

import pathlib

B = pathlib.Path(__file__).resolve().parents[1] / "backend" / "app"


def sub(path: str, old: str, new: str) -> None:
    p = B / path
    s = p.read_text(encoding="utf-8")
    assert old in s, (path, old[:70])
    p.write_text(s.replace(old, new, 1), encoding="utf-8", newline="\n")


# ---- db ---------------------------------------------------------------------------------------------------
sub(
    "db.py",
    "CREATE TABLE IF NOT EXISTS routing (",
    "CREATE TABLE IF NOT EXISTS departments (\n  name TEXT PRIMARY KEY, description TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1);\n"
    "CREATE TABLE IF NOT EXISTS qr_scans (\n  id INTEGER PRIMARY KEY AUTOINCREMENT, asset_id TEXT NOT NULL, ts TEXT NOT NULL, outcome TEXT NOT NULL);\n"
    "CREATE INDEX IF NOT EXISTS ix_scan_asset ON qr_scans(asset_id);\n"
    "CREATE TABLE IF NOT EXISTS routing (",
)
sub(
    "db.py",
    "        _add_column(c, 'events_raw', 'detector', 'TEXT')\n",
    "        _add_column(c, 'events_raw', 'detector', 'TEXT')\n"
    "        _add_column(c, 'routing', 'min_severity', 'INTEGER NOT NULL DEFAULT 1')\n"
    "        _add_column(c, 'routing', 'call_min_severity', 'INTEGER NOT NULL DEFAULT 4')\n",
)

# ---- departments service -------------------------------------------------------------------------------------
(B / "services" / "departments.py").write_text(
    '''"""Departments are data, not constants: admins can add them. Seeded from the defaults in domain.py."""

from .. import db
from ..domain import DEPARTMENTS


def seed() -> None:
    for d in DEPARTMENTS:
        db.run("INSERT OR IGNORE INTO departments(name) VALUES(?)", (d,))


def names() -> list[str]:
    return [r["name"] for r in db.rows("SELECT name FROM departments WHERE active=1 ORDER BY name")]
''',
    encoding="utf-8",
    newline="\n",
)
sub("seed.py", "def seed_basics() -> None:\n", "def seed_basics() -> None:\n    from .services import departments\n\n    departments.seed()\n")
for f, old_imp, new_imp in (
    ("routers/auth_assets.py", "from ..domain import DEPARTMENTS, now_iso", "from ..domain import now_iso\nfrom ..services.departments import names as department_names"),
    ("routers/staff.py", "from ..domain import CATEGORIES, DEPARTMENTS, OPEN_STATUSES, STATUSES, now_iso", "from ..domain import CATEGORIES, OPEN_STATUSES, STATUSES, now_iso\nfrom ..services.departments import names as department_names"),
):
    sub(f, old_imp, new_imp)
sub("routers/auth_assets.py", 'if body.department not in DEPARTMENTS:\n        raise HTTPException(422, f"department must be one of {DEPARTMENTS}")', 'if body.department not in department_names():\n        raise HTTPException(422, f"department must be one of {department_names()}")')
s = (B / "routers" / "staff.py").read_text(encoding="utf-8")
s = s.replace("not in DEPARTMENTS", "not in department_names()")
(B / "routers" / "staff.py").write_text(s, encoding="utf-8", newline="\n")

# ---- QR scans + asset stats + stickers -----------------------------------------------------------------------
sub(
    "routers/auth_assets.py",
    '    if not a:\n        raise HTTPException(404, "Unknown QR code")\n    if not a["qr_active"]:\n        raise HTTPException(410, "This QR code has been disabled. Ask your supervisor for a new sticker.")\n    return a',
    '    if not a:\n        raise HTTPException(404, "Unknown QR code")\n    db.run("INSERT INTO qr_scans(asset_id,ts,outcome) VALUES(?,?,?)", (a["id"], now_iso(), "ok" if a["qr_active"] else "disabled"))\n'
    '    if not a["qr_active"]:\n        raise HTTPException(410, "This QR code has been disabled. Ask your supervisor for a new sticker.")\n    return a',
)
sub(
    "routers/auth_assets.py",
    "        (SELECT COUNT(*) FROM incidents i WHERE i.asset_id=a.id AND i.status NOT IN ('resolved','closed','rejected','false_positive','duplicate')) AS open_count\n        FROM assets a ORDER BY a.name",
    "        (SELECT COUNT(*) FROM incidents i WHERE i.asset_id=a.id AND i.status NOT IN ('resolved','closed','rejected','false_positive','duplicate')) AS open_count,\n"
    "        (SELECT COUNT(*) FROM incidents i WHERE i.asset_id=a.id AND i.source='qr') AS qr_report_count,\n"
    "        (SELECT COUNT(*) FROM qr_scans s WHERE s.asset_id=a.id AND s.outcome='ok') AS scan_count,\n"
    "        (SELECT MAX(ts) FROM qr_scans s WHERE s.asset_id=a.id) AS last_scanned_at\n        FROM assets a ORDER BY a.name",
)
sub(
    "routers/auth_assets.py",
    '@router.get("/assets/{aid}/qr.png")',
    '''@router.get("/assets/{aid}/scans")
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
    if template not in TEMPLATES or (base and not re.match(r"^https?://[\\w.:-]+$", base)):
        raise HTTPException(422, "bad template or base")
    return Response(
        render_png(a, _qr_url(a["qr_token"], base), template),
        media_type="image/png",
        headers={"Content-Disposition": f'attachment; filename="sticker-{aid}-{template}.png"'},
    )


@router.get("/assets/stickers.pdf")
def stickers_pdf(template: str = "general", ids: str = "", base: str | None = Query(None), _: dict = Depends(require("responder"))) -> Response:
    from ..services.stickers import TEMPLATES, render_pdf

    if template not in TEMPLATES or (base and not re.match(r"^https?://[\\w.:-]+$", base)):
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

    return [{"id": k, "label": v["label"], "tip": v["tip"], "color": "#%02x%02x%02x" % v["primary"]} for k, v in TEMPLATES.items()]


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


@router.get("/assets/{aid}/qr.png")''',
)

# ---- public facts ----------------------------------------------------------------------------------------------
sub(
    "routers/public.py",
    '@router.get("/categories")',
    '''@router.get("/facts")
def facts() -> dict:
    """Verified public L'Oréal information with sources. Not internal data; see facts.py for the integrity rules."""
    from ..facts import FACTS, NOT_VERIFIED, RETRIEVED

    return {"retrieved": RETRIEVED, "facts": FACTS, "not_verified": NOT_VERIFIED}


@router.get("/categories")''',
)

# ---- incidents filters -------------------------------------------------------------------------------------------
sub(
    "routers/staff.py",
    "    severity_min: int | None = None, asset_id: str | None = None, q: str | None = None, open_only: bool = False,\n",
    "    severity_min: int | None = None, asset_id: str | None = None, q: str | None = None, open_only: bool = False,\n"
    "    camera_id: str | None = None, zone: str | None = None, date_from: str | None = None, date_to: str | None = None,\n"
    "    critical_only: bool = False, awaiting_ack: bool = False, simulated: bool | None = None,\n",
)
sub(
    "routers/staff.py",
    '    for col, val in (("status", status), ("category", category), ("source", source), ("department", department), ("asset_id", asset_id)):',
    '    for col, val in (("status", status), ("category", category), ("source", source), ("department", department), ("asset_id", asset_id), ("camera_id", camera_id), ("zone", zone)):',
)
sub(
    "routers/staff.py",
    "    if severity_min:\n",
    "    if date_from:\n        clauses.append('created_at>=?')\n        args.append(date_from)\n"
    "    if date_to:\n        clauses.append('created_at<?')\n        args.append(date_to + 'T23:59:59' if len(date_to) == 10 else date_to)\n"
    "    if critical_only:\n        clauses.append('severity>=4')\n"
    "    if awaiting_ack:\n        clauses.append(\"status IN ('reported','analysed','alerted','escalated')\")\n"
    "    if simulated is not None:\n        clauses.append('simulated=?')\n        args.append(int(simulated))\n"
    "    if severity_min:\n",
)

# ---- routing thresholds ---------------------------------------------------------------------------------------------
sub("routers/staff.py", "class RouteIn(BaseModel):\n    department: str\n    secondary: str | None = None\n", "class RouteIn(BaseModel):\n    department: str\n    secondary: str | None = None\n    min_severity: int = Field(1, ge=1, le=5)\n    call_min_severity: int = Field(4, ge=1, le=5)\n")
sub(
    "routers/staff.py",
    '            "customised": c in over,\n',
    '            "customised": c in over,\n            "min_severity": over[c]["min_severity"] if c in over else 1,\n            "call_min_severity": over[c]["call_min_severity"] if c in over else 4,\n',
)
sub(
    "routers/staff.py",
    'db.run("INSERT OR REPLACE INTO routing(category,department,secondary) VALUES(?,?,?)", (category, body.department, body.secondary or None))',
    'db.run("INSERT OR REPLACE INTO routing(category,department,secondary,min_severity,call_min_severity) VALUES(?,?,?,?,?)", (category, body.department, body.secondary or None, body.min_severity, body.call_min_severity))',
)
sub(
    "services/notify.py",
    '    text = build_message(inc, level)\n    out: list[dict] = []\n',
    '    text = build_message(inc, level)\n    out: list[dict] = []\n'
    '    route = db.one("SELECT min_severity, call_min_severity FROM routing WHERE category=?", (inc["category"],)) or {}\n'
    '    min_sev, call_min = route.get("min_severity", 1), route.get("call_min_severity", 4)\n'
    '    if level == 0 and inc["severity"] < min_sev:\n'
    '        _log(inc["id"], "telegram", "-", "skipped", f"severity {inc[\'severity\']} below routing threshold {min_sev}", 0, False)\n'
    '        return out\n',
)
sub("services/notify.py", '    if inc["severity"] >= 4 or level >= 1:', '    if inc["severity"] >= call_min or level >= 1:')

# ---- camera enrichment + MJPEG stream ---------------------------------------------------------------------------------
sub(
    "routers/vision.py",
    "    c.pop(\"source\", None)  # may embed credentials (rtsp://user:pass@...): never sent to the browser\n    return c",
    '''    c["stream_url"] = f"/api/cameras/{c['id']}/stream.mjpg?{sign_evidence('cam:' + c['id'], 1800)}"
    c.pop("source", None)  # may embed credentials (rtsp://user:pass@...): never sent to the browser
    st = db.one(
        """SELECT COUNT(*) AS n,
        SUM(CASE WHEN status IN ('reported','analysed','alerted','escalated','acknowledged','assigned','in_progress') THEN 1 ELSE 0 END) AS active
        FROM incidents WHERE camera_id=? OR audio_id=?""",
        (c["id"], c["id"]),
    ) or {}
    c["incidents_total"], c["active_alerts"] = st.get("n") or 0, st.get("active") or 0
    last = db.one("SELECT id, ai_class, ai_confidence, status, severity, created_at, simulated FROM incidents WHERE camera_id=? OR audio_id=? ORDER BY created_at DESC LIMIT 1", (c["id"], c["id"]))
    c["last_detection"] = last
    asset = db.one("SELECT name, department FROM assets WHERE id=?", (c.get("asset_id"),)) if c.get("asset_id") else None
    c["asset_name"], c["department"] = (asset or {}).get("name"), (asset or {}).get("department")
    c["detectors"] = c["detectors"]
    return c''',
)
sub(
    "routers/vision.py",
    '@router.get("/cameras/{cid}/frame")',
    '''@router.get("/cameras/{cid}/stream.mjpg")
async def camera_stream(cid: str, request: Request, exp: int, sig: str):
    """Motion-JPEG built from the worker's latest preview frames (people are pixelated by the worker)."""
    import asyncio

    from fastapi.responses import StreamingResponse

    if not verify_evidence_sig("cam:" + cid, exp, sig):
        raise HTTPException(403)

    async def gen():
        last_ts = 0.0
        idle = 0
        while idle < 600 and not await request.is_disconnected():
            got = _preview.get(cid)
            if got and got[0] != last_ts:
                last_ts, idle = got[0], 0
                yield b"--frame\\r\\nContent-Type: image/jpeg\\r\\nContent-Length: " + str(len(got[1])).encode() + b"\\r\\n\\r\\n" + got[1] + b"\\r\\n"
            else:
                idle += 1
            await asyncio.sleep(0.1)

    return StreamingResponse(gen(), media_type="multipart/x-mixed-replace; boundary=frame", headers={"Cache-Control": "no-store"})


@router.get("/cameras/{cid}/frame")''',
)

# ---- dashboard analytics --------------------------------------------------------------------------------------------------
sub(
    "routers/staff.py",
    '@router.get("/map")',
    '''@router.get("/analytics/dashboard")
def analytics_dashboard(days: int = 30, user: dict = Depends(require("responder"))) -> dict:
    """Everything the admin overview shows, each metric defined in `definitions` and computed from the incident table."""
    where, args = _visible(user)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="seconds")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    base = f"{where} AND created_at>=?"
    a = [*args, since]
    rows_all = db.rows(f"SELECT * FROM incidents WHERE {base}", a)
    open_s = OPEN_STATUSES
    ack = [m for r in rows_all if (m := _mins(r["created_at"], r["acknowledged_at"])) is not None]
    res = [m for r in rows_all if (m := _mins(r["created_at"], r["resolved_at"])) is not None]

    def grp(col: str) -> list[dict]:
        return db.rows(f"SELECT {col} AS key, COUNT(*) AS n FROM incidents WHERE {base} GROUP BY {col} ORDER BY n DESC", a)

    cams = db.rows("SELECT id, enabled, status, last_seen, simulated, kind FROM cameras WHERE kind='camera'")
    now = datetime.now(timezone.utc).timestamp()
    online = sum(1 for c in cams if c["last_seen"] and now - datetime.fromisoformat(c["last_seen"]).timestamp() < 20)
    heat = db.rows(
        f"""SELECT a.id, a.name, a.zone, a.x, a.y, a.w, a.h,
        (SELECT COUNT(*) FROM incidents i WHERE i.asset_id=a.id AND i.created_at>=?) AS total,
        (SELECT COUNT(*) FROM incidents i WHERE i.asset_id=a.id AND i.status IN ({svc.open_status_sql()})) AS open FROM assets a""",
        (since,),
    )
    by_day = db.rows(f"SELECT substr(created_at,1,10) AS day, source, COUNT(*) AS n FROM incidents WHERE {base} GROUP BY day, source ORDER BY day", a)
    resolved = [r for r in rows_all if r["status"] in ("resolved", "closed")]
    return {
        "days": days,
        "kpi": {
            "total": len(rows_all),
            "active": sum(1 for r in rows_all if r["status"] in open_s),
            "critical": sum(1 for r in rows_all if r["severity"] >= 4 and r["status"] in open_s),
            "awaiting_ack": sum(1 for r in rows_all if r["status"] in ("reported", "analysed", "alerted", "escalated")),
            "resolved": len(resolved),
            "cameras_online": online,
            "cameras_total": len(cams),
            "ai_today": sum(1 for r in rows_all if r["source"] in ("cctv", "audio") and r["created_at"][:10] == today),
            "qr_reports": sum(1 for r in rows_all if r["source"] == "qr"),
            "avg_response_min": round(sum(ack) / len(ack), 1) if ack else None,
            "avg_resolve_min": round(sum(res) / len(res), 1) if res else None,
            "resolution_rate": round(len(resolved) / len(rows_all), 3) if rows_all else None,
            "simulated_share": round(sum(1 for r in rows_all if r["simulated"]) / len(rows_all), 3) if rows_all else None,
        },
        "definitions": {
            "total": "Incidents created in the selected period (all sources).",
            "active": "Incidents not yet resolved, closed, rejected, duplicate or false positive.",
            "critical": "Active incidents with severity 4 or 5. Severity comes from triage rules, never from AI confidence.",
            "awaiting_ack": "Incidents alerted or escalated that nobody has acknowledged yet.",
            "resolved": "Incidents in status resolved or closed.",
            "cameras_online": "Cameras whose CV worker sent a heartbeat in the last 20 seconds.",
            "ai_today": "Incidents created today by CCTV or audio detectors (potential events included).",
            "qr_reports": "Incidents submitted by scanning a QR sticker.",
            "avg_response_min": "Mean minutes from creation to first acknowledgement.",
            "avg_resolve_min": "Mean minutes from creation to resolution.",
            "resolution_rate": "Resolved or closed incidents divided by all incidents in the period.",
        },
        "by_category": grp("category"),
        "by_department": grp("department"),
        "by_severity": grp("severity"),
        "by_source": grp("source"),
        "trend": by_day,
        "heat": heat,
        "recent_incidents": [svc.public_row(r) for r in db.rows(f"SELECT * FROM incidents WHERE {where} ORDER BY created_at DESC LIMIT 8", args)],
        "recent_ai": [svc.public_row(r) for r in db.rows(f"SELECT * FROM incidents WHERE {where} AND source IN ('cctv','audio') ORDER BY created_at DESC LIMIT 6", args)],
        "pending": [
            svc.public_row(r)
            for r in db.rows(
                f"SELECT * FROM incidents WHERE {where} AND status IN ('reported','analysed','alerted','escalated') ORDER BY severity DESC, created_at ASC LIMIT 6",
                args,
            )
        ],
    }


@router.get("/map")''',
)
print("backend UI patch applied")
