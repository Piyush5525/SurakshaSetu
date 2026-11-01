"""One SQLite database for every incident source (QR, portal, CCTV, audio, admin).

Plain sqlite3 with WAL and one lock: simple, dependency-free, and easy to move to PostgreSQL later
(all SQL is standard; JSON is stored as TEXT in *_json columns).
"""

import json
import sqlite3
import threading
from contextlib import contextmanager
from typing import Any, Iterator

from .config import settings

_lock = threading.RLock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, pw_hash TEXT NOT NULL,
  role TEXT NOT NULL, department TEXT, display_name TEXT, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_hi TEXT, kind TEXT NOT NULL DEFAULT 'machine',
  site TEXT NOT NULL DEFAULT 'Demo Plant', building TEXT NOT NULL DEFAULT 'Line 3', floor TEXT NOT NULL DEFAULT 'G',
  zone TEXT NOT NULL DEFAULT '', department TEXT NOT NULL DEFAULT 'EHS',
  qr_token TEXT UNIQUE, qr_active INTEGER NOT NULL DEFAULT 1,
  x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0, w REAL NOT NULL DEFAULT 10, h REAL NOT NULL DEFAULT 10,
  risk_weight REAL NOT NULL DEFAULT 1.0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cameras (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'camera', source TEXT NOT NULL DEFAULT '',
  asset_id TEXT, site TEXT NOT NULL DEFAULT 'Demo Plant', building TEXT NOT NULL DEFAULT 'Line 3', floor TEXT NOT NULL DEFAULT 'G',
  zone TEXT NOT NULL DEFAULT '', x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1, detectors_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'offline', last_seen TEXT, fps REAL, simulated INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS detector_settings (
  name TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, min_conf REAL, confirm_n INTEGER, confirm_m INTEGER);
CREATE TABLE IF NOT EXISTS responders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, department TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'responder',
  telegram_chat_id TEXT, phone TEXT, available INTEGER NOT NULL DEFAULT 1, user_id INTEGER);
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY, category TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', source TEXT NOT NULL,
  hazard_type TEXT, asset_id TEXT, camera_id TEXT, audio_id TEXT,
  site TEXT, building TEXT, floor TEXT, zone TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  severity INTEGER NOT NULL DEFAULT 1, severity_reason_json TEXT NOT NULL DEFAULT '[]',
  ai_model TEXT, ai_model_version TEXT, ai_class TEXT, ai_confidence REAL, ai_meta_json TEXT,
  requires_verification INTEGER NOT NULL DEFAULT 0, simulated INTEGER NOT NULL DEFAULT 0,
  department TEXT, assigned_responder_id INTEGER,
  status TEXT NOT NULL, injury_now INTEGER NOT NULL DEFAULT 0, serious_harm INTEGER NOT NULL DEFAULT 0,
  lang TEXT DEFAULT 'en', reporter_name TEXT, tracking_code TEXT, reporter_user_id INTEGER,
  eco_tag TEXT, duplicate_of TEXT,
  investigation_notes TEXT DEFAULT '', root_cause TEXT DEFAULT '', corrective_action TEXT DEFAULT '', preventive_action TEXT DEFAULT '',
  public_update TEXT DEFAULT '', acknowledged_at TEXT, resolved_at TEXT, closed_at TEXT);
CREATE INDEX IF NOT EXISTS ix_inc_status ON incidents(status);
CREATE INDEX IF NOT EXISTS ix_inc_cat ON incidents(category);
CREATE INDEX IF NOT EXISTS ix_inc_created ON incidents(created_at);
CREATE INDEX IF NOT EXISTS ix_inc_asset ON incidents(asset_id);
CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, incident_id TEXT NOT NULL, status TEXT NOT NULL, ts TEXT NOT NULL, actor TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, kind TEXT NOT NULL, path TEXT NOT NULL, mime TEXT, size INTEGER,
  created_at TEXT NOT NULL, retention_until TEXT, note TEXT);
CREATE INDEX IF NOT EXISTS ix_ev_inc ON evidence(incident_id);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, incident_id TEXT NOT NULL, channel TEXT NOT NULL, recipient TEXT,
  status TEXT NOT NULL, detail TEXT, level INTEGER NOT NULL DEFAULT 0, simulated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, acknowledged_at TEXT);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT, action TEXT NOT NULL, target TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS events_raw (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, camera_id TEXT, model TEXT, cls TEXT, confidence REAL, outcome TEXT);
"""


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(str(settings.DB_PATH), timeout=10, check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    return c


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """Serialised connection: every call is short, so one lock keeps writers from colliding."""
    with _lock:
        c = _conn()
        try:
            yield c
            c.commit()
        finally:
            c.close()


def init_db() -> None:
    with connect() as c:
        c.executescript(SCHEMA)


def rows(sql: str, args: tuple | list = ()) -> list[dict[str, Any]]:
    with connect() as c:
        return [dict(r) for r in c.execute(sql, args).fetchall()]


def one(sql: str, args: tuple | list = ()) -> dict[str, Any] | None:
    r = rows(sql, args)
    return r[0] if r else None


def run(sql: str, args: tuple | list = ()) -> int:
    with connect() as c:
        cur = c.execute(sql, args)
        return cur.lastrowid or 0


def jdump(v: Any) -> str:
    return json.dumps(v, ensure_ascii=False)


def jload(s: str | None, default: Any = None) -> Any:
    if not s:
        return default
    try:
        return json.loads(s)
    except ValueError:
        return default
