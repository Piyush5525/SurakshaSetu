"""WebSocket fan-out so the admin dashboard updates without a refresh."""

import asyncio
import json
from typing import Any

from fastapi import WebSocket

_clients: set[WebSocket] = set()
_loop: asyncio.AbstractEventLoop | None = None


def bind_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


async def connect(ws: WebSocket) -> None:
    await ws.accept()
    _clients.add(ws)


def disconnect(ws: WebSocket) -> None:
    _clients.discard(ws)


async def _send_all(msg: str) -> None:
    for ws in list(_clients):
        try:
            await ws.send_text(msg)
        except Exception:
            _clients.discard(ws)


def publish(kind: str, payload: dict[str, Any]) -> None:
    """Thread-safe: callable from request handlers, workers and the escalation thread."""
    if not _clients or _loop is None:
        return
    msg = json.dumps({"type": kind, **payload}, ensure_ascii=False, default=str)
    asyncio.run_coroutine_threadsafe(_send_all(msg), _loop)
