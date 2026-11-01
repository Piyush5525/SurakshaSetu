"""Cameras, detector settings, and the ingest API used by the separate CV/audio worker process."""

import json
import time

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .. import db
from ..config import settings
from ..detectors_catalog import BY_NAME, DETECTORS
from ..domain import CATEGORIES, now_iso
from ..security import classify_upload, require, sign_evidence, verify_evidence_sig, worker_key
from ..services import incidents as svc
from ..services import realtime

router = APIRouter()
_preview: dict[str, tuple[float, bytes]] = {}


def _cam(c: dict) -> dict:
    c = dict(c)
    c["detectors"] = db.jload(c.pop("detectors_json"), [])
    seen = c.get("last_seen")
    c["online"] = bool(seen) and (time.time() - _ts(seen)) < 20
    if not c["online"] and c["status"] == "running":
        c["status"] = "offline"
    c["preview_url"] = f"/api/cameras/{c['id']}/frame?{sign_evidence('cam:' + c['id'], 300)}"
    c.pop("source", None)  # may embed credentials (rtsp://user:pass@...): never sent to the browser
    return c


def _ts(iso: str) -> float:
    from datetime import datetime

    return datetime.fromisoformat(iso).timestamp()


@router.get("/detectors")
def detectors(_: dict = Depends(require("responder"))) -> list[dict]:
    cfg = {r["name"]: r for r in db.rows("SELECT * FROM detector_settings")}
    out = []
    for d in DETECTORS:
        s = cfg.get(d["name"])
        out.append({**d, "enabled": bool(s["enabled"]) if s else d["implemented"], "min_conf": s["min_conf"] if s else None,
                    "confirm_n": s["confirm_n"] if s else None, "confirm_m": s["confirm_m"] if s else None})
    return out


class DetectorPatch(BaseModel):
    enabled: bool | None = None
    min_conf: float | None = Field(None, ge=0.05, le=0.99)
    confirm_n: int | None = Field(None, ge=1, le=10)
    confirm_m: int | None = Field(None, ge=1, le=15)


@router.patch("/detectors/{name}")
def patch_detector(name: str, body: DetectorPatch, user: dict = Depends(require("admin"))) -> dict:
    if name not in BY_NAME:
        raise HTTPException(404)
    cur = db.one("SELECT * FROM detector_settings WHERE name=?", (name,)) or {
        "enabled": int(BY_NAME[name]["implemented"]), "min_conf": None, "confirm_n": None, "confirm_m": None}
    new = {**cur, **{k: v for k, v in body.model_dump(exclude_none=True).items()}}
    db.run("INSERT OR REPLACE INTO detector_settings(name,enabled,min_conf,confirm_n,confirm_m) VALUES(?,?,?,?,?)",
           (name, int(new["enabled"]), new["min_conf"], new["confirm_n"], new["confirm_m"]))
    svc.audit(user["u"], "detector.update", name, json.dumps(body.model_dump(exclude_none=True)))
    return {"ok": True}


@router.get("/cameras")
def cameras(_: dict = Depends(require("responder"))) -> list[dict]:
    return [_cam(c) for c in db.rows("SELECT * FROM cameras ORDER BY name")]


class CameraIn(BaseModel):
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{2,30}$")
    name: str
    kind: str = "camera"  # camera | microphone
    source: str = ""  # file path, webcam index "0", or rtsp:// url (kept server-side)
    asset_id: str | None = None
    zone: str = ""
    x: float = 0
    y: float = 0
    detectors: list[str] = []
    simulated: bool = False


@router.post("/cameras")
def add_camera(body: CameraIn, user: dict = Depends(require("admin"))) -> dict:
    if db.one("SELECT 1 FROM cameras WHERE id=?", (body.id,)):
        raise HTTPException(409, "id exists")
    bad = [d for d in body.detectors if d not in BY_NAME]
    if bad:
        raise HTTPException(422, f"unknown detectors {bad}")
    db.run("INSERT INTO cameras(id,name,kind,source,asset_id,zone,x,y,detectors_json,simulated) VALUES(?,?,?,?,?,?,?,?,?,?)",
           (body.id, body.name, body.kind, body.source, body.asset_id, body.zone, body.x, body.y, db.jdump(body.detectors), int(body.simulated)))
    svc.audit(user["u"], "camera.create", body.id)
    return {"id": body.id}


class CameraPatch(BaseModel):
    name: str | None = None
    source: str | None = None
    enabled: bool | None = None
    detectors: list[str] | None = None
    zone: str | None = None
    x: float | None = None
    y: float | None = None


@router.patch("/cameras/{cid}")
def patch_camera(cid: str, body: CameraPatch, user: dict = Depends(require("admin"))) -> dict:
    if not db.one("SELECT 1 FROM cameras WHERE id=?", (cid,)):
        raise HTTPException(404)
    d = body.model_dump(exclude_none=True)
    if "detectors" in d:
        bad = [x for x in d["detectors"] if x not in BY_NAME]
        if bad:
            raise HTTPException(422, f"unknown detectors {bad}")
        d["detectors_json"] = db.jdump(d.pop("detectors"))
    if "enabled" in d:
        d["enabled"] = int(d["enabled"])
    for k, v in d.items():
        db.run(f"UPDATE cameras SET {k}=? WHERE id=?", (v, cid))  # keys come from the model
    svc.audit(user["u"], "camera.update", cid, ",".join(d))
    return {"ok": True}


@router.get("/cameras/{cid}/frame")
def camera_frame(cid: str, exp: int, sig: str) -> Response:
    if not verify_evidence_sig("cam:" + cid, exp, sig):
        raise HTTPException(403)
    got = _preview.get(cid)
    if not got:
        raise HTTPException(404, "No preview yet")
    return Response(got[1], media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@router.get("/ai-events")
def ai_events(limit: int = 100, _: dict = Depends(require("responder"))) -> list[dict]:
    return db.rows("SELECT * FROM events_raw ORDER BY id DESC LIMIT ?", (min(limit, 500),))


# ---- Worker API (X-Worker-Key) ----------------------------------------------------------------------------
@router.get("/worker/config", dependencies=[Depends(worker_key)])
def worker_config() -> dict:
    cfg = {r["name"]: r for r in db.rows("SELECT * FROM detector_settings")}
    det = {}
    for d in DETECTORS:
        s = cfg.get(d["name"])
        det[d["name"]] = {"enabled": bool(s["enabled"]) if s else d["implemented"],
                          "min_conf": s["min_conf"] if s else None, "confirm_n": s["confirm_n"] if s else None,
                          "confirm_m": s["confirm_m"] if s else None}
    cams = db.rows("SELECT id,name,kind,source,detectors_json,enabled FROM cameras WHERE enabled=1 AND simulated=0")
    for c in cams:
        c["detectors"] = db.jload(c.pop("detectors_json"), [])
    return {"cameras": cams, "detectors": det}


@router.post("/worker/heartbeat", dependencies=[Depends(worker_key)])
def heartbeat(camera_id: str = Body(...), status: str = Body("running"), fps: float | None = Body(None)) -> dict:
    db.run("UPDATE cameras SET status=?, last_seen=?, fps=? WHERE id=?", (status, now_iso(), fps, camera_id))
    realtime.publish("camera", {"camera_id": camera_id, "status": status})
    return {"ok": True}


@router.post("/worker/frame/{cid}", dependencies=[Depends(worker_key)])
async def worker_frame(cid: str, request: Request) -> dict:
    _preview[cid] = (time.time(), (await request.body())[: 2 * 1024 * 1024])
    return {"ok": True}


@router.post("/worker/detections", dependencies=[Depends(worker_key)])
async def worker_detection(
    camera_id: str = Form(...), detector: str = Form(...), model: str = Form(...), version: str = Form(""),
    cls: str = Form(...), confidence: float = Form(...), description: str = Form(""), meta: str = Form("{}"),
    simulated: bool = Form(False), frame: UploadFile | None = File(None), clip: UploadFile | None = File(None),
) -> dict:
    """A worker has already confirmed the event over several frames. We still re-check settings and de-duplicate."""
    d = BY_NAME.get(detector)
    cam = db.one("SELECT * FROM cameras WHERE id=?", (camera_id,))
    if not d or not cam:
        raise HTTPException(404, "unknown detector or camera")
    cfg = db.one("SELECT * FROM detector_settings WHERE name=?", (detector,))
    if (cfg and not cfg["enabled"]) or (not cfg and not d["implemented"]):
        _raw(camera_id, model, cls, confidence, "ignored_disabled")
        return {"status": "ignored", "reason": "detector disabled"}
    if cfg and cfg["min_conf"] and confidence < cfg["min_conf"]:
        _raw(camera_id, model, cls, confidence, "below_threshold")
        return {"status": "ignored", "reason": "below threshold"}
    since = time.time() - settings.DETECTION_COOLDOWN_S
    dup = [r for r in db.rows("SELECT id,created_at FROM incidents WHERE camera_id=? AND ai_class=? AND status NOT IN ('closed','rejected','false_positive','duplicate') ORDER BY created_at DESC LIMIT 3", (camera_id, cls))
           if _ts(r["created_at"]) > since]
    if dup:
        _raw(camera_id, model, cls, confidence, f"duplicate_of_{dup[0]['id']}")
        if frame:
            data = await frame.read()
            svc.save_evidence(dup[0]["id"], "image", "more.jpg", data, "image/jpeg", "additional frame (same event)")
        return {"status": "duplicate", "incident_id": dup[0]["id"]}
    try:
        meta_obj = json.loads(meta)
    except ValueError:
        meta_obj = {}
    kind = "audio" if cam["kind"] == "microphone" else "cctv"
    inc = svc.create_incident(
        category=d["category"], description=description or f"{d['label']} detected by {model}", source=kind,
        camera_id=camera_id if kind == "cctv" else None, audio_id=camera_id if kind == "audio" else None,
        ai={"model": model, "version": version, "cls": cls, "confidence": round(confidence, 3), "meta": {**meta_obj, "detector": detector, "maturity": d["maturity"]}},
        requires_verification=bool(d["requires_verification"]), simulated=simulated, notify_now=False,
    )
    for up, nm in ((frame, "best_frame.jpg"), (clip, "clip.mp4")):
        if up:
            data = await up.read()
            k = classify_upload(up.filename or nm, up.content_type or "", len(data))
            svc.save_evidence(inc["id"], k, nm, data, up.content_type or "", "AI evidence")
    svc.alert(inc)
    _raw(camera_id, model, cls, confidence, f"incident_{inc['id']}")
    return {"status": "created", "incident_id": inc["id"]}


def _raw(camera_id: str, model: str, cls: str, conf: float, outcome: str) -> None:
    db.run("INSERT INTO events_raw(ts,camera_id,model,cls,confidence,outcome) VALUES(?,?,?,?,?,?)", (now_iso(), camera_id, model, cls, conf, outcome))
    realtime.publish("ai_event", {"camera_id": camera_id, "cls": cls, "confidence": conf, "outcome": outcome})


# ---- Demo trigger (admin): SIMULATED events, never presented as real detections --------------------------
class SimBody(BaseModel):
    kind: str  # one of the keys below
    camera_id: str | None = None


SIM = {
    "fire": ("fire", "Fire", 0.0), "smoke": ("fire", "Smoke", 0.0), "fall": ("fall", "fall", 0.0),
    "violence": ("violence", "possible_altercation", 0.0), "spill": ("spill", "liquid_spill", 0.0),
    "ppe": ("ppe", "no_hard_hat", 0.0), "forklift": ("forklift_person", "forklift_person_gap", 0.0),
    "hand": ("hand_in_zone", "hand_in_danger_zone", 0.0),
    "audio_alarm": ("audio", "fire_alarm", 0.0), "audio_scream": ("audio", "scream", 0.0),
    "audio_glass": ("audio", "glass_breaking", 0.0), "audio_impact": ("audio", "heavy_impact", 0.0),
}


@router.post("/demo/simulate")
def simulate(body: SimBody, user: dict = Depends(require("manager"))) -> dict:
    if body.kind not in SIM:
        raise HTTPException(422, f"kind must be one of {sorted(SIM)}")
    det, cls, _ = SIM[body.kind]
    d = BY_NAME[det]
    is_audio = body.kind.startswith("audio")
    cam = db.one("SELECT * FROM cameras WHERE id=?", (body.camera_id,)) if body.camera_id else db.one(
        "SELECT * FROM cameras WHERE kind=? ORDER BY id LIMIT 1", ("microphone" if is_audio else "camera",))
    if not cam:
        raise HTTPException(404, "no suitable camera/microphone registered")
    inc = svc.create_incident(
        category=d["category"], description=f"SIMULATED {d['label']} event (demo trigger, not a real detection)",
        source="audio" if is_audio else "cctv", camera_id=None if is_audio else cam["id"], audio_id=cam["id"] if is_audio else None,
        ai={"model": "SIMULATED", "version": "demo", "cls": cls, "confidence": 0.0, "meta": {"detector": det, "note": "simulated"}},
        requires_verification=True, simulated=True, created_by=user["u"],
    )
    return svc.public_row(inc)
