"""
Browser end-to-end check (Playwright + installed Chrome). Needs `npm run dev` running (API :8000, site :5173,
sticker app :5174). The API seeds machines and demo staff logins on first start.

  python scripts/e2e/ui_flow.py [screenshot_dir]

Covers the brief's tests: 1 QR report, 2 worker portal + tracking, 6 response workflow, 7 live dashboard
(no refresh), plus the offline queue and a worker-posted AI detection.
"""
import io
import sys
import time
from pathlib import Path

import requests
from PIL import Image
from playwright.sync_api import expect, sync_playwright

SITE = "http://localhost:5173"
STICKER = "http://localhost:5174"
API = "http://localhost:8000/api"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
OUT.mkdir(parents=True, exist_ok=True)
FIX = f"E2E guard fitted {int(time.time())}"


def jpeg() -> bytes:
    b = io.BytesIO()
    Image.new("RGB", (800, 600), (90, 120, 160)).save(b, "JPEG")
    return b.getvalue()


def api_login() -> dict:
    t = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "demo1234"}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


H = api_login()
qr_token = next(a["qr_token"] for a in requests.get(f"{API}/assets", headers=H).json() if a["id"] == "filler")
errors: list[str] = []

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome")
    phone = browser.new_context(viewport={"width": 360, "height": 780}, is_mobile=True, has_touch=True)
    ph = phone.new_page()
    ph.on("pageerror", lambda e: errors.append(str(e)))

    # ---- Test 1: QR sticker -> report -> reference number ------------------------------------------------
    t0 = time.time()
    ph.goto(f"{STICKER}/q/{qr_token}")
    expect(ph.get_by_role("heading", name="Filler")).to_be_visible()
    ph.get_by_role("radio", name="Jam / pinch point").click()
    ph.get_by_label("What happened? (optional)").fill("Hand almost caught clearing a jam, machine still running")
    ph.set_input_files("input[accept='image/*']", files=[{"name": "p.jpg", "mimeType": "image/jpeg", "buffer": jpeg()}])
    ph.get_by_text("Someone could have been hurt badly").click()
    ph.screenshot(path=str(OUT / "1-qr-form.png"))
    ph.get_by_role("button", name="Send report").click()
    expect(ph.get_by_text("Thank you. You made the plant safer.")).to_be_visible()
    ref = ph.get_by_test_id("ref")
    expect(ref).to_contain_text("INC-", timeout=20000)
    qr_ref = ref.inner_text()
    print(f"PASS 1 QR scan -> report {qr_ref} in {time.time() - t0:.1f}s (scripted)")
    ph.screenshot(path=str(OUT / "2-qr-receipt.png"))

    # ---- Test 2: worker portal manual report + status tracking -------------------------------------------
    ph.goto(f"{SITE}/")
    ph.get_by_role("link", name="Report an incident").click()
    expect(ph.get_by_role("button", name="Choose the machine / area")).to_be_disabled()
    ph.get_by_label("Choose the machine / area").select_option("chem_store")
    ph.get_by_label("Or choose a category").select_option("chemical_spill")
    ph.get_by_label("What happened? (optional)").fill("Drum leaking near the door, small puddle")
    ph.set_input_files("input[accept='image/*']", files=[{"name": "p.jpg", "mimeType": "image/jpeg", "buffer": jpeg()}])
    ph.screenshot(path=str(OUT / "3-portal-form.png"))
    ph.get_by_role("button", name="Send report").click()
    expect(ph.get_by_test_id("ref")).to_contain_text("INC-", timeout=20000)
    portal_ref = ph.get_by_test_id("ref").inner_text()
    ph.get_by_role("link", name="My reports").click()
    expect(ph.get_by_text(portal_ref)).to_be_visible(timeout=15000)
    print(f"PASS 2 portal report {portal_ref} is tracked on 'My reports'")
    ph.screenshot(path=str(OUT / "4-my-reports.png"))

    # ---- Offline queue ------------------------------------------------------------------------------------
    ph.goto(f"{STICKER}/q/{qr_token}")
    expect(ph.get_by_role("heading", name="Filler")).to_be_visible()
    phone.set_offline(True)
    ph.get_by_role("radio", name="Slip / trip").click()
    ph.get_by_role("button", name="Send report").click()
    expect(ph.get_by_text("Waiting to send", exact=False)).to_be_visible()
    phone.set_offline(False)
    expect(ph.get_by_test_id("ref")).to_contain_text("INC-", timeout=40000)
    print("PASS offline report waited, then sent itself when back online")

    # ---- Hindi ----------------------------------------------------------------------------------------------
    ph.get_by_role("button", name="हिन्दी").click()
    expect(ph.get_by_text("संदर्भ संख्या")).to_be_visible()
    print("PASS Hindi strings")

    # ---- Admin: sign in, live dashboard, workflow ------------------------------------------------------------
    adm = browser.new_context(viewport={"width": 1400, "height": 950}).new_page()
    adm.on("pageerror", lambda e: errors.append(str(e)))
    adm.goto(f"{SITE}/admin")
    adm.get_by_label("Password").fill("demo1234")
    adm.get_by_role("button", name="Sign in").click()
    expect(adm.get_by_text("Latest incidents")).to_be_visible()
    expect(adm.get_by_text("live updates on")).to_be_visible(timeout=15000)
    expect(adm.get_by_text("SIMULATED notifications")).to_be_visible()
    adm.screenshot(path=str(OUT / "5-admin-overview.png"))

    # Test 7: an incident created elsewhere appears with NO page refresh
    r = requests.post(f"{API}/public/reports", data={"asset_id": "dock", "category": "logistics", "description": f"live test {FIX}"}).json()
    expect(adm.get_by_text(r["id"])).to_be_visible(timeout=10000)
    print(f"PASS 7 new incident {r['id']} appeared on the dashboard without refreshing")

    # Test 6: response workflow on the QR report
    adm.get_by_role("link", name="Incidents").click()
    adm.get_by_placeholder("Search ID or text").fill(qr_ref)
    adm.get_by_role("cell", name=qr_ref).click()
    expect(adm.get_by_text("Why severity")).to_be_visible()
    expect(adm.get_by_text("Base 3").first).to_be_visible()
    expect(adm.get_by_alt_text("evidence")).to_be_visible(timeout=10000)
    adm.screenshot(path=str(OUT / "6-incident-detail.png"))
    adm.get_by_role("button", name="Acknowledged", exact=True).click()
    adm.get_by_role("button", name="Assign").first.click()
    expect(adm.get_by_text("Assigned").first).to_be_visible(timeout=10000)
    adm.get_by_role("button", name="In progress", exact=True).click()
    adm.get_by_label("Root cause").fill("Guard missing after changeover")
    adm.get_by_label("Public update shown to the reporter and on the “You said, we did” board once resolved").fill(FIX)
    adm.get_by_role("button", name="Save notes").click()
    adm.get_by_role("button", name="Resolved", exact=True).click()
    adm.get_by_role("button", name="Closed", exact=True).click()
    expect(adm.get_by_text("Closed").first).to_be_visible()
    print("PASS 6 acknowledge -> assign -> in progress -> resolve -> close")

    # The reporter sees the update on their phone, and the public board shows the fix
    ph.goto(f"{STICKER}/my")
    expect(ph.get_by_text(FIX)).to_be_visible(timeout=15000)
    board = browser.new_context(viewport={"width": 1600, "height": 900}).new_page()
    board.goto(f"{SITE}/board")
    expect(board.get_by_text(FIX).first).to_be_visible(timeout=15000)
    board.screenshot(path=str(OUT / "7-board.png"))
    print("PASS reporter sees the team's update; public board shows the fix (no login)")

    # AI detection posted by a CV worker -> incident with evidence, model and confidence
    form = {"camera_id": "cam-store", "detector": "fire", "model": "best_nano_111.pt", "version": "e2e", "cls": "Fire",
            "confidence": "0.83", "description": f"E2E fire detection {int(time.time())}"}
    res = requests.post(f"{API}/worker/detections", data=form, files={"frame": ("f.jpg", jpeg(), "image/jpeg")},
                        headers={"X-Worker-Key": "dev-worker-key"}).json()
    iid = res.get("incident_id")
    adm.goto(f"{SITE}/admin/incidents/{iid}")
    expect(adm.get_by_text("best_nano_111.pt")).to_be_visible(timeout=10000)
    expect(adm.get_by_text("83%")).to_be_visible()
    print(f"PASS CV worker detection -> {iid} ({res['status']}) with model, confidence and evidence")

    # Other admin pages render
    for path, text in [("live", "Audio monitoring and demo simulator"), ("map", "Factory map"), ("assets", "QR stickers"),
                       ("notifications", "Alert history"), ("analytics", "By category"), ("cv", "Computer vision capabilities")]:
        adm.goto(f"{SITE}/admin/{path}")
        expect(adm.get_by_text(text).first).to_be_visible(timeout=10000)
        adm.screenshot(path=str(OUT / f"8-admin-{path}.png"))
    print("PASS live, map, assets/QR, notifications, analytics pages render")
    browser.close()

if errors:
    print("PAGE ERRORS:", errors)
    sys.exit(1)
print("ALL UI CHECKS PASSED")
