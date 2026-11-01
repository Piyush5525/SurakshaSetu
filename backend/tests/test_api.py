import io

from backend.app import db
from backend.app.domain import can_move, triage
from backend.app.services import notify
from backend.app.workers import escalate_once

from .conftest import login

JPG = b"\xff\xd8\xff\xe0" + b"0" * 200


def _token_for(client, admin, aid="filler"):
    a = [x for x in client.get("/api/assets", headers=admin).json() if x["id"] == aid][0]
    return a["qr_token"]


def test_health(client):
    assert client.get("/api/health").json()["ok"] is True


def test_qr_report_end_to_end(client, admin):
    """Test 1: scan QR -> submit -> id -> visible to admin."""
    tok = _token_for(client, admin)
    info = client.get(f"/api/public/qr/{tok}").json()
    assert info["id"] == "filler"
    r = client.post(
        "/api/public/reports",
        data={"qr_token": tok, "hazard_type": "pinch_jam", "description": "hand almost caught, machine running", "serious_harm": "true"},
        files=[("files", ("a.jpg", io.BytesIO(JPG), "image/jpeg"))],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"].startswith("INC-") and body["tracking_code"]
    d = client.get(f"/api/incidents/{body['id']}", headers=admin).json()
    assert d["source"] == "qr" and d["asset_id"] == "filler" and d["category"] == "machinery_accident"
    assert d["department"] == "Maintenance" and len(d["evidence"]) == 1
    assert d["severity"] >= 4 and d["severity_reasons"]  # explainable
    assert d["status"] == "alerted" and d["notifications"][0]["simulated"] == 1  # DEMO_MODE: nothing sent


def test_unknown_and_disabled_qr(client, admin):
    assert client.get("/api/public/qr/nope").status_code == 404
    tok = _token_for(client, admin, "capper")
    client.patch("/api/assets/capper", json={"qr_active": False}, headers=admin)
    assert client.get(f"/api/public/qr/{tok}").status_code == 410
    assert client.post("/api/public/reports", data={"qr_token": tok, "hazard_type": "other"}).status_code == 410
    client.post("/api/assets/capper/regenerate-qr", headers=admin)
    assert client.get(f"/api/public/qr/{tok}").status_code == 404  # old sticker dead
    new = _token_for(client, admin, "capper")
    assert new != tok and client.get(f"/api/public/qr/{new}").status_code == 200


def test_portal_report_and_tracking(client, admin):
    """Test 2: portal report -> central DB -> reporter tracks status with their code."""
    r = client.post("/api/public/reports", data={"asset_id": "lab", "category": "lab_contamination", "description": "tray uncovered"}).json()
    iid, code = r["id"], r["tracking_code"]
    t = client.post("/api/public/track", json=[{"id": iid, "code": code}, {"id": iid, "code": "wrong"}]).json()
    assert len(t) == 1 and t[0]["status"] in ("alerted", "analysed") and "history" in t[0]
    assert "tracking_code" not in client.get(f"/api/incidents/{iid}", headers=admin).json()


def test_upload_validation(client):
    r = client.post("/api/public/reports", data={"asset_id": "lab", "category": "other"}, files=[("files", ("x.exe", io.BytesIO(b"MZ"), "application/octet-stream"))])
    assert r.status_code == 415
    r = client.post("/api/public/reports", data={"asset_id": "lab", "category": "other"}, files=[("files", ("x.jpg", io.BytesIO(b"x" * (11 * 1024 * 1024)), "image/jpeg"))])
    assert r.status_code == 413
    assert client.post("/api/public/reports", data={"asset_id": "nonexistent", "category": "other", "description": "x"}).status_code == 404


def test_staff_endpoints_need_auth_and_roles(client, admin):
    assert client.get("/api/incidents").status_code == 401
    w = login(client, "worker")
    assert client.get("/api/incidents", headers=w).status_code == 403
    m = login(client, "responder.maint")
    assert client.post("/api/assets", json={"id": "zz", "name": "Z"}, headers=m).status_code == 403
    assert client.get("/api/audit", headers=m).status_code == 403


def test_response_workflow(client, admin):
    """Test 6: open -> department -> responder -> acknowledge -> resolve -> close."""
    iid = client.post("/api/public/reports", data={"asset_id": "chem_store", "category": "chemical_spill", "description": "drum leaking"}).json()["id"]
    assert client.post(f"/api/incidents/{iid}/status", json={"status": "acknowledged"}, headers=admin).status_code == 200
    assert client.get(f"/api/incidents/{iid}", headers=admin).json()["acknowledged_at"]
    rid = [r for r in client.get("/api/responders?department=EHS", headers=admin).json() if r["available"]][0]["id"]
    assert client.post(f"/api/incidents/{iid}/assign", json={"department": "EHS", "responder_id": rid}, headers=admin).json()["status"] == "assigned"
    maint = [r for r in client.get("/api/responders?department=Maintenance", headers=admin).json()][0]["id"]
    assert client.post(f"/api/incidents/{iid}/assign", json={"responder_id": maint}, headers=admin).status_code == 409  # wrong department
    assert client.post(f"/api/incidents/{iid}/status", json={"status": "closed"}, headers=admin).status_code == 409  # cannot skip
    for s in ("in_progress", "resolved", "closed"):
        assert client.post(f"/api/incidents/{iid}/status", json={"status": s}, headers=admin).status_code == 200
    d = client.get(f"/api/incidents/{iid}", headers=admin).json()
    assert d["status"] == "closed" and d["resolved_at"] and d["closed_at"]
    assert [h["status"] for h in d["history"]][-3:] == ["in_progress", "resolved", "closed"]


def test_unavailable_responder_blocked(client, admin):
    rid = client.get("/api/responders?department=Security", headers=admin).json()[0]["id"]
    client.patch(f"/api/responders/{rid}?available=false", headers=admin)
    iid = client.post("/api/public/reports", data={"asset_id": "dock", "category": "security", "description": "x"}).json()["id"]
    assert client.post(f"/api/incidents/{iid}/assign", json={"department": "Security", "responder_id": rid}, headers=admin).status_code == 409


def test_detection_ingest_dedupe_and_flags(client, admin):
    """Tests 3-5 contract: a worker posts a confirmed detection -> incident with evidence, model and confidence."""
    h = {"X-Worker-Key": "test-key"}
    form = {"camera_id": "cam-store", "detector": "fire", "model": "best_nano_111.pt", "version": "1", "cls": "Fire", "confidence": "0.81", "meta": '{"frames":"3/5"}'}
    assert client.post("/api/worker/detections", data=form, files={"frame": ("f.jpg", io.BytesIO(JPG), "image/jpeg")}).status_code == 401
    r = client.post("/api/worker/detections", data=form, files={"frame": ("f.jpg", io.BytesIO(JPG), "image/jpeg")}, headers=h).json()
    assert r["status"] == "created"
    d = client.get(f"/api/incidents/{r['incident_id']}", headers=admin).json()
    assert d["source"] == "cctv" and d["ai_model"] == "best_nano_111.pt" and d["ai_confidence"] == 0.81
    assert d["category"] == "fire_explosion" and d["severity"] >= 4 and d["requires_verification"] == 0
    assert d["evidence"][0]["kind"] == "image"
    dup = client.post("/api/worker/detections", data=form, headers=h).json()
    assert dup["status"] == "duplicate" and dup["incident_id"] == r["incident_id"]
    v = client.post("/api/worker/detections", data={**form, "camera_id": "cam-yard", "detector": "violence", "cls": "possible_altercation", "model": "pose-gate"}, headers=h).json()
    dv = client.get(f"/api/incidents/{v['incident_id']}", headers=admin).json()
    assert dv["requires_verification"] == 1 and dv["category"] == "security" and dv["department"] == "Security"


def test_disabled_detector_ignored(client, admin):
    client.patch("/api/detectors/spill", json={"enabled": False}, headers=admin)
    r = client.post("/api/worker/detections", data={"camera_id": "cam-store", "detector": "spill", "model": "yw", "cls": "liquid_spill", "confidence": "0.9"}, headers={"X-Worker-Key": "test-key"}).json()
    assert r["status"] == "ignored"
    client.patch("/api/detectors/spill", json={"enabled": True}, headers=admin)


def test_simulated_events_are_labelled(client, admin):
    r = client.post("/api/demo/simulate", json={"kind": "audio_scream"}, headers=admin).json()
    assert r["simulated"] == 1 and r["ai_model"] == "SIMULATED" and r["source"] == "audio" and "SIMULATED" in r["description"]


def test_escalation_of_unacknowledged_critical(client, admin):
    import time

    r = client.post("/api/demo/simulate", json={"kind": "fire"}, headers=admin).json()
    time.sleep(1.2)
    assert r["id"] in escalate_once()
    d = client.get(f"/api/incidents/{r['id']}", headers=admin).json()
    assert d["status"] == "escalated" and any(n["level"] == 1 for n in d["notifications"])
    assert escalate_once() == []  # only once


def test_calls_never_reach_emergency_numbers():
    for n in ("112", "100", "108", "911", "+91 112"):
        assert notify.call_allowed(n)[0] is False
    assert notify.call_allowed("+919876543210")[1] in ("CALLS_ENABLED is false", "number not on the allowlist")


def test_signed_evidence_links(client, admin):
    iid = client.post("/api/public/reports", data={"asset_id": "lab", "category": "other", "description": "p"}, files=[("files", ("a.jpg", io.BytesIO(JPG), "image/jpeg"))]).json()["id"]
    url = client.get(f"/api/incidents/{iid}", headers=admin).json()["evidence"][0]["url"]
    assert client.get(url.replace("/api", "/api", 1)).status_code == 200
    assert client.get(url[:-3] + "abc").status_code == 403


def test_analytics_and_map(client, admin):
    a = client.get("/api/analytics", headers=admin).json()
    assert a["total"] > 0 and a["by_category"] and "false_positive_rate" in a
    assert client.get("/api/map", headers=admin).json()["assets"]


def test_lifecycle_rules():
    assert can_move("alerted", "acknowledged") and not can_move("closed", "in_progress") and can_move("alerted", "false_positive")


def test_triage_is_explainable_and_confidence_independent():
    t = triage(category="machinery_accident", text="haath fas gaya", serious_harm=True, risk_weight=1.5)
    assert t["severity"] == 5 and len(t["reasons"]) >= 4 and t["department"] == "Maintenance"
    assert triage(category="other", text="")["severity"] == 1


def test_qr_pdf_and_png(client, admin):
    assert client.get("/api/assets/qr-sheet.pdf", headers=admin).content[:4] == b"%PDF"
    assert client.get("/api/assets/filler/qr.png", headers=admin).content[:4] == b"\x89PNG"


def test_websocket_receives_new_incident(client, admin):
    token = admin["Authorization"].split()[1]
    with client.websocket_connect(f"/api/ws?token={token}") as ws:
        client.post("/api/public/reports", data={"asset_id": "dock", "category": "logistics", "description": "ws test"})
        msg = ws.receive_json()
        assert msg["type"] in ("incident.created", "notification", "incident.updated")


def test_board_has_no_private_data(client):
    for b in client.get("/api/public/board").json():
        assert set(b) == {"id", "category", "fix_text", "resolved_at", "location", "location_hi"}
    assert db.one("SELECT 1")
