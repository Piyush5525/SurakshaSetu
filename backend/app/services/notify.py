"""Notification service: Telegram + voice call (OmniDimension), simulated by default.

Safety rules (carried over from the project's honesty rules):
- DEMO_MODE (default true) never contacts anyone: the message is logged as SIMULATED.
- Voice calls only go to a configured on-call duty number or an explicit allowlist, only when CALLS_ENABLED,
  and NEVER to emergency-service numbers (100, 101, 102, 108, 112, 911, 999...). We do not integrate with
  police or ambulance services.
- Telegram text carries incident id, category, severity, location, time and a dashboard link. Evidence images
  are not attached by default (privacy); the link requires staff sign-in.
"""

import logging
import re

import httpx

from .. import db
from ..config import settings
from ..domain import CATEGORIES, now_iso

log = logging.getLogger("notify")
EMERGENCY_NUMBERS = {"100", "101", "102", "108", "112", "911", "999", "000", "199"}


def _digits(n: str) -> str:
    return re.sub(r"\D", "", n or "")


def call_allowed(number: str) -> tuple[bool, str]:
    d = _digits(number)
    if not d:
        return False, "no number"
    if d in EMERGENCY_NUMBERS or len(d) < 7:
        return False, "emergency-service or invalid number is hard-blocked"
    if not settings.CALLS_ENABLED:
        return False, "CALLS_ENABLED is false"
    allowed = {_digits(settings.ALERT_PHONE_NUMBER), *(_digits(x) for x in settings.CALL_ALLOWLIST)}
    allowed.discard("")
    if d not in allowed:
        return False, "number not on the allowlist"
    return True, "ok"


def _log(incident_id: str, channel: str, recipient: str, status: str, detail: str, level: int, simulated: bool) -> int:
    return db.run(
        "INSERT INTO notifications(incident_id,channel,recipient,status,detail,level,simulated,created_at) VALUES(?,?,?,?,?,?,?,?)",
        (incident_id, channel, recipient, status, detail[:500], level, int(simulated), now_iso()),
    )


def build_message(inc: dict, level: int = 0) -> str:
    cat = CATEGORIES.get(inc["category"], inc["category"])
    where = " / ".join(x for x in [inc.get("site"), inc.get("building"), inc.get("zone"), inc.get("asset_id")] if x)
    tag = "" if not inc.get("simulated") else " [SIMULATED EVENT]"
    ver = "\nEXPERIMENTAL AI detection: please verify before acting." if inc.get("requires_verification") else ""
    esc = f"ESCALATION level {level}\n" if level else ""
    return (
        f"{esc}{'CRITICAL ' if inc['severity'] >= 4 else ''}INCIDENT {inc['id']}{tag}\n"
        f"{cat} | severity {inc['severity']}/5 | source {inc['source']}\n"
        f"Where: {where or 'unknown'}\nWhen: {inc['created_at']}{ver}\n"
        f"Open: {settings.PUBLIC_URL}/admin/incidents/{inc['id']}"
    )


def send_telegram(incident_id: str, text: str, chat_id: str | None, level: int = 0) -> dict:
    chat = chat_id or settings.TELEGRAM_CHAT_ID
    if settings.DEMO_MODE or not settings.TELEGRAM_BOT_TOKEN or not chat:
        why = "DEMO_MODE" if settings.DEMO_MODE else "Telegram not configured"
        nid = _log(incident_id, "telegram", chat or "-", "simulated", f"{why}: {text[:200]}", level, True)
        return {"id": nid, "status": "simulated"}
    try:
        r = httpx.post(
            f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": chat, "text": text, "disable_web_page_preview": True},
            timeout=15,
        )
        ok = r.status_code == 200 and r.json().get("ok")
        nid = _log(incident_id, "telegram", chat, "sent" if ok else "failed", "" if ok else r.text[:200], level, False)
        return {"id": nid, "status": "sent" if ok else "failed"}
    except httpx.HTTPError as e:
        # Never log the URL (it contains the bot token).
        nid = _log(incident_id, "telegram", chat, "failed", type(e).__name__, level, False)
        return {"id": nid, "status": "failed"}


def place_call(incident_id: str, text: str, number: str | None, level: int = 0) -> dict:
    number = number or settings.ALERT_PHONE_NUMBER
    ok, why = call_allowed(number or "")
    shown = ("***" + _digits(number)[-3:]) if number else "-"
    if not ok:
        nid = _log(incident_id, "call", shown, "blocked", why, level, False)
        return {"id": nid, "status": "blocked", "reason": why}
    if settings.DEMO_MODE or not (settings.OMNIDIM_API_KEY and settings.OMNIDIM_AGENT_ID):
        nid = _log(incident_id, "call", shown, "simulated", "DEMO_MODE or call provider not configured", level, True)
        return {"id": nid, "status": "simulated"}
    payload: dict = {
        "agent_id": int(settings.OMNIDIM_AGENT_ID),
        "to_number": number,
        "call_context": {"alert_message": text.replace("\n", ". ")[:400]},
    }
    if settings.OMNIDIM_FROM_NUMBER_ID:
        payload["from_number_id"] = int(settings.OMNIDIM_FROM_NUMBER_ID)
    try:
        r = httpx.post(
            settings.OMNIDIM_URL, json=payload, headers={"Authorization": f"Bearer {settings.OMNIDIM_API_KEY}"}, timeout=15
        )
        okr = r.status_code < 300
        nid = _log(incident_id, "call", shown, "sent" if okr else "failed", "" if okr else f"HTTP {r.status_code}", level, False)
        return {"id": nid, "status": "sent" if okr else "failed"}
    except httpx.HTTPError as e:
        nid = _log(incident_id, "call", shown, "failed", type(e).__name__, level, False)
        return {"id": nid, "status": "failed"}


def dispatch_alert(inc: dict, level: int = 0) -> list[dict]:
    """Notify the responsible department(s). Level 0 = first alert, >=1 = escalation (manager + call)."""
    text = build_message(inc, level)
    out: list[dict] = []
    route = db.one("SELECT min_severity, call_min_severity FROM routing WHERE category=?", (inc["category"],)) or {}
    min_sev, call_min = route.get("min_severity", 1), route.get("call_min_severity", 4)
    if level == 0 and inc["severity"] < min_sev:
        _log(inc["id"], "telegram", "-", "skipped", f"severity {inc['severity']} below routing threshold {min_sev}", 0, False)
        return out
    depts = [d for d in [inc.get("department"), _secondary(inc)] if d]
    chats: list[str | None] = []
    for d in depts:
        for r in db.rows("SELECT telegram_chat_id FROM responders WHERE department=? AND available=1 AND telegram_chat_id IS NOT NULL AND telegram_chat_id!=''", (d,)):
            chats.append(r["telegram_chat_id"])
    if level >= 1:
        for r in db.rows("SELECT telegram_chat_id FROM responders WHERE role='manager' AND available=1 AND telegram_chat_id IS NOT NULL AND telegram_chat_id!=''"):
            chats.append(r["telegram_chat_id"])
    chats = list(dict.fromkeys(chats)) or [None]  # fall back to the default chat
    for c in chats:
        out.append(send_telegram(inc["id"], text, c, level))
    # Voice call only for critical incidents or escalations.
    if inc["severity"] >= call_min or level >= 1:
        out.append(place_call(inc["id"], text, None, level))
    return out


def _secondary(inc: dict) -> str | None:
    from ..domain import SECONDARY_DEPARTMENT

    route = db.one('SELECT secondary FROM routing WHERE category=?', (inc['category'],))
    s = route['secondary'] if route else SECONDARY_DEPARTMENT.get(inc['category'])
    return s if s != inc.get("department") else None
