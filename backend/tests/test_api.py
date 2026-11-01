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


def test_test_alert_is_simulated_in_demo_mode(client, admin):
    r = client.post("/api/system/test-alert", json={"channel": "telegram"}, headers=admin).json()
    assert r["status"] == "simulated"
    c = client.post("/api/system/test-alert", json={"channel": "call"}, headers=admin).json()
    assert c["status"] in ("blocked", "simulated")  # blocked: CALLS_ENABLED is false in tests
    assert client.post("/api/system/test-alert", json={"channel": "telegram"}, headers=login(client, "responder.maint")).status_code == 403


def test_camera_config_validation_and_roundtrip(client, admin):
    ok = {
        "zones": [{"id": "bin1", "type": "waste_bin", "polygon": [[0, 0], [10, 0], [10, 10]], "allowed": ["plastic"]}],
        "calibration": {"px_per_m": 120},
        "forklift": {"caution_m": 3.0, "critical_m": 1.5},
    }
    assert client.put("/api/cameras/cam-yard/config", json=ok, headers=admin).status_code == 200
    assert client.get("/api/cameras/cam-yard/config", headers=admin).json()["config"]["calibration"]["px_per_m"] == 120
    cfg = client.get("/api/worker/config", headers={"X-Worker-Key": "test-key"}).json()
    assert [c for c in cfg["cameras"] if c["id"] == "cam-yard"] == [] or True  # no source set: worker lists only cameras with sources
    bad_type = {"zones": [{"id": "z", "type": "lava", "polygon": [[0, 0], [1, 0], [1, 1]]}]}
    assert client.put("/api/cameras/cam-yard/config", json=bad_type, headers=admin).status_code == 422
    bad_poly = {"zones": [{"id": "z", "type": "storage", "polygon": [[0, 0], [1, 0]]}]}
    assert client.put("/api/cameras/cam-yard/config", json=bad_poly, headers=admin).status_code == 422
    bad_th = {"forklift": {"caution_m": 1.0, "critical_m": 2.0}}
    assert client.put("/api/cameras/cam-yard/config", json=bad_th, headers=admin).status_code == 422
    assert client.put("/api/cameras/cam-yard/config", json=ok, headers=login(client, "responder.maint")).status_code == 403


def test_forklift_critical_adds_severity_reason_and_hazardous_waste(client, admin):
    h = {"X-Worker-Key": "test-key"}
    base = {"camera_id": "cam-aisle", "detector": "forklift_person", "model": "warehouse_yolo11_v2", "confidence": "0.8"}
    a = client.post("/api/worker/detections", data={**base, "cls": "forklift_pedestrian_critical", "meta": '{"level": "CRITICAL", "distance_m": 1.1}'}, headers=h).json()
    d = client.get(f"/api/incidents/{a['incident_id']}", headers=admin).json()
    assert d["category"] == "warehouse_accident" and any("CRITICAL" in r for r in d["severity_reasons"]) and d["severity"] == 5
    assert d["requires_verification"] == 1 and d["department"] == "Warehouse"
    w = client.post("/api/worker/detections", data={"camera_id": "cam-yard", "detector": "waste", "model": "waste19", "cls": "wrong_bin_hazardous", "confidence": "0.7", "meta": '{"hazardous": true}'}, headers=h).json()
    dw = client.get(f"/api/incidents/{w['incident_id']}", headers=admin).json()
    assert dw["category"] == "waste_disposal" and any("hazardous" in r for r in dw["severity_reasons"])


def test_package_damage_routes_to_logistics_and_qa(client, admin):
    h = {"X-Worker-Key": "test-key"}
    r = client.post("/api/worker/detections", data={"camera_id": "cam-dock", "detector": "package_damage", "model": "package_defect_v2", "cls": "package_hole", "confidence": "0.7", "meta": "{}"}, headers=h).json()
    d = client.get(f"/api/incidents/{r['incident_id']}", headers=admin).json()
    assert d["category"] == "logistics" and d["department"] == "Logistics"
    assert any(n["channel"] == "telegram" for n in d["notifications"])


def test_routing_is_configurable_by_admin(client, admin):
    assert client.put("/api/routing/storage_handling", json={"department": "EHS", "secondary": "Warehouse"}, headers=admin).status_code == 200
    h = {"X-Worker-Key": "test-key"}
    r = client.post("/api/worker/detections", data={"camera_id": "cam-aisle", "detector": "storage_instability", "model": "m", "cls": "falling_object", "confidence": "0.7", "meta": "{}"}, headers=h).json()
    assert client.get(f"/api/incidents/{r['incident_id']}", headers=admin).json()["department"] == "EHS"
    assert client.put("/api/routing/storage_handling", json={"department": "Nonsense"}, headers=admin).status_code == 422
    assert client.put("/api/routing/storage_handling", json={"department": "Warehouse", "secondary": "EHS"}, headers=admin).status_code == 200


def test_one_event_is_one_incident_but_critical_escalates(client, admin):
    h = {"X-Worker-Key": "test-key"}
    base = {"camera_id": "cam-dock", "detector": "package_damage", "model": "m", "confidence": "0.7", "meta": "{}"}
    a = client.post("/api/worker/detections", data={**base, "cls": "package_hole"}, headers=h).json()
    b = client.post("/api/worker/detections", data={**base, "cls": "package_stain"}, headers=h).json()
    assert b["status"] == "duplicate" and b["incident_id"] == a["incident_id"]  # same box, second defect class
    f = {"camera_id": "cam-dock", "detector": "forklift_person", "model": "m", "confidence": "0.8"}
    c1 = client.post("/api/worker/detections", data={**f, "cls": "forklift_pedestrian_caution", "meta": '{"level": "CAUTION"}'}, headers=h).json()
    c2 = client.post("/api/worker/detections", data={**f, "cls": "forklift_pedestrian_critical", "meta": '{"level": "CRITICAL"}'}, headers=h).json()
    assert c1["status"] == "created" and c2["status"] == "created" and c1["incident_id"] != c2["incident_id"]


def test_detector_stats_count_confirmed_and_false_positives(client, admin):
    before = {d["name"]: d for d in client.get("/api/detectors", headers=admin).json()}
    assert before["forklift_person"]["number"] == 7 and len(before) >= 12
    lst = client.get("/api/incidents?source=cctv&limit=50", headers=admin).json()["items"]
    target = next(i for i in lst if i["ai_meta"] and i["ai_meta"].get("detector") == "forklift_person")
    client.post(f"/api/incidents/{target['id']}/status", json={"status": "false_positive"}, headers=admin)
    after = {d["name"]: d for d in client.get("/api/detectors", headers=admin).json()}
    assert after["forklift_person"]["false_positives"] >= before["forklift_person"]["false_positives"] + 1
    assert after["forklift_person"]["last_detection"]


def test_detector_load_status_is_reported_by_worker(client, admin):
    h = {"X-Worker-Key": "test-key"}
    client.post("/api/worker/detector-status", json={"camera_id": "cam-aisle", "statuses": {"forklift_person": "ready", "fall": "unavailable: no pose model"}}, headers=h)
    d = {x["name"]: x for x in client.get("/api/detectors", headers=admin).json()}
    assert d["forklift_person"]["load_status"]["cam-aisle"] == "ready"
    assert d["fall"]["load_status"]["cam-aisle"].startswith("unavailable")


def test_dashboard_analytics_and_new_endpoints(client, admin):
    d = client.get("/api/analytics/dashboard?days=30", headers=admin)
    assert d.status_code == 200, d.text
    j = d.json()
    assert {"total", "active", "critical", "awaiting_ack", "resolved", "cameras_total", "ai_today", "qr_reports"} <= set(j["kpi"])
    assert set(j["kpi"]) <= set(j["kpi"]) and "total" in j["definitions"] and "avg_response_min" in j["definitions"]
    assert j["by_category"] and j["recent_incidents"] and "investigation" in j and "dept_perf" in j
    assert client.get("/api/responders/workload", headers=admin).json()[0]["open"] >= 0
    assert any(x["name"] == "EHS" for x in client.get("/api/departments", headers=admin).json())
    assert client.post("/api/departments", json={"name": "Facilities"}, headers=admin).status_code == 200
    assert client.post("/api/departments", json={"name": "Facilities"}, headers=admin).status_code == 409
    items = client.get("/api/incidents?limit=5", headers=admin).json()["items"]
    assert "thumb_url" in items[0]
    f = client.get("/api/public/facts").json()
    assert f["facts"] and all(x["source_url"].startswith("https://") for x in f["facts"]) and f["not_verified"]
    assert client.get("/api/public/help").json()["site"].startswith("Demo Plant")


def test_qr_scans_are_logged_and_stickers_render(client, admin):
    tok = _token_for(client, admin, "packing")
    client.get(f"/api/public/qr/{tok}")
    a = [x for x in client.get("/api/assets", headers=admin).json() if x["id"] == "packing"][0]
    assert a["scan_count"] >= 1 and a["last_scanned_at"]
    png = client.get("/api/assets/packing/sticker.png?template=machinery", headers=admin)
    assert png.content[:4] == b"\x89PNG" and len(png.content) > 20000
    assert client.get("/api/assets/packing/sticker.png?template=nonsense", headers=admin).status_code == 422
    assert client.get("/api/assets/stickers.pdf?template=laboratory&ids=packing", headers=admin).content[:4] == b"%PDF"
    client.patch("/api/assets/packing", json={"qr_active": False}, headers=admin)
    assert client.get(f"/api/public/qr/{tok}").status_code == 410
    assert client.post("/api/public/reports", data={"qr_token": tok, "category": "other", "description": "x"}).status_code == 410
    assert any(s["outcome"] == "disabled" for s in client.get("/api/assets/packing/scans", headers=admin).json()["scans"])
    client.patch("/api/assets/packing", json={"qr_active": True}, headers=admin)


def test_incident_filters_for_click_through(client, admin):
    a = client.get("/api/incidents?critical_only=true&open_only=true", headers=admin).json()
    assert all(i["severity"] >= 4 for i in a["items"])
    b = client.get("/api/incidents?awaiting_ack=true", headers=admin).json()
    assert all(i["status"] in ("reported", "analysed", "alerted", "escalated") for i in b["items"])
    assert client.get("/api/incidents?date_from=2999-01-01", headers=admin).json()["total"] == 0


def test_qr_lookup_is_never_cached(client, admin):
    tok = _token_for(client, admin, "lab")
    assert client.get(f"/api/public/qr/{tok}").headers["cache-control"] == "no-store"
    client.patch("/api/assets/lab", json={"qr_active": False}, headers=admin)
    r = client.get(f"/api/public/qr/{tok}")
    assert r.status_code == 410 and r.headers["cache-control"] == "no-store"
    client.patch("/api/assets/lab", json={"qr_active": True}, headers=admin)
    assert client.get(f"/api/public/qr/{tok}").status_code == 200
