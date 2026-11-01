from __future__ import annotations

from pathlib import Path

import yaml

from .rules import Zone

VALID_TYPES = {"forklift_lane", "machine_danger", "ppe_required"}


def load_zones(path: str | Path) -> list[Zone]:
    """zones.yaml: a list of {id, type, location_id, polygon: [[x, y], ...]} in video pixel coordinates."""
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    zones: list[Zone] = []
    for z in data.get("zones", []):
        if z["type"] not in VALID_TYPES:
            raise ValueError(
                f"zone {z.get('id')}: unknown type {z['type']!r}; expected {sorted(VALID_TYPES)}"
            )
        poly = [(float(x), float(y)) for x, y in z["polygon"]]
        if len(poly) < 3:
            raise ValueError(f"zone {z['id']}: polygon needs 3+ points")
        zones.append(
            Zone(id=z["id"], type=z["type"], polygon=poly, location_id=z.get("location_id", "unknown"))
        )
    return zones
