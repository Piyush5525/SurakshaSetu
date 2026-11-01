"""Central incident backend: one FastAPI app for the QR sticker app, the worker portal, the admin portal and the CV/audio workers."""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from . import db, workers
from .config import settings
from .routers import auth_assets, public, staff, vision
from .security import decode_token
from .services import realtime


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    realtime.bind_loop(asyncio.get_running_loop())
    if not db.one("SELECT 1 FROM users LIMIT 1"):
        from .seed import seed_basics

        seed_basics()
    workers.start()
    yield
    workers.stop()


app = FastAPI(title="Safer Work incident backend", version="1.0", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(
    CORSMiddleware, allow_origin_regex=settings.CORS_REGEX, allow_credentials=False, allow_methods=["*"], allow_headers=["*"]
)
for r in (auth_assets.router, public.router, staff.router, vision.router):
    app.include_router(r, prefix="/api")


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "demo_mode": settings.DEMO_MODE}


@app.websocket("/api/ws")
async def ws(websocket: WebSocket, token: str = "") -> None:
    try:
        user = decode_token(token)
    except Exception:
        await websocket.close(code=4401)
        return
    if user.get("role") not in ("responder", "manager", "admin"):
        await websocket.close(code=4403)
        return
    await realtime.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep-alive pings from the client
    except WebSocketDisconnect:
        realtime.disconnect(websocket)
