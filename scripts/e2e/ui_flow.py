"""
Browser end-to-end check (Playwright + installed Chrome). Needs `npm run dev` running (API :8000, site :5173,
sticker app :5174). The API seeds machines and demo staff logins on first start.

  python scripts/e2e/ui_flow.py [screenshot_dir]

Covers: QR report, worker portal report + tracking, offline queue, Hindi, live dashboard (no refresh),
response workflow, public board, CCTV workspace (grid, expanded view, filmstrip, layouts), AI review,
QR management (preview, PNG download, disable/enable), and every admin page.
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
PHOTO = [{"name": "p.jpg", "mimeType": "image/jpeg", "buffer": jpeg()}]


def next_step(pg):
    pg.get_by_role("button", name="Next").click()


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome")
    phone = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    ph = phone.new_page()
    ph.on("pageerror", lambda e: errors.append(str(e)))

    # ---- QR sticker report (3 steps, machine prefilled) ---------------------------------------------------
    t0 = time.time()
    ph.goto(f"{STICKER}/q/{qr_token}")
    expect(ph.get_by_text("You are reporting an issue at")).to_be_visible()
    expect(ph.get_by_text("Filler", exact=True)).to_be_visible()
    ph.get_by_role("radio", name="Machine safety").click()
    ph.screenshot(path=str(OUT / "1-qr-step1.png"))
    next_step(ph)
    ph.get_by_label("What did you see?").fill("Hand almost caught clearing a jam, machine still running")
    ph.locator("input[type=file][accept='image/*']").first.set_input_files(PHOTO)
    next_step(ph)
    ph.get_by_text("Someone could have been badly hurt").click()
    ph.screenshot(path=str(OUT / "2-qr-review.png"))
    ph.get_by_role("button", name="Send report").click()
    ref = ph.get_by_test_id("ref")
    expect(ref).to_contain_text("INC-", timeout=20000)
    qr_ref = ref.inner_text()
    code = ph.get_by_test_id("code").inner_text()
    assert len(code) >= 8
    print(f"PASS QR scan -> 3-step report {qr_ref} with access code, in {time.time() - t0:.1f}s (scripted)")
    ph.screenshot(path=str(OUT / "3-qr-done.png"))

    # ---- Worker portal: 4 steps + tracking ---------------------------------------------------------------------
    ph.goto(f"{SITE}/")
    expect(ph.get_by_text("Report a Problem. Help Keep Everyone Safe.")).to_be_visible()
    for name in ("Report an incident", "Track my report", "Get emergency help"):
        expect(ph.get_by_role("link", name=name)).to_be_visible()
    ph.get_by_role("link", name="Report an incident").click()
    ph.get_by_role("radio", name="Leak or spill").click()
    next_step(ph)
    expect(ph.get_by_role("button", name="Next")).to_be_disabled()
    ph.get_by_label("Choose the machine or area").select_option("chem_store")
    next_step(ph)
    ph.get_by_label("What did you see?").fill("Drum leaking near the door, small puddle")
    ph.locator("input[type=file][accept='image/*']").first.set_input_files(PHOTO)
    next_step(ph)
    ph.get_by_role("button", name="Send report").click()
    expect(ph.get_by_test_id("ref")).to_contain_text("INC-", timeout=20000)
    portal_ref = ph.get_by_test_id("ref").inner_text()
    ph.get_by_role("link", name="Track my report").click()
    expect(ph.get_by_text(portal_ref)).to_be_visible(timeout=15000)
    expect(ph.get_by_text("Under review").first).to_be_visible()
    ph.screenshot(path=str(OUT / "4-track.png"))
    print(f"PASS worker portal report {portal_ref} tracked with plain-language steps")

    # tracking by reference + access code on a different "device"
    other = browser.new_context(viewport={"width": 390, "height": 844}).new_page()
    other.goto(f"{SITE}/track")
    other.get_by_label("Reference number").fill(qr_ref)
    other.get_by_label("Access code").fill(code)
    other.get_by_role("button", name="Find my report").click()
    expect(other.get_by_text(qr_ref)).to_be_visible(timeout=15000)
    other.get_by_label("Access code").fill("wrong")
    other.get_by_label("Reference number").fill(portal_ref)
    other.get_by_role("button", name="Find my report").click()
    expect(other.get_by_text("We could not find that report")).to_be_visible()
    print("PASS tracking by reference + access code works; a wrong code reveals nothing")

    # emergency page
    ph.goto(f"{SITE}/help")
    expect(ph.get_by_text("This app does not call emergency services")).to_be_visible()
    print("PASS emergency page states it does not call emergency services")

    # ---- Offline queue -------------------------------------------------------------------------------------------
    ph.goto(f"{STICKER}/q/{qr_token}")
    expect(ph.get_by_text("You are reporting an issue at")).to_be_visible()
    ph.get_by_role("radio", name="Injury or fall").click()
    next_step(ph)
    next_step(ph)
    phone.set_offline(True)
    ph.get_by_role("button", name="Send report").click()
    expect(ph.get_by_text("It will send by itself", exact=False)).to_be_visible()
    phone.set_offline(False)
    expect(ph.get_by_test_id("ref")).to_contain_text("INC-", timeout=40000)
    print("PASS offline report waited, then sent itself when back online")

    # ---- Hindi -------------------------------------------------------------------------------------------------------
    ph.get_by_role("button", name="Change language").click()
    expect(ph.get_by_text("धन्यवाद। आपकी रिपोर्ट भेज दी गई।")).to_be_visible()
    print("PASS Hindi")

    # ---- Admin ---------------------------------------------------------------------------------------------------------
    adm = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
    adm.on("pageerror", lambda e: errors.append(str(e)))
    adm.goto(f"{SITE}/admin")
    adm.get_by_label("Password").fill("demo1234")
    adm.get_by_role("button", name="Sign in").click()
    expect(adm.get_by_text("Total incidents")).to_be_visible(timeout=20000)
    expect(adm.get_by_text("Live updates")).to_be_visible(timeout=15000)
    expect(adm.get_by_text("Alerts simulated")).to_be_visible()
    adm.screenshot(path=str(OUT / "5-overview.png"))
    for label in ("Overview", "Live CCTV", "AI Monitoring", "Incidents", "QR Management", "Factory Map", "Audio Monitoring", "Responders", "Analytics", "Investigations", "Model Configuration", "Settings"):
        expect(adm.get_by_role("link", name=label, exact=True)).to_be_visible()
    print("PASS sidebar has all 12 sections")

    # a KPI is a link into a filtered list
    adm.get_by_role("main").get_by_role("button", name="Awaiting acknowledgement").click()
    expect(adm).to_have_url(__import__("re").compile(r"awaiting_ack=true"))
    adm.go_back()

    # incident created elsewhere appears with no refresh
    r = requests.post(f"{API}/public/reports", data={"asset_id": "dock", "category": "logistics", "description": f"live test {FIX}"}).json()
    expect(adm.get_by_text(r["id"]).first).to_be_visible(timeout=10000)
    print(f"PASS new incident {r['id']} appeared on the overview without refreshing")

    # response workflow on the QR report
    adm.get_by_role("link", name="Incidents", exact=True).click()
    adm.get_by_label("Search", exact=True).fill(qr_ref)
    adm.get_by_role("cell", name=qr_ref).click()
    expect(adm.get_by_text("Why this severity")).to_be_visible()
    expect(adm.get_by_alt_text("evidence").first).to_be_visible(timeout=10000)
    adm.screenshot(path=str(OUT / "6-incident.png"), full_page=True)
    adm.get_by_role("button", name="Acknowledged", exact=True).click()
    adm.get_by_role("button", name="Assign", exact=True).click()
    dlg = adm.get_by_role("dialog")
    dlg.get_by_label("Responder (only available people in this department)").select_option(index=1)
    dlg.get_by_role("button", name="Assign", exact=True).click()
    expect(adm.get_by_text("Assigned").first).to_be_visible(timeout=10000)
    adm.get_by_role("button", name="In progress", exact=True).click()
    adm.get_by_label("Root cause").fill("Guard missing after changeover")
    adm.get_by_label("Public update (shown to the reporter and on the “You said, we did” board once resolved)").fill(FIX)
    adm.get_by_role("button", name="Save notes").click()
    adm.get_by_role("button", name="Resolved", exact=True).click()
    adm.get_by_role("dialog").get_by_label("What was done? (kept in the timeline)").fill("Fitted interlocked guard")
    adm.get_by_role("dialog").get_by_role("button", name="Mark resolved").click()
    adm.get_by_role("button", name="Closed", exact=True).click()
    expect(adm.get_by_text("Closed", exact=True).first).to_be_visible(timeout=10000)
    print("PASS acknowledge -> assign -> in progress -> notes -> resolve -> close")

    ph.goto(f"{STICKER}/track")  # same app (and storage) the QR report was sent from
    expect(ph.get_by_text(FIX)).to_be_visible(timeout=15000)
    board = browser.new_context(viewport={"width": 1600, "height": 900}).new_page()
    board.goto(f"{SITE}/board")
    expect(board.get_by_text(FIX).first).to_be_visible(timeout=15000)
    board.screenshot(path=str(OUT / "7-board.png"))
    print("PASS reporter sees the team's update; public board shows the fix")

    # ---- CCTV workspace --------------------------------------------------------------------------------------------------
    adm.goto(f"{SITE}/admin/cctv")
    expect(adm.get_by_role("button", name="Open Chemical store camera")).to_be_visible(timeout=15000)
    tiles = adm.get_by_role("button", name="Open ", exact=False).count()
    assert tiles >= 4, tiles
    adm.get_by_role("button", name="Online", exact=False).first.click()  # filter works (may show 0)
    adm.get_by_role("button", name="All", exact=False).first.click()
    adm.get_by_label("Search cameras").fill("aisle")
    expect(adm.get_by_role("button", name="Open Forklift aisle camera")).to_be_visible()
    assert adm.get_by_role("button", name="Open Chemical store camera").count() == 0
    adm.get_by_label("Search cameras").fill("")
    adm.get_by_role("button", name="Open Chemical store camera").click()
    expect(adm.get_by_role("button", name="Return to grid")).to_be_visible()
    expect(adm.get_by_text("Camera health")).to_be_visible()
    expect(adm.get_by_role("listbox", name="Cameras")).to_be_visible()
    adm.get_by_role("button", name="Next camera").click()
    expect(adm.get_by_text("2 / 5")).to_be_visible()
    adm.get_by_role("listbox", name="Cameras").get_by_role("option").nth(0).click()
    expect(adm.get_by_text("1 / 5")).to_be_visible()
    adm.screenshot(path=str(OUT / "8-cctv-expanded.png"))
    adm.get_by_role("button", name="Return to grid").click()
    adm.get_by_role("button", name="9 cameras").click()
    expect(adm.get_by_role("button", name="Open Chemical store camera")).to_be_visible()
    adm.get_by_role("button", name="2 cameras").click()
    assert adm.get_by_role("button", name="Open ", exact=False).count() == 2
    expect(adm.get_by_role("button", name="Toggle full screen")).to_be_visible()
    print("PASS CCTV: grid, search filter, expanded view, prev/next, filmstrip, layouts 2/9, return to grid")

    # ---- AI monitoring: a worker-posted detection can be reviewed ------------------------------------------------------------
    form = {"camera_id": "cam-yard", "detector": "violence", "model": "pose-gate", "version": "e2e", "cls": "possible_altercation",
            "confidence": "0.61", "description": f"E2E potential altercation {int(time.time())}"}
    res = requests.post(f"{API}/worker/detections", data=form, files={"frame": ("f.jpg", jpeg(), "image/jpeg")}, headers={"X-Worker-Key": "dev-worker-key"}).json()
    iid = res.get("incident_id")
    adm.goto(f"{SITE}/admin/ai")
    card = adm.get_by_role("listitem").filter(has_text=iid)
    expect(card).to_be_visible(timeout=15000)
    expect(card.get_by_text("Human verification required")).to_be_visible()
    card.get_by_role("button", name="False positive").click()
    expect(adm.get_by_role("listitem").filter(has_text=iid).get_by_text("False positive").first).to_be_visible(timeout=10000)
    print(f"PASS AI monitoring: {iid} reviewed as false positive")

    # ---- QR management ---------------------------------------------------------------------------------------------------------
    adm.goto(f"{SITE}/admin/qr")
    expect(adm.get_by_alt_text("Sticker preview for Capper")).to_be_visible(timeout=20000)
    with adm.expect_download() as dl:
        adm.get_by_role("button", name="PNG").click()
    assert dl.value.suggested_filename.endswith(".png")
    adm.screenshot(path=str(OUT / "9-qr.png"))
    adm.get_by_role("row").filter(has_text="Filler").first.click()
    adm.get_by_role("button", name="Disable").click()
    expect(adm.get_by_role("button", name="Enable")).to_be_visible(timeout=10000)
    refused = browser.new_context(viewport={"width": 390, "height": 844}).new_page()
    refused.goto(f"{STICKER}/q/{qr_token}")
    expect(refused.get_by_text("disabled", exact=False)).to_be_visible(timeout=10000)
    adm.get_by_role("button", name="Enable").click()
    expect(adm.get_by_role("button", name="Disable")).to_be_visible(timeout=10000)
    refused.goto(f"{STICKER}/q/{qr_token}")
    expect(refused.get_by_text("You are reporting an issue at")).to_be_visible(timeout=10000)
    print("PASS QR management: preview, PNG download, disable refuses scans, enable restores")

    # ---- the rest of the admin pages render ---------------------------------------------------------------------------------------
    for path, text in [("map", "Factory Map"), ("audio", "Audio sources"), ("responders", "Directory and workload"), ("analytics", "Department performance"),
                       ("investigations", "Under investigation"), ("models", "Camera assignment"), ("settings", "Notification channels")]:
        adm.goto(f"{SITE}/admin/{path}")
        expect(adm.get_by_text(text).first).to_be_visible(timeout=15000)
        adm.screenshot(path=str(OUT / f"10-{path}.png"))
    adm.get_by_role("button", name="Public data & sources").click()
    expect(adm.get_by_text("Not verified, therefore not shown")).to_be_visible(timeout=10000)
    print("PASS map, audio, responders, analytics, investigations, models, settings and public-data pages render")
    browser.close()

if errors:
    print("PAGE ERRORS:", errors)
    sys.exit(1)
print("ALL UI CHECKS PASSED")
