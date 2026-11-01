"""Take screenshots of every portal page for visual review.  python scripts/e2e/shots.py OUTDIR"""

import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "shots")
OUT.mkdir(parents=True, exist_ok=True)
SITE, STICKER = "http://localhost:5173", "http://localhost:5174"

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    adm = b.new_context(viewport={"width": 1440, "height": 900}).new_page()
    errs: list[str] = []
    adm.on("pageerror", lambda e: errs.append(str(e)))
    adm.goto(f"{SITE}/admin")
    adm.screenshot(path=str(OUT / "00-signin.png"))
    adm.get_by_label("Password").fill("demo1234")
    adm.get_by_role("button", name="Sign in").click()
    expect(adm.get_by_text("Total incidents")).to_be_visible(timeout=20000)
    adm.wait_for_timeout(1200)
    pages = [("overview", ""), ("cctv", "cctv"), ("ai", "ai"), ("incidents", "incidents"), ("qr", "qr"), ("map", "map"),
             ("audio", "audio"), ("responders", "responders"), ("analytics", "analytics"), ("investigations", "investigations"),
             ("models", "models"), ("settings", "settings")]
    for name, path in pages:
        adm.goto(f"{SITE}/admin/{path}")
        adm.wait_for_timeout(2500 if name in ("cctv", "qr") else 1200)
        adm.screenshot(path=str(OUT / f"{name}.png"), full_page=name not in ("cctv",))
    # expanded camera view
    adm.goto(f"{SITE}/admin/cctv")
    adm.wait_for_timeout(2500)
    adm.get_by_role("button", name="Open Chemical store camera").click()
    adm.wait_for_timeout(2500)
    adm.screenshot(path=str(OUT / "cctv-expanded.png"))
    ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True).new_page()
    ph.on("pageerror", lambda e: errs.append(str(e)))
    for name, url in [("w-home", f"{SITE}/"), ("w-report", f"{SITE}/report"), ("w-track", f"{SITE}/track"), ("w-help", f"{SITE}/help"), ("w-qr-landing", f"{STICKER}/")]:
        ph.goto(url)
        ph.wait_for_timeout(700)
        ph.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
    b.close()
print("page errors:", errs or "none")
