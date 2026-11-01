"""Printable QR sticker templates (PNG at 300 dpi, PDF sheets).

Size: 100 x 140 mm (1181 x 1654 px). Four templates share one layout and differ in colour and wording.
The label says it is a hackathon prototype; no L'Oréal logo or trademarked artwork is used.
"""

import io

import segno
from PIL import Image, ImageDraw, ImageFont

W, H = 1181, 1654  # 100 x 140 mm at 300 dpi
MM = 300 / 25.4

TEMPLATES = {
    "machinery": {"primary": (200, 16, 46), "dark": (28, 28, 34), "label": "MACHINERY", "tip": "Jam, pinch point, guard missing, noise, leak"},
    "laboratory": {"primary": (14, 116, 144), "dark": (15, 23, 42), "label": "LABORATORY", "tip": "Spill, contamination, sample, equipment"},
    "warehouse": {"primary": (217, 119, 6), "dark": (28, 25, 23), "label": "WAREHOUSE", "tip": "Forklift, falling stock, blocked aisle, damage"},
    "general": {"primary": (30, 41, 59), "dark": (200, 16, 46), "label": "WORKPLACE", "tip": "Slip, trip, fire, injury, anything unsafe"},
}


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # very old Pillow
        return ImageFont.load_default()


def _center(d: ImageDraw.ImageDraw, y: int, text: str, font, fill, width: int = W) -> None:
    box = d.textbbox((0, 0), text, font=font)
    d.text(((width - (box[2] - box[0])) / 2 - box[0], y), text, font=font, fill=fill)


def _fit(d: ImageDraw.ImageDraw, text: str, max_w: int, start: int, floor: int = 56):
    size = start
    while size > floor:
        f = _font(size)
        b = d.textbbox((0, 0), text, font=f)
        if b[2] - b[0] <= max_w:
            return f
        size -= 4
    return _font(floor)


def render_png(asset: dict, qr_url: str, template: str = "general") -> bytes:
    t = TEMPLATES.get(template, TEMPLATES["general"])
    primary, dark = t["primary"], t["dark"]
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((8, 8, W - 9, H - 9), radius=56, outline=primary, width=16)
    d.rounded_rectangle((8, 8, W - 9, 400), radius=56, fill=primary)
    d.rectangle((8, 300, W - 9, 400), fill=primary)
    _center(d, 60, t["label"] + " SAFETY", _font(54), (255, 255, 255, 200))
    _center(d, 140, "SCAN TO REPORT", _font(130), "white")
    _center(d, 280, "AN INCIDENT", _font(104), "white")

    qr = segno.make(qr_url, error="m")
    buf = io.BytesIO()
    qr.save(buf, kind="png", scale=16, border=2, dark=dark, light="white")
    qimg = Image.open(buf).convert("RGB")
    cx = (W - 760) // 2
    d.rounded_rectangle((cx, 430, cx + 760, 1170), radius=36, fill="white", outline=(210, 214, 220), width=6)
    img.paste(qimg.resize((700, 700), Image.NEAREST), (cx + 30, 450))

    name = asset["name"][:40]
    _center(d, 1195, name, _fit(d, name, W - 160, 104), dark)
    where = " · ".join(x for x in [asset.get("zone"), asset.get("building"), asset.get("department")] if x)[:60]
    _center(d, 1315, where, _font(44), (90, 98, 110))
    _center(d, 1372, f"ID {asset['id'].upper()}", _font(42), primary)

    # three steps: number badge above a short label, evenly spaced
    steps = [("1", "Scan"), ("2", "Tap issue"), ("3", "Send")]
    col = (W - 160) // 3
    for i, (n, label) in enumerate(steps):
        x = 80 + i * col + col // 2
        d.ellipse((x - 32, 1416, x + 32, 1480), fill=primary)
        d.text((x - 11, 1424), n, font=_font(46), fill="white")
        box = d.textbbox((0, 0), label, font=_font(40))
        d.text((x - (box[2] - box[0]) / 2 - box[0], 1486), label, font=_font(40), fill=dark)
    _center(d, 1548, "Anonymous · under 30 seconds · no login · Safer Work", _font(34), (90, 98, 110))
    _center(d, 1590, "Hackathon prototype · not an official L'Oreal product", _font(30), (130, 138, 150))
    out = io.BytesIO()
    img.save(out, format="PNG", dpi=(300, 300))
    return out.getvalue()


def render_pdf(items: list[tuple[dict, str]], template: str = "general") -> bytes:
    """A4 sheets, 2 x 2 stickers of 100 x 140 mm each (cut marks implied by the border)."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    pw, ph = A4
    sw, sh = 100 * mm, 140 * mm
    ox, oy = (pw - 2 * sw) / 2, (ph - 2 * sh) / 2
    for i, (asset, url) in enumerate(items):
        if i and i % 4 == 0:
            c.showPage()
        col, row = i % 2, (i % 4) // 2
        png = render_png(asset, url, template)
        c.drawImage(ImageReader(io.BytesIO(png)), ox + col * sw, oy + (1 - row) * sh, sw, sh)
    if not items:
        c.drawString(40, 800, "No stickers to print.")
    c.save()
    return buf.getvalue()
