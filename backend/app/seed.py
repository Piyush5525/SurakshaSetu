"""Demo data: plant layout, machines + QR tokens, cameras, responders, staff logins, sample incidents.

Everything here is synthetic. Sample incidents are stored with simulated=1 so the UI labels them as sample data.
Run:  python -m backend.app.seed   (from the repo root)  or let the server call seed_basics() on first start.
"""

import os
import random
from datetime import UTC, datetime, timedelta

from . import db
from .domain import now_iso
from .routers.auth_assets import new_qr_token
from .security import hash_pw
from .services import incidents as svc

ASSETS = [
    # id, name, name_hi, kind, zone, dept, x, y, w, h, risk
    ("filler", "Filler", "फिलर", "machine", "Filling", "Maintenance", 8, 10, 22, 18, 1.5),
    ("capper", "Capper", "कैपर", "machine", "Filling", "Maintenance", 34, 10, 18, 18, 1.0),
    ("labeller", "Labeller", "लेबलर", "machine", "Packaging", "Maintenance", 56, 10, 18, 18, 1.0),
    ("packing", "Case packer", "केस पैकर", "machine", "Packaging", "Maintenance", 78, 10, 16, 18, 1.5),
    ("forklift_aisle", "Forklift aisle", "फोर्कलिफ्ट गलियारा", "area", "Warehouse", "Warehouse", 8, 38, 50, 14, 1.5),
    ("warehouse", "Warehouse racks", "वेयरहाउस रैक", "area", "Warehouse", "Warehouse", 8, 56, 50, 16, 1.0),
    ("chem_store", "Chemical store", "रसायन भंडार", "area", "Storage", "EHS", 64, 38, 28, 16, 1.5),
    ("lab", "QC laboratory", "क्यूसी प्रयोगशाला", "lab", "Laboratory", "Laboratory", 64, 58, 28, 14, 1.0),
    ("dock", "Loading dock", "लोडिंग डॉक", "area", "Logistics", "Logistics", 8, 76, 40, 14, 1.0),
    ("waste_yard", "Waste yard", "कचरा यार्ड", "area", "Outdoor", "Waste Management", 54, 76, 38, 14, 1.0),
]
CAMERAS = [
    # id, name, kind, x, y, zone, detectors, asset
    ("cam-line3", "Line 3 camera", "camera", 20, 8, "Filling", ["hand_in_zone", "machinery_proximity", "fire", "fall", "ppe"], "filler"),
    ("cam-aisle", "Forklift aisle camera", "camera", 30, 36, "Warehouse", ["forklift_person", "storage_instability", "fall", "fire", "blocked_aisle"], "forklift_aisle"),
    ("cam-store", "Chemical store camera", "camera", 78, 36, "Storage", ["fire", "spill"], "chem_store"),
    ("cam-yard", "Waste yard camera", "camera", 72, 74, "Outdoor", ["waste", "fire", "violence"], "waste_yard"),
    ("cam-dock", "Loading dock camera", "camera", 28, 74, "Logistics", ["package_damage", "forklift_person", "fire"], "dock"),
    ("mic-hall", "Hall microphone (simulated)", "microphone", 50, 30, "Warehouse", ["audio"], None),
]
RESPONDERS = [
    ("Asha (Maintenance)", "Maintenance"), ("Ravi (Maintenance)", "Maintenance"), ("Meera (EHS)", "EHS"), ("Imran (EHS)", "EHS"),
    ("Kabir (Security)", "Security"), ("Neha (QA)", "Quality Assurance"), ("Dr. Rao (Lab)", "Laboratory"),
    ("Vikram (Warehouse)", "Warehouse"), ("Sana (Logistics)", "Logistics"), ("Omar (Waste)", "Waste Management"),
]
SAMPLES = [
    ("machinery_accident", "Hand almost caught while clearing a jam on the filler, machine was still running", "filler", True),
    ("chemical_spill", "Drum leaking at the chemical store, small puddle near the door", "chem_store", False),
    ("worker_safety", "Slipped on a wet floor near the capper, no injury", "capper", False),
    ("warehouse_accident", "Forklift almost hit a pedestrian at the aisle crossing", "forklift_aisle", True),
    ("storage_handling", "Pallet stacked too high, leaning", "warehouse", False),
    ("waste_disposal", "Oily rags left next to the general bin", "waste_yard", False),
    ("production_quality", "Labels misaligned on the last 200 units", "labeller", False),
    ("lab_contamination", "Sample tray found uncovered on the bench", "lab", False),
    ("logistics", "Truck loaded to the wrong dock door", "dock", False),
    ("fire_explosion", "Smell of burning near the packer motor, sparks seen", "packing", True),
]


def seed_basics() -> None:
    from .services import departments

    departments.seed()
    """Idempotent: staff logins, machines, cameras, responders. No incidents."""
    pw = os.getenv("DEMO_PASSWORD", "demo1234")
    for u, role, dept, name in [
        ("admin", "admin", None, "Plant admin"), ("manager.ehs", "manager", "EHS", "EHS manager"),
        ("responder.maint", "responder", "Maintenance", "Maintenance responder"), ("worker", "worker", None, "Demo worker"),
    ]:
        if not db.one("SELECT 1 FROM users WHERE username=?", (u,)):
            db.run("INSERT INTO users(username,pw_hash,role,department,display_name) VALUES(?,?,?,?,?)", (u, hash_pw(pw), role, dept, name))
    for a in ASSETS:
        if not db.one("SELECT 1 FROM assets WHERE id=?", (a[0],)):
            db.run(
                "INSERT INTO assets(id,name,name_hi,kind,zone,department,x,y,w,h,risk_weight,qr_token,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (*a, new_qr_token(), now_iso()),
            )
    for c in CAMERAS:
        have = db.one("SELECT detectors_json FROM cameras WHERE id=?", (c[0],))
        if have:  # add newly supported detectors to cameras seeded earlier; never remove what an admin chose
            merged = list(dict.fromkeys([*db.jload(have["detectors_json"], []), *c[6]]))
            db.run("UPDATE cameras SET detectors_json=? WHERE id=?", (db.jdump(merged), c[0]))
        if not have:
            sim = 1 if c[2] == "microphone" else 0
            db.run("INSERT INTO cameras(id,name,kind,x,y,zone,detectors_json,asset_id,simulated) VALUES(?,?,?,?,?,?,?,?,?)",
                   (c[0], c[1], c[2], c[3], c[4], c[5], db.jdump(c[6]), c[7], sim))
    if not db.one("SELECT 1 FROM responders LIMIT 1"):
        chat = os.getenv("TELEGRAM_CHAT_ID", "")  # the demo chat receives every responder's alerts when set
        for name, dept in RESPONDERS:
            db.run("INSERT INTO responders(name,department,role,telegram_chat_id,available) VALUES(?,?,?,?,1)", (name, dept, "responder", chat or None))
        db.run("INSERT INTO responders(name,department,role,telegram_chat_id,available) VALUES(?,?,?,?,1)", ("Plant manager", "EHS", "manager", chat or None))


def seed_samples(n: int = 40) -> int:
    """Synthetic history (flagged simulated=1) so analytics have something to show."""
    rnd = random.Random(7)
    made = 0
    for _ in range(n):
        cat, text, aid, harm = rnd.choice(SAMPLES)
        inc = svc.create_incident(
            category=cat, description=text, source=rnd.choice(["qr", "portal", "qr"]), asset_id=aid, serious_harm=harm,
            simulated=True, notify_now=False,
        )
        ts = (datetime.now(UTC) - timedelta(days=rnd.randint(0, 28), hours=rnd.randint(0, 20))).isoformat(timespec="seconds")
        status = rnd.choice(["resolved", "closed", "resolved", "in_progress", "acknowledged", "alerted"])
        ack = (datetime.fromisoformat(ts) + timedelta(minutes=rnd.randint(2, 40))).isoformat(timespec="seconds")
        res = (datetime.fromisoformat(ack) + timedelta(hours=rnd.randint(1, 48))).isoformat(timespec="seconds")
        fix = "Added a guard and re-briefed the shift" if status in ("resolved", "closed") and rnd.random() < 0.6 else ""
        db.run(
            "UPDATE incidents SET created_at=?, updated_at=?, status=?, acknowledged_at=?, resolved_at=?, public_update=? WHERE id=?",
            (ts, ts, status, ack if status not in ("alerted",) else None, res if status in ("resolved", "closed") else None, fix, inc["id"]),
        )
        made += 1
    return made


if __name__ == "__main__":
    db.init_db()
    seed_basics()
    print("basics ok; sample incidents:", seed_samples() if not db.one("SELECT 1 FROM incidents LIMIT 1") else "skipped (already has incidents)")
