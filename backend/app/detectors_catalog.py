"""Catalogue of detector plugins. `maturity` is shown in the UI so nobody mistakes a heuristic for a trained model.

trained       : a model trained on labelled data for exactly this class (the team's own fire/smoke weights).
rules         : pretrained general detector (COCO YOLOv8) + explicit geometry rules. Precise, but narrow.
open_vocab    : zero-shot YOLO-World text prompts. No training, no measured accuracy: experimental.
heuristic     : pose/CLIP rules from the existing repo; documented there as missing real test clips.
simulated     : produced by the demo trigger, never by a sensor.
"""

DETECTORS = [
    {
        "name": "fire", "label": "Fire & smoke", "category": "fire_explosion", "maturity": "trained",
        "model": "best_nano_111.pt (YOLOv8n, classes: Fire, Smoke)", "licence": "Your weights; runs on Ultralytics (AGPL-3.0)",
        "requires_verification": False, "implemented": True,
        "note": "Confirmed over several frames. Smoke needs a higher confidence than flame.",
    },
    {
        "name": "fall", "label": "Person fall", "category": "worker_safety", "maturity": "heuristic",
        "model": "YOLOv8n-pose + posture rules", "licence": "Ultralytics (AGPL-3.0)", "requires_verification": True,
        "implemented": True, "note": "Rules only; the source repo has no real fall footage, so accuracy is unmeasured.",
    },
    {
        "name": "violence", "label": "Possible altercation", "category": "security", "maturity": "heuristic",
        "model": "pose proximity + motion gate (CLIP gate pending)", "licence": "Ultralytics (AGPL-3.0)",
        "requires_verification": True, "implemented": True,
        "note": "Experimental: a potential security event that always needs human verification. Not a machinery-accident detector.",
    },
    {
        "name": "forklift_person", "label": "Forklift-pedestrian near miss", "category": "warehouse_accident", "maturity": "rules",
        "model": "YOLOv8n (COCO truck/bus stand-in) + edge-gap rule", "licence": "Ultralytics (AGPL-3.0)",
        "requires_verification": True, "implemented": True, "note": "COCO has no forklift class; truck is a weak stand-in.",
    },
    {
        "name": "hand_in_zone", "label": "Hand in machine danger zone", "category": "machinery_accident", "maturity": "rules",
        "model": "YOLOv8n-pose wrist + zone polygon", "licence": "Ultralytics (AGPL-3.0)", "requires_verification": True,
        "implemented": True, "note": "Needs the machine-running signal (simulated unless wired to a real signal).",
    },
    {
        "name": "ppe", "label": "Missing hard hat / vest", "category": "worker_safety", "maturity": "open_vocab",
        "model": "YOLO-World zero-shot (hard hat, safety vest) + person", "licence": "Ultralytics (AGPL-3.0)",
        "requires_verification": True, "implemented": True, "note": "Zero-shot; expect misses and false alarms. Review mode only.",
    },
    {
        "name": "spill", "label": "Liquid spill on floor", "category": "chemical_spill", "maturity": "open_vocab",
        "model": "YOLO-World zero-shot ('liquid spill')", "licence": "Ultralytics (AGPL-3.0)", "requires_verification": True,
        "implemented": True, "note": "Cannot identify the chemical. A human or sensor must establish what it is.",
    },
    {
        "name": "blocked_aisle", "label": "Fallen / blocking items", "category": "storage_handling", "maturity": "open_vocab",
        "model": "YOLO-World zero-shot ('fallen box', 'pallet')", "licence": "Ultralytics (AGPL-3.0)",
        "requires_verification": True, "implemented": True, "note": "Only alerts for items inside a configured aisle zone.",
    },
    {
        "name": "waste", "label": "Waste left out of bin", "category": "waste_disposal", "maturity": "open_vocab",
        "model": "YOLO-World zero-shot ('garbage bag', 'trash')", "licence": "Ultralytics (AGPL-3.0)",
        "requires_verification": True, "implemented": True, "note": "Experimental; needs a zone where waste should not be.",
    },
    {
        "name": "audio", "label": "Audio events (alarm, scream, glass, impact)", "category": "security", "maturity": "simulated",
        "model": "pluggable audio detector interface", "licence": "n/a", "requires_verification": True, "implemented": False,
        "note": "No real audio model is wired yet. Events can be simulated and are labelled SIMULATED.",
    },
]
BY_NAME = {d["name"]: d for d in DETECTORS}
