"""Catalogue of detector plugins. `maturity` is shown in the UI so nobody mistakes a heuristic for a validated model.

trained       : trained on labelled data for exactly this class and checked on our own footage (fire only).
external      : weights trained by a third party on THEIR data; loads and runs, domain transfer to this plant unverified.
rules         : pretrained general detector + explicit geometry rules.
open_vocab    : zero-shot YOLO-World text prompts. No training, no measured accuracy.
heuristic     : pose/CLIP rules from the existing repo; documented there as missing real test clips.
simulated     : produced by the demo trigger, never by a sensor.

`number` (1-9) is the capability number from the project brief; extras have none.
"""

DETECTORS = [
    {
        "name": "fire", "number": 1, "label": "Fire & smoke", "category": "fire_explosion", "maturity": "trained",
        "repo": "vjn6805/Detection-Models", "weights": "fire_smoke.pt (YOLOv8n)", "classes": ["Fire", "Smoke"],
        "model": "YOLOv8n, your trained weights", "licence": "Your weights; runs on Ultralytics (AGPL-3.0)",
        "requires_verification": False, "implemented": True,
        "note": "Seen working on fire.mp4. Confidence there hovers 0.4-0.7, so small fires may be missed or late.",
    },
    {
        "name": "fall", "number": 2, "label": "Person fall", "category": "worker_safety", "maturity": "heuristic",
        "repo": "vjn6805/Detection-Models", "weights": "yolov8n-pose.pt (rules, no training)", "classes": ["fall"],
        "model": "YOLOv8n-pose + posture rules", "licence": "Ultralytics (AGPL-3.0)", "requires_verification": True,
        "implemented": True, "note": "Not a trained model. The source repo has no real fall footage: accuracy unknown.",
    },
    {
        "name": "violence", "number": 3, "label": "Possible altercation", "category": "security", "maturity": "heuristic",
        "repo": "vjn6805/Detection-Models", "weights": "yolov8n-pose + CLIP ViT-B/32 (no training)", "classes": ["possible_altercation"],
        "model": "pose proximity/motion gate + CLIP zero-shot", "licence": "Ultralytics (AGPL-3.0), CLIP (MIT)",
        "requires_verification": True, "implemented": True,
        "note": "Missed the one fight clip available. A potential security event that always needs human verification.",
    },
    {
        "name": "machinery_proximity", "number": 4, "label": "Person in machine danger zone", "category": "machinery_accident",
        "maturity": "rules", "repo": "nisha572/ai-construction-safety-detection (idea only: no weights, no licence)",
        "weights": "yolov8n.pt (COCO persons) + ByteTrack", "classes": ["person"],
        "model": "tracked people + configured danger zone + machine-running state", "licence": "Ultralytics (AGPL-3.0)",
        "requires_verification": True, "implemented": True,
        "note": "No machinery detector: the zone is the machine. Standing near a stopped machine never alerts. Running signal is simulated unless wired.",
    },
    {
        "name": "spill", "number": 5, "label": "Visible leak (gas / liquid)", "category": "chemical_spill", "maturity": "external",
        "repo": "MSunusi/pipeline-leak-detection", "weights": "pipeline leak detection.pt (YOLO11n)",
        "classes": ["crack", "gas", "leak", "no leak", "water"], "model": "YOLO11n trained on oil-and-gas pipeline images (CC BY 4.0 dataset)",
        "licence": "No licence in repo (used with owner's approval); dataset CC BY 4.0", "requires_verification": True, "implemented": True,
        "note": "Pipeline domain, not floor spills. Cannot identify the chemical. 'no leak' and 'crack' never alert. LiquidMonitorAI segmentation was tested and rejected (false 'liquid' on a dry floor).",
    },
    {
        "name": "storage_instability", "number": 6, "label": "Falling / displaced boxes", "category": "storage_handling", "maturity": "external",
        "repo": "reyansh7/InventoryVerification (no weights) -> bbKurt11/SDG_CardboardBox_detect", "weights": "production_v2_HN/yolo1 best.pt (YOLO11n)",
        "classes": ["The_Box"], "model": "box detector (mostly synthetic training data) + ByteTrack + motion rules",
        "licence": "MIT (SDG repo)", "requires_verification": True, "implemented": True,
        "note": "The requested repo has no weights. Detecting a box never proves instability: only a fast drop or a later move from a settled place alerts. No pallet class.",
    },
    {
        "name": "forklift_person", "number": 7, "label": "Forklift-pedestrian proximity", "category": "warehouse_accident", "maturity": "external",
        "repo": "sounak-sarkar-gwc/Forklift-pedestrian-proximity", "weights": "warehouse_yolo11_v2/best.pt (YOLO11n)",
        "classes": ["forklift", "person"], "model": "YOLO11n fine-tuned on a Roboflow warehouse set + ByteTrack",
        "licence": "No licence in repo (used with owner's approval)", "requires_verification": True, "implemented": True,
        "note": "Levels SAFE/CAUTION/CRITICAL from distance and closing speed. Distances are ESTIMATES (forklift ~2 m tall) unless the camera is calibrated.",
    },
    {
        "name": "package_damage", "number": 8, "label": "Damaged packaging", "category": "logistics", "maturity": "external",
        "repo": "AdityaNeutron147/package-defect-detector + bbKurt11/SDG_CardboardBox_detect",
        "weights": "package_defect_v2.pt; SDG yolo1 (box) + yolo2 (defect)", "classes": ["dent", "dirt", "hole", "Stain", "Puncture"],
        "model": "YOLO11n defect detector; optional two-stage SDG", "licence": "package-defect-detector: none (approved); SDG: MIT",
        "requires_verification": True, "implemented": True,
        "note": "Visible carton damage only. Cannot detect wrong quantities or contents (needs barcode/OCR/inventory data). Demo-conveyor and synthetic training data.",
    },
    {
        "name": "waste", "number": 9, "label": "Improper waste disposal", "category": "waste_disposal", "maturity": "external",
        "repo": "siyad23/waste-sorting-model", "weights": "weights/best.pt (YOLO11n, 19 classes)",
        "classes": ["biodegradable (10)", "plastic (4)", "metal (4)", "hazardous (1: battery)"],
        "model": "YOLO11n waste classifier + configured bin zones with allowed groups", "licence": "AGPL-3.0 (cite the paper)",
        "requires_verification": True, "implemented": True,
        "note": "Classification alone never alerts: an item must be in a bin that does not accept it, in a no-waste zone, or over a bin's capacity.",
    },
    {
        "name": "hand_in_zone", "number": None, "label": "Hand in machine danger zone", "category": "machinery_accident", "maturity": "rules",
        "repo": "this project", "weights": "yolov8n-pose.pt wrist keypoints", "classes": ["wrist"],
        "model": "YOLOv8n-pose wrist + zone polygon", "licence": "Ultralytics (AGPL-3.0)", "requires_verification": True,
        "implemented": True, "note": "Needs the machine-running signal (simulated unless wired to a real one).",
    },
    {
        "name": "ppe", "number": None, "label": "Missing hard hat", "category": "worker_safety", "maturity": "open_vocab",
        "repo": "this project", "weights": "yolov8s-worldv2.pt (zero-shot)", "classes": ["person", "hard hat", "safety vest"],
        "model": "YOLO-World zero-shot", "licence": "Ultralytics (AGPL-3.0)", "requires_verification": True, "implemented": True,
        "note": "Zero-shot; only judged inside a ppe_required zone. Expect misses and false alarms.",
    },
    {
        "name": "blocked_aisle", "number": None, "label": "Items blocking an aisle", "category": "storage_handling", "maturity": "open_vocab",
        "repo": "this project", "weights": "yolov8s-worldv2.pt (zero-shot)", "classes": ["fallen box", "pallet"],
        "model": "YOLO-World zero-shot", "licence": "Ultralytics (AGPL-3.0)", "requires_verification": True, "implemented": True,
        "note": "Only alerts for items inside a configured forklift_lane zone.",
    },
    {
        "name": "audio", "number": None, "label": "Audio events (alarm, scream, glass, impact)", "category": "security", "maturity": "simulated",
        "repo": "none", "weights": "none", "classes": [], "model": "pluggable audio detector interface", "licence": "n/a",
        "requires_verification": True, "implemented": False,
        "note": "No real audio model is wired yet. Events can be simulated and are labelled SIMULATED.",
    },
]
BY_NAME = {d["name"]: d for d in DETECTORS}
ZONE_TYPES = ["forklift_lane", "machine_danger", "ppe_required", "no_waste", "waste_bin", "storage", "spill_watch"]
