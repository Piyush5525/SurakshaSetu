"""
Browser end-to-end check (Playwright + installed Chrome). Needs `npm run dev` and `npm run seed` running.

  python scripts/e2e/ui_flow.py [screenshot_dir]

Flow: worker reports (icon + fake voice + photo) on a phone viewport -> receipt -> staff sign-in ->
inbox shows severity + reason -> start work with a public fix text -> public board shows it.
"""
import io
import sys
import time
from pathlib import Path

from PIL import Image
from playwright.sync_api import expect, sync_playwright

BASE = "http://localhost:5173"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
OUT.mkdir(parents=True, exist_ok=True)
FIX_TEXT = f"E2E guard fitted {int(time.time())}"


def jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (800, 600), (90, 120, 160)).save(buf, "JPEG")
    return buf.getvalue()


with sync_playwright() as p:
    browser = p.chromium.launch(
        channel="chrome",
        args=[
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
        ],
    )
    phone = browser.new_context(
        viewport={"width": 360, "height": 740},
        permissions=["microphone"],
        is_mobile=True,
        has_touch=True,
    )
    page = phone.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    t0 = time.time()
    page.goto(f"{BASE}/r/filler")
    expect(page.get_by_role("heading", name="Filler")).to_be_visible()
    page.get_by_role("radio", name="Jam / pinch point").click()
    page.get_by_role("button", name="Tap to record").click()
    page.wait_for_timeout(1500)
    page.get_by_role("button", name="Tap to stop").click()
    expect(page.get_by_text("Voice note saved")).to_be_visible()
    page.set_input_files(
        "input[type=file]", files=[{"name": "p.jpg", "mimeType": "image/jpeg", "buffer": jpeg_bytes()}]
    )
    page.get_by_text("Someone could have been hurt badly").click()
    page.screenshot(path=str(OUT / "1-report-form.png"))
    page.get_by_role("button", name="Send report").click()
    expect(page.get_by_text("Thank you. You made the plant safer.")).to_be_visible()
    elapsed = time.time() - t0
    print(f"PASS worker report submitted (scripted, {elapsed:.1f}s)")
    code = page.locator("p.text-4xl").inner_text()
    expect(page.get_by_text("Sent", exact=False).first).to_be_visible(timeout=20000)
    print(f"PASS receipt {code} shows Sent")
    page.screenshot(path=str(OUT / "2-receipt.png"))

    # Hindi toggle
    page.get_by_role("button", name="Change language").click()
    expect(page.get_by_text("धन्यवाद")).to_be_visible()
    print("PASS Hindi strings")

    staff = browser.new_context(viewport={"width": 1280, "height": 900})
    s = staff.new_page()
    s.on("pageerror", lambda e: errors.append(str(e)))
    s.goto(f"{BASE}/admin")
    s.get_by_role("button", name="Sign in").click()
    expect(s.get_by_text("Safer Work — EHS dashboard")).to_be_visible()
    s.wait_for_timeout(3000)
    s.screenshot(path=str(OUT / "3-admin-overview.png"), full_page=True)
    print("PASS staff sign-in + overview")

    s.get_by_role("link", name="Inbox").click()
    row = s.locator("li", has_text=code).first
    row_btn = s.locator("li button", has_text="Filler").first
    # newest report first; wait for triage to fill the severity
    s.wait_for_timeout(2500)
    s.locator("ul li button").first.click()
    expect(s.get_by_text("Why this severity")).to_be_visible(timeout=15000)
    expect(s.get_by_text("Base 3 (jam clearing")).to_be_visible(timeout=20000)
    expect(s.get_by_text(code).first).to_be_visible()
    s.screenshot(path=str(OUT / "4-inbox-detail.png"), full_page=True)
    print("PASS inbox shows triaged report with reason")

    s.get_by_role("link", name="Actions").click()
    first = s.locator("ul li").first
    first.get_by_role("combobox").first.select_option("in_progress")
    first.get_by_placeholder("e.g. Added an interlocked guard").fill(FIX_TEXT)
    first.get_by_placeholder("e.g. Added an interlocked guard").blur()
    s.wait_for_timeout(1500)
    print("PASS action moved to in progress with public fix text")

    board = browser.new_context(viewport={"width": 1920, "height": 1080}).new_page()
    board.on("pageerror", lambda e: errors.append(str(e)))
    board.goto(f"{BASE}/board")
    expect(board.get_by_text("You said, we did").first).to_be_visible()
    expect(board.get_by_text(FIX_TEXT).first).to_be_visible(timeout=15000)
    board.screenshot(path=str(OUT / "5-board.png"))
    print("PASS public board shows the fix (no login)")

    browser.close()

if errors:
    print("PAGE ERRORS:", errors)
    sys.exit(1)
print("ALL UI CHECKS PASSED")
