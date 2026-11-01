"""Machine "running" signal. SIMULATED in the demo: there is no real stack-light or PLC connection.

Modes:
  on / off          fixed value
  schedule          "on:0-30,off:30-60" repeating cycle in seconds of video/clock time
  http              a tiny local endpoint so you can flip it live during a demo:
                      GET  http://127.0.0.1:8765/state          -> {"running": true}
                      POST http://127.0.0.1:8765/state          body {"running": false}
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer


class MachineState:
    simulated = True

    def __init__(self, mode: str = "on", port: int = 8765) -> None:
        self.mode = mode
        self._running = mode != "off"
        self._schedule: list[tuple[bool, float, float]] = []
        self._cycle = 0.0
        if mode.startswith("schedule:"):
            for part in mode[len("schedule:") :].split(","):
                state, span = part.split(":")
                a, b = span.split("-")
                self._schedule.append((state == "on", float(a), float(b)))
            self._cycle = max(b for _, _, b in self._schedule)
        self._server: HTTPServer | None = None
        if mode == "http":
            self._start_server(port)

    def running(self, t: float) -> bool:
        if self._schedule:
            tt = t % self._cycle
            for on, a, b in self._schedule:
                if a <= tt < b:
                    return on
            return False
        return self._running

    def set_running(self, value: bool) -> None:
        self._running = value

    def _start_server(self, port: int) -> None:
        state = self

        class H(BaseHTTPRequestHandler):
            def _send(self) -> None:
                body = json.dumps({"running": state._running, "simulated": True}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self) -> None:  # noqa: N802
                self._send()

            def do_POST(self) -> None:  # noqa: N802
                n = int(self.headers.get("Content-Length", 0))
                try:
                    state.set_running(bool(json.loads(self.rfile.read(n) or b"{}").get("running")))
                except (ValueError, AttributeError):
                    pass
                self._send()

            def log_message(self, *args: object) -> None:
                pass

        self._server = HTTPServer(("127.0.0.1", port), H)
        threading.Thread(target=self._server.serve_forever, daemon=True).start()
