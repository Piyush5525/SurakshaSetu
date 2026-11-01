from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .rules import Zone

VALID_TYPES = {
    "forklift_lane",
    "machine_danger",
    "ppe_required",
    "no_waste",
    "waste_bin",
    "storage",
    "spill_watch",
}


@dataclass
class CameraConfig:
    """Everything a camera needs besides its models: zones, optional calibration and per-detector thresholds."""

    zones: list[Zone] = field(default_factory=list)
    px_per_m: float | None = None  # camera calibration: pixels per metre on the floor plane of interest
    forklift: dict[str, float] = field(default_factory=dict)  # caution_m, critical_m, closing_caution_mps
    extra: dict[str, Any] = field(default_factory=dict)


def parse_camera_config(data: dict[str, Any] | None) -> CameraConfig:
    """YAML/JSON shape: {zones: [...], calibration: {px_per_m: 120}, forklift: {caution_m: 3, critical_m: 1.5}}."""
    data = data or {}
    zones: list[Zone] = []
    for z in data.get("zones", []):
        if z["type"] not in VALID_TYPES:
            raise ValueError(f"zone {z.get('id')}: unknown type {z['type']!r}; expected {sorted(VALID_TYPES)}")
        poly = [(float(x), float(y)) for x, y in z["polygon"]]
        if len(poly) < 3:
            raise ValueError(f"zone {z['id']}: polygon needs 3+ points")
        zones.append(
            Zone(
                id=z["id"],
                type=z["type"],
                polygon=poly,
                location_id=z.get("location_id", "unknown"),
                forklift_only=bool(z.get("forklift_only", False)),
                allowed=[str(a) for a in z.get("allowed", [])],
                capacity=int(z["capacity"]) if z.get("capacity") is not None else None,
            )
        )
    cal = data.get("calibration") or {}
    return CameraConfig(
        zones=zones,
        px_per_m=float(cal["px_per_m"]) if cal.get("px_per_m") else None,
        forklift={k: float(v) for k, v in (data.get("forklift") or {}).items()},
    )


def load_camera_config(path: str | Path) -> CameraConfig:
    return parse_camera_config(yaml.safe_load(Path(path).read_text(encoding="utf-8")))


def load_zones(path: str | Path) -> list[Zone]:
    """zones.yaml: a list of {id, type, location_id, polygon: [[x, y], ...]} in video pixel coordinates."""
    return load_camera_config(path).zones
