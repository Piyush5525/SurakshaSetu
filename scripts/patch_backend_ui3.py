"""Backend patch 3: evidence thumbnails in incident lists, department/zone performance, investigation completion."""

import pathlib

B = pathlib.Path(__file__).resolve().parents[1] / "backend" / "app"


def sub(path: str, old: str, new: str) -> None:
    p = B / path
    s = p.read_text(encoding="utf-8")
    assert old in s, (path, old[:70])
    p.write_text(s.replace(old, new, 1), encoding="utf-8", newline="\n")


sub(
    "routers/staff.py",
    '    return {"total": total, "items": [svc.public_row(r) for r in rowsx]}',
    '''    items = [svc.public_row(r) for r in rowsx]
    for it in items:  # first image as a thumbnail (signed, short-lived), so the AI feed can show real evidence frames
        ev = db.one("SELECT id FROM evidence WHERE incident_id=? AND kind='image' ORDER BY created_at LIMIT 1", (it["id"],))
        it["thumb_url"] = f"/api/evidence/{ev['id']}?{sign_evidence(ev['id'])}" if ev else None
    return {"total": total, "items": items}''',
)
sub(
    "routers/staff.py",
    '        "by_category": grp("category"),\n        "by_department": grp("department"),\n        "by_severity": grp("severity"),',
    '''        "dept_perf": _perf(rows_all, "department"),
        "zone_perf": _perf(rows_all, "zone"),
        "investigation": {
            "resolved": len(resolved),
            "with_root_cause": sum(1 for r in resolved if (r["root_cause"] or "").strip()),
            "with_corrective": sum(1 for r in resolved if (r["corrective_action"] or "").strip()),
            "with_preventive": sum(1 for r in resolved if (r["preventive_action"] or "").strip()),
            "open_without_root_cause": sum(1 for r in rows_all if r["status"] in ("in_progress", "assigned", "acknowledged") and not (r["root_cause"] or "").strip()),
            "root_causes": db.rows(
                f"SELECT category AS key, COUNT(*) AS n FROM incidents WHERE {base} AND TRIM(COALESCE(root_cause,''))!='' GROUP BY category ORDER BY n DESC", a
            ),
        },
        "by_category": grp("category"),
        "by_department": grp("department"),
        "by_severity": grp("severity"),''',
)
sub(
    "routers/staff.py",
    '@router.get("/analytics")',
    '''def _perf(rows_: list[dict], col: str) -> list[dict]:
    """Per group: incidents, resolved share, mean minutes to acknowledge and to resolve."""
    groups: dict[str, list[dict]] = {}
    for r in rows_:
        groups.setdefault(r[col] or "unassigned", []).append(r)
    out = []
    for k, rs in groups.items():
        ack = [m for r in rs if (m := _mins(r["created_at"], r["acknowledged_at"])) is not None]
        res = [m for r in rs if (m := _mins(r["created_at"], r["resolved_at"])) is not None]
        out.append({
            "key": k,
            "total": len(rs),
            "resolved": sum(1 for r in rs if r["status"] in ("resolved", "closed")),
            "avg_ack_min": round(sum(ack) / len(ack), 1) if ack else None,
            "avg_resolve_min": round(sum(res) / len(res), 1) if res else None,
        })
    return sorted(out, key=lambda x: -x["total"])


@router.get("/analytics")''',
)
print("patched")
