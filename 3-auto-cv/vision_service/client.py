"""Talks to the central FastAPI backend. The worker never touches the database directly."""

from __future__ import annotations

import json
import threading
import time
from typing import Any

import requests


class BackendClient:
    def __init__(self, api: str, key: str) -> None:
        self.api = api.rstrip("/").replace("//localhost", "//127.0.0.1")  # avoid slow IPv6-first lookups on Windows
        self.h = {"X-Worker-Key": key}
        self.s = requests.Session()
        self._locks: dict[str, threading.Lock] = {}  # one in-flight call per camera and purpose

    def _bg(self, key: str, fn) -> None:
        """Fire-and-forget so a slow network never stalls frame processing. At most one call per `key`
        (camera + purpose) is in flight, so frequent previews can never starve a heartbeat."""
        lock = self._locks.setdefault(key, threading.Lock())
        if not lock.acquire(blocking=False):
            return

        def run() -> None:
            try:
                fn()
            except requests.RequestException:
                pass
            finally:
                lock.release()

        threading.Thread(target=run, daemon=True).start()

    def config(self) -> dict[str, Any]:
        r = self.s.get(f"{self.api}/worker/config", headers=self.h, timeout=10)
        r.raise_for_status()
        return r.json()

    def heartbeat(self, camera_id: str, status: str, fps: float | None, mode: str = "live") -> None:
        def go() -> None:
            self.s.post(
                f"{self.api}/worker/heartbeat",
                json={"camera_id": camera_id, "status": status, "fps": fps, "mode": mode},
                headers=self.h,
                timeout=5,
            )

        if status in ("stopped", "error"):
            go()  # final states are sent synchronously
        else:
            self._bg(f"hb:{camera_id}", go)

    def detector_status(self, camera_id: str, statuses: dict[str, str]) -> None:
        try:
            self.s.post(f"{self.api}/worker/detector-status", json={"camera_id": camera_id, "statuses": statuses}, headers=self.h, timeout=5)
        except requests.RequestException:
            pass

    def preview(self, camera_id: str, jpeg: bytes) -> None:
        def go() -> None:
            self.s.post(
                f"{self.api}/worker/frame/{camera_id}",
                data=jpeg,
                headers={**self.h, "Content-Type": "image/jpeg"},
                timeout=5,
            )

        self._bg(f"pv:{camera_id}", go)

    def detection(
        self,
        *,
        camera_id: str,
        detector: str,
        model: str,
        version: str,
        cls: str,
        confidence: float,
        description: str,
        meta: dict[str, Any],
        frame_jpeg: bytes | None,
        clip: bytes | None,
        simulated: bool = False,
    ) -> dict[str, Any]:
        files: dict[str, tuple[str, bytes, str]] = {}
        if frame_jpeg:
            files["frame"] = ("best_frame.jpg", frame_jpeg, "image/jpeg")
        if clip:
            files["clip"] = ("clip.webm", clip, "video/webm")
        data = {
            "camera_id": camera_id,
            "detector": detector,
            "model": model,
            "version": version,
            "cls": cls,
            "confidence": f"{confidence:.4f}",
            "description": description,
            "meta": json.dumps(meta),
            "simulated": "true" if simulated else "false",
        }
        for attempt in range(3):
            try:
                r = self.s.post(f"{self.api}/worker/detections", data=data, files=files or None, headers=self.h, timeout=60)
                r.raise_for_status()
                return r.json()
            except requests.RequestException as e:
                if attempt == 2:
                    return {"status": "failed", "error": type(e).__name__}
                time.sleep(2)
        return {"status": "failed"}
