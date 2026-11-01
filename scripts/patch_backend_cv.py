"""One-off patcher used while extending the backend for the nine-model CV work (kept for the record)."""

import pathlib
import re

B = pathlib.Path(__file__).resolve().parents[1] / "backend" / "app"


def sub(path: str, old: str, new: str, count: int = 1) -> None:
    p = B / path
    s = p.read_text(encoding="utf-8")
    assert old in s, (path, old[:60])
    p.write_text(s.replace(old, new, count), encoding="utf-8", newline="\n")


# ---- db: routing table, camera config, events_raw.detector, lightweight migration ----------------------------
sub(
    "db.py",
    "CREATE TABLE IF NOT EXISTS events_raw (",
    "CREATE TABLE IF NOT EXISTS routing (\n  category TEXT PRIMARY KEY, department TEXT NOT NULL, secondary TEXT);\n"
    "CREATE TABLE IF NOT EXISTS events_raw (",
)
sub(
    "db.py",
    "def init_db() -> None:\n    with connect() as c:\n        c.executescript(SCHEMA)\n",
    "def _add_column(c: sqlite3.Connection, table: str, col: str, ddl: str) -> None:\n"
    "    if col not in [r[1] for r in c.execute(f'PRAGMA table_info({table})').fetchall()]:\n"
    "        c.execute(f'ALTER TABLE {table} ADD COLUMN {col} {ddl}')\n\n\n"
    "def init_db() -> None:\n    with connect() as c:\n        c.executescript(SCHEMA)\n"
    "        _add_column(c, 'cameras', 'config_json', \"TEXT NOT NULL DEFAULT '{}'\")\n"
    "        _add_column(c, 'events_raw', 'detector', 'TEXT')\n",
)

# ---- domain: package damage is also QA's business -------------------------------------------------------------
sub("domain.py", '    "waste_disposal": "EHS",\n}\nDEPARTMENTS', '    "waste_disposal": "EHS",\n    "logistics": "Quality Assurance",\n}\nDEPARTMENTS')

# ---- incidents: admin-configured routing + AI-meta severity reasons ------------------------------------------
sub(
    "services/incidents.py",
    "    reasons = list(t[\"reasons\"])\n",
    "    reasons = list(t[\"reasons\"])\n"
    "    meta = (ai or {}).get(\"meta\") or {}\n"
    "    if meta.get(\"level\") == \"CRITICAL\":\n"
    "        sev = min(5, sev + 1)\n"
    "        reasons.append('+1 forklift-pedestrian level CRITICAL (distance and closing speed)')\n"
    "    if meta.get(\"hazardous\"):\n"
    "        sev = min(5, sev + 1)\n"
    "        reasons.append('+1 hazardous waste item (for example a battery) in the wrong place')\n",
)
sub(
    "services/incidents.py",
    "    dept = t[\"department\"]\n",
    "    dept = t[\"department\"]\n"
    "    route = db.one('SELECT * FROM routing WHERE category=?', (category,))\n"
    "    if route:\n"
    "        dept = route['department']\n",
)
sub(
    "services/notify.py",
    "    s = SECONDARY_DEPARTMENT.get(inc[\"category\"])\n",
    "    route = db.one('SELECT secondary FROM routing WHERE category=?', (inc['category'],))\n"
    "    s = route['secondary'] if route else SECONDARY_DEPARTMENT.get(inc['category'])\n",
)

# ---- vision router: stats, config, detector status ------------------------------------------------------------
sub(
    "routers/vision.py",
    'from ..detectors_catalog import BY_NAME, DETECTORS',
    'from ..detectors_catalog import BY_NAME, DETECTORS, ZONE_TYPES',
)
sub("routers/vision.py", "_preview: dict[str, tuple[float, bytes]] = {}\n", "_preview: dict[str, tuple[float, bytes]] = {}\n_det_status: dict[str, dict[str, str]] = {}  # camera -> detector -> 'ready' | 'unavailable: reason'\n")
sub(
    "routers/vision.py",
    "        out.append({**d, \"enabled\"",
    "        st = _stats(d[\"name\"])\n        out.append({**d, **st, \"enabled\"",
)
sub(
    "routers/vision.py",
    "@router.get(\"/detectors\")",
    '''def _stats(name: str) -> dict:
    """Counters shown on the CV monitoring page. `events` are raw worker events before incident creation."""
    like = f'%"detector": "{name}"%'
    inc = db.one(
        """SELECT COUNT(*) AS n,
        SUM(CASE WHEN status NOT IN ('false_positive','rejected','duplicate') THEN 1 ELSE 0 END) AS confirmed,
        SUM(CASE WHEN status='false_positive' THEN 1 ELSE 0 END) AS fp, MAX(created_at) AS last
        FROM incidents WHERE ai_meta_json LIKE ?""",
        (like,),
    ) or {}
    ev = db.one("SELECT COUNT(*) AS n FROM events_raw WHERE detector=?", (name,)) or {}
    load = {cam: s[name] for cam, s in _det_status.items() if name in s}
    return {
        "incidents_total": inc.get("n") or 0,
        "confirmed": inc.get("confirmed") or 0,
        "false_positives": inc.get("fp") or 0,
        "events_seen": ev.get("n") or 0,
        "last_detection": inc.get("last"),
        "load_status": load,
    }


@router.get("/detectors")''',
)
# remove the original decorator line that now appears twice
p = B / "routers" / "vision.py"
s = p.read_text(encoding="utf-8")
s = s.replace('@router.get("/detectors")\n@router.get("/detectors")', '@router.get("/detectors")', 1)
s = s.replace('@router.get("/detectors")\ndef _stats', 'def _stats', 1)
p.write_text(s, encoding="utf-8", newline="\n")

sub(
    "routers/vision.py",
    'cams = db.rows("SELECT id,name,kind,source,detectors_json,enabled FROM cameras WHERE enabled=1 AND simulated=0")',
    'cams = db.rows("SELECT id,name,kind,source,detectors_json,enabled,config_json FROM cameras WHERE enabled=1 AND simulated=0")',
)
sub(
    "routers/vision.py",
    '        c["detectors"] = db.jload(c.pop("detectors_json"), [])\n    return {"cameras": cams',
    '        c["detectors"] = db.jload(c.pop("detectors_json"), [])\n        c["config"] = db.jload(c.pop("config_json"), {})\n    return {"cameras": cams',
)
sub(
    "routers/vision.py",
    "def _raw(camera_id: str, model: str, cls: str, conf: float, outcome: str) -> None:\n    db.run(\"INSERT INTO events_raw(ts,camera_id,model,cls,confidence,outcome) VALUES(?,?,?,?,?,?)\", (now_iso(), camera_id, model, cls, conf, outcome))",
    "def _raw(camera_id: str, model: str, cls: str, conf: float, outcome: str, detector: str | None = None) -> None:\n    db.run(\"INSERT INTO events_raw(ts,camera_id,model,cls,confidence,outcome,detector) VALUES(?,?,?,?,?,?,?)\", (now_iso(), camera_id, model, cls, conf, outcome, detector))",
)
s = (B / "routers" / "vision.py").read_text(encoding="utf-8")
s = re.sub(r"_raw\(camera_id, model, cls, confidence, (\"[a-z_]+\"|f\"[^\"]+\")\)", lambda m: f"_raw(camera_id, model, cls, confidence, {m.group(1)}, detector)", s)
(B / "routers" / "vision.py").write_text(s, encoding="utf-8", newline="\n")

sub(
    "routers/vision.py",
    '@router.post("/worker/heartbeat", dependencies=[Depends(worker_key)])',
    '''class DetStatus(BaseModel):
    camera_id: str
    statuses: dict[str, str]


@router.post("/worker/detector-status", dependencies=[Depends(worker_key)])
def detector_status(body: DetStatus) -> dict:
    _det_status[body.camera_id] = {k: v[:200] for k, v in body.statuses.items()}
    realtime.publish("camera", {"camera_id": body.camera_id})
    return {"ok": True}


@router.get("/cameras/{cid}/config")
def get_camera_config(cid: str, _: dict = Depends(require("responder"))) -> dict:
    c = db.one("SELECT config_json FROM cameras WHERE id=?", (cid,))
    if not c:
        raise HTTPException(404)
    return {"config": db.jload(c["config_json"], {}), "zone_types": ZONE_TYPES}


def validate_camera_config(cfg: dict) -> None:
    if not isinstance(cfg, dict):
        raise HTTPException(422, "config must be an object")
    for z in cfg.get("zones", []):
        if z.get("type") not in ZONE_TYPES:
            raise HTTPException(422, f"zone {z.get('id')}: type must be one of {ZONE_TYPES}")
        poly = z.get("polygon", [])
        if len(poly) < 3 or any(len(pt) != 2 for pt in poly):
            raise HTTPException(422, f"zone {z.get('id')}: polygon needs 3+ [x, y] points")
        if not isinstance(z.get("id"), str) or not z["id"]:
            raise HTTPException(422, "every zone needs an id")
    px = (cfg.get("calibration") or {}).get("px_per_m")
    if px is not None and not (isinstance(px, (int, float)) and px > 0):
        raise HTTPException(422, "calibration.px_per_m must be a positive number")
    for k, v in (cfg.get("forklift") or {}).items():
        if k not in ("caution_m", "critical_m", "closing_caution_mps") or not isinstance(v, (int, float)) or v <= 0:
            raise HTTPException(422, "forklift accepts positive numbers: caution_m, critical_m, closing_caution_mps")
    f = cfg.get("forklift") or {}
    if f.get("critical_m", 0) and f.get("caution_m", 99) and f.get("critical_m", 0) > f.get("caution_m", 99):
        raise HTTPException(422, "critical_m must not exceed caution_m")


@router.put("/cameras/{cid}/config")
def put_camera_config(cid: str, cfg: dict = Body(...), user: dict = Depends(require("admin"))) -> dict:
    if not db.one("SELECT 1 FROM cameras WHERE id=?", (cid,)):
        raise HTTPException(404)
    validate_camera_config(cfg)
    db.run("UPDATE cameras SET config_json=? WHERE id=?", (db.jdump(cfg), cid))
    svc.audit(user["u"], "camera.config", cid, f"{len(cfg.get('zones', []))} zones")
    realtime.publish("camera", {"camera_id": cid})
    return {"ok": True}


@router.post("/worker/heartbeat", dependencies=[Depends(worker_key)])''',
)
sub(
    "routers/vision.py",
    '    "hand": ("hand_in_zone", "hand_in_danger_zone", 0.0),',
    '    "hand": ("hand_in_zone", "hand_in_danger_zone", 0.0),\n'
    '    "machinery": ("machinery_proximity", "person_in_machine_danger_zone", 0.0),\n'
    '    "storage": ("storage_instability", "falling_object", 0.0),\n'
    '    "package": ("package_damage", "package_hole", 0.0),\n'
    '    "waste": ("waste", "wrong_bin_hazardous", 0.0),\n'
    '    "forklift_critical": ("forklift_person", "forklift_pedestrian_critical", 0.0),',
)

# ---- staff router: configurable routing -----------------------------------------------------------------------
sub(
    "routers/staff.py",
    "# ---- Notifications ---",
    '''class RouteIn(BaseModel):
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


# ---- Notifications ---''',
)
print("backend patched")
