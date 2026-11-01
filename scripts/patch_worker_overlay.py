"""Worker: preview overlays (zones, potential/confirmed detections), feed mode in heartbeats."""

import pathlib

R = pathlib.Path(__file__).resolve().parents[1]
W = R / "3-auto-cv" / "vision_service"


def sub(path: pathlib.Path, old: str, new: str) -> None:
    s = path.read_text(encoding="utf-8")
    assert old in s, (path.name, old[:60])
    path.write_text(s.replace(old, new, 1), encoding="utf-8", newline="\n")


w = W / "worker.py"
sub(w, "PREVIEW_EVERY_S = 1.0", "PREVIEW_EVERY_S = 0.12  # about 8 preview frames per second\nMARK_S = 2.5  # how long a detection box stays on the preview\nAMBER, RED, GREY = (0, 170, 255), (46, 16, 200), (150, 150, 150)  # BGR\n\nLABEL = {\n    'fire': 'FIRE', 'fall': 'PERSON FALL', 'violence': 'POSSIBLE VIOLENCE', 'machinery_proximity': 'MACHINERY DANGER ZONE',\n    'hand_in_zone': 'HAND IN DANGER ZONE', 'spill': 'LEAK', 'storage_instability': 'UNSTABLE STORAGE',\n    'forklift_person': 'FORKLIFT PROXIMITY', 'package_damage': 'PACKAGE DAMAGE', 'waste': 'WASTE DISPOSAL', 'ppe': 'MISSING PPE',\n    'blocked_aisle': 'BLOCKED AISLE',\n}")
sub(w, "        self.pending: list[dict[str, Any]] = []\n", "        self.pending: list[dict[str, Any]] = []\n        self.marks: list[dict[str, Any]] = []  # boxes drawn on the preview: potential (amber) then confirmed (red)\n")
sub(
    w,
    "    def _finish(self, ev: dict[str, Any], t_now: float) -> None:",
    '''    def _mark(self, c: P.Candidate, confirmed: bool, k: float) -> None:
        label = f"{'CONFIRMED' if confirmed else 'POTENTIAL'} {LABEL.get(c.detector, c.detector.upper())} {round(c.confidence * 100)}%"
        self.marks = [m for m in self.marks if not (m["det"] == c.detector and m["cls"] == c.cls and not confirmed)]
        self.marks.append({"det": c.detector, "cls": c.cls, "until": time.monotonic() + MARK_S, "label": label,
                           "color": RED if confirmed else AMBER, "boxes": [tuple(v * k for v in b) for b in c.boxes]})

    def _draw(self, img: Any) -> Any:
        """Zones (thin grey) and detections (amber potential, red confirmed) drawn on the pixelated preview."""
        out = img.copy()
        kz = out.shape[1] / self._frame_w
        for z in self.zones:
            pts = np.array([(int(x * kz), int(y * kz)) for x, y in z.polygon], dtype=np.int32)
            cv2.polylines(out, [pts], True, GREY, 1, cv2.LINE_AA)
            cv2.putText(out, z.type, (int(pts[0][0]) + 3, int(pts[0][1]) + 12), cv2.FONT_HERSHEY_SIMPLEX, 0.38, GREY, 1, cv2.LINE_AA)
        now = time.monotonic()
        self.marks = [m for m in self.marks if m["until"] > now]
        row = 0
        for m in self.marks:
            for b in m["boxes"]:
                cv2.rectangle(out, (int(b[0]), int(b[1])), (int(b[2]), int(b[3])), m["color"], 2)
            (tw, th), _ = cv2.getTextSize(m["label"], cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            y = 8 + row * (th + 10)
            cv2.rectangle(out, (6, y), (6 + tw + 10, y + th + 8), m["color"], -1)
            cv2.putText(out, m["label"], (11, y + th + 2), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
            row += 1
        return out

    def _finish(self, ev: dict[str, Any], t_now: float) -> None:''',
)
sub(w, "            ctx = P.FrameCtx(", "            self._frame_w = frame.shape[1]\n            ctx = P.FrameCtx(")
sub(
    w,
    "                for c in cands:\n                    min_conf = cfg.get(\"min_conf\")\n                    if min_conf and c.confidence < min_conf:\n                        continue\n",
    "                for c in cands:\n                    min_conf = cfg.get(\"min_conf\")\n                    if min_conf and c.confidence < min_conf:\n                        continue\n                    self._mark(c, False, k)\n",
)
sub(w, "                        self.cool[key] = t\n", "                        self.cool[key] = t\n                        self._mark(c, True, k)\n")
sub(
    w,
    "                shown = small if self.args.clear_preview else pixelate(small, [tuple(v * k for v in b) for b in pboxes])  # type: ignore[misc]\n",
    "                shown = small if self.args.clear_preview else pixelate(small, [tuple(v * k for v in b) for b in pboxes])  # type: ignore[misc]\n                shown = self._draw(shown)\n",
)
sub(w, 'self.client.heartbeat(self.cam["id"], "running", n_proc / max(0.1, now - t0_proc))', 'self.client.heartbeat(self.cam["id"], "running", n_proc / max(0.1, now - t0_proc), "file" if is_file else "live")')
sub(w, "        self.posted = 0\n", "        self.posted = 0\n        self._frame_w = 640\n")

c = W / "client.py"
sub(c, "    def heartbeat(self, camera_id: str, status: str, fps: float | None) -> None:", "    def heartbeat(self, camera_id: str, status: str, fps: float | None, mode: str = \"live\") -> None:")
sub(c, '                json={"camera_id": camera_id, "status": status, "fps": fps},', '                json={"camera_id": camera_id, "status": status, "fps": fps, "mode": mode},')

b = R / "backend" / "app"
sub(b / "db.py", "        _add_column(c, 'events_raw', 'detector', 'TEXT')\n", "        _add_column(c, 'events_raw', 'detector', 'TEXT')\n        _add_column(c, 'cameras', 'feed_mode', \"TEXT NOT NULL DEFAULT 'live'\")\n")
sub(b / "routers" / "vision.py", 'def heartbeat(camera_id: str = Body(...), status: str = Body("running"), fps: float | None = Body(None)) -> dict:\n    db.run("UPDATE cameras SET status=?, last_seen=?, fps=? WHERE id=?", (status, now_iso(), fps, camera_id))',
    'def heartbeat(camera_id: str = Body(...), status: str = Body("running"), fps: float | None = Body(None), mode: str = Body("live")) -> dict:\n    db.run("UPDATE cameras SET status=?, last_seen=?, fps=?, feed_mode=? WHERE id=?", (status, now_iso(), fps, mode if mode in ("live", "file") else "live", camera_id))')
sub(b / "routers" / "vision.py", "sign_evidence('cam:' + c['id'], 300)", "sign_evidence('cam:' + c['id'], 3600)")
sub(b / "routers" / "vision.py", "sign_evidence('cam:' + c['id'], 1800)", "sign_evidence('cam:' + c['id'], 3600)")
sub(b / "routers" / "staff.py", '        "responder": db.one("SELECT id,name,department FROM responders WHERE id=?", (r["assigned_responder_id"],)) if r["assigned_responder_id"] else None,\n', '        "responder": db.one("SELECT id,name,department FROM responders WHERE id=?", (r["assigned_responder_id"],)) if r["assigned_responder_id"] else None,\n        "reporter_name": r.get("reporter_name"),\n')
print("patched")
