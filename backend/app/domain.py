"""Categories, lifecycle, department routing and explainable severity triage.

AI confidence and severity are separate values: severity comes from these configurable rules (plus human
assessment later), never from model confidence alone. All weights are judgement calls, not calibrated data.
"""

import re
from datetime import datetime, timezone

CATEGORIES = {
    "machinery_accident": "Machinery accidents",
    "chemical_spill": "Chemical spills and leakage",
    "fire_explosion": "Fire and explosion hazards",
    "production_quality": "Production quality incidents",
    "lab_contamination": "Laboratory sample contamination",
    "storage_handling": "Storage and handling incidents",
    "warehouse_accident": "Warehouse accidents",
    "logistics": "Distribution and logistics problems",
    "waste_disposal": "Improper waste disposal",
    "worker_safety": "Worker safety (fall, PPE, near miss)",
    "security": "Security / violence event",
    "other": "Other",
}

# Which categories have a working automatic detector. "pending" ones are manual-report only.
AI_COVERAGE = {
    "machinery_accident": "partial",  # hand-in-zone, forklift-person (rules on pretrained YOLO)
    "chemical_spill": "experimental",  # open-vocabulary spill prompt, cannot identify the chemical
    "fire_explosion": "trained",  # user's fire/smoke model
    "production_quality": "pending",
    "lab_contamination": "pending",
    "storage_handling": "experimental",
    "warehouse_accident": "experimental",
    "logistics": "pending",
    "waste_disposal": "experimental",
    "worker_safety": "experimental",  # pose-rule fall, PPE open-vocabulary
    "security": "experimental",
    "other": "pending",
}

DEPARTMENT_BY_CATEGORY = {
    "machinery_accident": "Maintenance",
    "chemical_spill": "EHS",
    "fire_explosion": "EHS",
    "production_quality": "Quality Assurance",
    "lab_contamination": "Laboratory",
    "storage_handling": "Warehouse",
    "warehouse_accident": "Warehouse",
    "logistics": "Logistics",
    "waste_disposal": "Waste Management",
    "worker_safety": "EHS",
    "security": "Security",
    "other": "EHS",
}
# Second department that is told as well (the "X / Y" pairs in the routing table).
SECONDARY_DEPARTMENT = {
    "machinery_accident": "EHS",
    "fire_explosion": "Security",
    "lab_contamination": "Quality Assurance",
    "storage_handling": "EHS",
    "warehouse_accident": "EHS",
    "waste_disposal": "EHS",
}
DEPARTMENTS = sorted(set(DEPARTMENT_BY_CATEGORY.values()) | set(SECONDARY_DEPARTMENT.values()))

STATUSES = [
    "reported",  # DETECTED / REPORTED
    "analysed",
    "alerted",
    "acknowledged",
    "assigned",
    "in_progress",
    "resolved",
    "closed",
    "rejected",
    "false_positive",
    "duplicate",
    "escalated",
]
OPEN_STATUSES = ("reported", "analysed", "alerted", "acknowledged", "assigned", "in_progress", "escalated")
# Allowed moves. Anything may become rejected/false_positive/duplicate/escalated from an open state.
FLOW = {
    "reported": ["analysed", "alerted", "acknowledged", "assigned"],
    "analysed": ["alerted", "acknowledged", "assigned"],
    "alerted": ["acknowledged", "assigned", "escalated"],
    "acknowledged": ["assigned", "in_progress", "resolved"],
    "assigned": ["acknowledged", "in_progress", "resolved"],
    "in_progress": ["resolved", "assigned"],
    "escalated": ["acknowledged", "assigned", "in_progress", "resolved"],
    "resolved": ["closed", "in_progress"],
    "closed": [],
    "rejected": [],
    "false_positive": [],
    "duplicate": [],
}
TERMINAL_SIDE = ("rejected", "false_positive", "duplicate", "escalated")


def can_move(cur: str, new: str) -> bool:
    if new == cur:
        return True
    if new in TERMINAL_SIDE and cur in OPEN_STATUSES:
        return True
    return new in FLOW.get(cur, [])


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# --- Triage -----------------------------------------------------------------------------------------------
BASE_SEVERITY = {
    "machinery_accident": 3,
    "chemical_spill": 3,
    "fire_explosion": 4,
    "production_quality": 2,
    "lab_contamination": 2,
    "storage_handling": 2,
    "warehouse_accident": 3,
    "logistics": 1,
    "waste_disposal": 2,
    "worker_safety": 3,
    "security": 3,
    "other": 1,
}
HIGH_RISK_LOCATION_WEIGHT = 1.5
FAST_TRACK_SEVERITY = 4

SEVERE_KEYWORDS = [
    # English
    "trapped", "stuck", "caught in", "crushed", "crush", "fire", "sparks", "smoke", "bleeding", "almost hit",
    "nearly hit", "electric shock", "shock", "burn", "burnt", "explosion", "unconscious", "gas leak",
    # Hinglish
    "fas gaya", "fas gayi", "phas gaya", "phas gayi", "phans", "haath fas", "hath fas", "aag", "chingari", "dhuan",
    "dhua", "khoon", "bijli ka jhatka", "current laga", "karant", "jhatka", "jal gaya", "kat gaya", "takra",
    "bal bal bacha", "bachi", "girne wala", "gas leak",
    # Hindi
    "फंस", "फँस", "हाथ फंस", "आग", "चिंगारी", "धुआं", "धुँआ", "खून", "करंट", "झटका", "जल गया", "कट गया", "कुचल",
    "टक्कर", "टकरा", "गिरने वाला",
]

ECO_RULES = [
    ("air_leak", ["air leak", "hissing", "compressed air", "hawa leak"]),
    ("steam_leak", ["steam"]),
    ("spill", ["spill", "leak", "dripping", "puddle", "leakage"]),
    ("idle_machine", ["running empty", "idle machine", "nobody there"]),
    ("material_waste", ["wasted", "waste of", "scrap", "overfill"]),
]


def _has(text: str, kw: str) -> bool:
    if re.search(r"[ऀ-ॿ]", kw):
        return kw in text
    return re.search(rf"(?<![a-z]){re.escape(kw)}(?![a-z])", text) is not None


def triage(
    *, category: str, text: str = "", serious_harm: bool = False, injury_now: bool = False, risk_weight: float = 1.0,
    source: str = "portal",
) -> dict:
    """Return {severity, reasons[], department, secondary_department, eco_tag, route}."""
    base = BASE_SEVERITY.get(category, 1)
    sev = base
    reasons = [f"Base {base}: {CATEGORIES.get(category, category)}"]
    low = (text or "").lower()
    if serious_harm:
        sev += 1
        reasons.append("+1 worker says someone could have been hurt badly")
    if risk_weight >= HIGH_RISK_LOCATION_WEIGHT:
        sev += 1
        reasons.append(f"+1 high-risk location (weight {risk_weight:g})")
    hit = next((k for k in SEVERE_KEYWORDS if _has(low, k)), None)
    if hit:
        sev += 1
        reasons.append(f"+1 severe keyword '{hit}'")
    sev = max(1, min(5, sev))
    if sev != base + (1 if serious_harm else 0) + (1 if risk_weight >= HIGH_RISK_LOCATION_WEIGHT else 0) + (1 if hit else 0):
        reasons.append(f"Clamped to {sev} (scale 1-5)")
    if injury_now:
        reasons.append("Someone is hurt now: emergency route (simulated dispatch), severity not changed")
    eco = next((tag for tag, kws in ECO_RULES if any(_has(low, k) for k in kws)), None)
    route = "emergency" if injury_now else ("supervisor_fast_track" if sev >= FAST_TRACK_SEVERITY else "standard")
    return {
        "severity": sev,
        "reasons": reasons,
        "department": DEPARTMENT_BY_CATEGORY.get(category, "EHS"),
        "secondary_department": SECONDARY_DEPARTMENT.get(category),
        "eco_tag": eco,
        "route": route,
        "source": source,
    }
