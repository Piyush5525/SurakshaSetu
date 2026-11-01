"""Settings from environment variables (.env at the repo root is loaded if present).

Secrets are never hard-coded. Everything that can reach the outside world (Telegram, voice calls) is OFF
unless explicitly enabled, and DEMO_MODE (default true) simulates notifications instead of sending them.
"""

import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


def _bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    return default if v is None else v.strip().lower() in {"1", "true", "yes", "on"}


def _csv(name: str) -> list[str]:
    return [x.strip() for x in os.getenv(name, "").split(",") if x.strip()]


class Settings:
    DATA_DIR = Path(os.getenv("DATA_DIR", ROOT / "backend" / "data"))
    DB_PATH = Path(os.getenv("INCIDENT_DB", DATA_DIR / "incidents.db"))
    EVIDENCE_DIR = DATA_DIR / "evidence"
    # Random per start unless JWT_SECRET is set (tokens then expire on restart).
    SECRET = os.getenv("JWT_SECRET") or secrets.token_hex(32)
    TOKEN_HOURS = int(os.getenv("TOKEN_HOURS", "12"))
    WORKER_KEY = os.getenv("CV_WORKER_KEY", "dev-worker-key")  # CV/audio workers post detections with this
    CORS_REGEX = os.getenv(
        "CORS_REGEX",
        r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?",
    )
    SITE_EMERGENCY_CONTACT = os.getenv("SITE_EMERGENCY_CONTACT", "")  # shown on the worker help page; a call link only if set
    ASSEMBLY_POINT = os.getenv("ASSEMBLY_POINT", "")
    PUBLIC_URL = os.getenv("PUBLIC_URL", "http://localhost:5173")  # admin dashboard links in alerts
    QR_BASE_URL = os.getenv("QR_BASE_URL", "http://localhost:5174")  # what a QR sticker opens (the sticker app)
    # Notifications
    DEMO_MODE = _bool("DEMO_MODE", True)  # True: Telegram/calls are simulated (logged, not sent)
    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")  # default recipient chat
    OMNIDIM_API_KEY = os.getenv("OMNIDIM_API_KEY", "")
    OMNIDIM_AGENT_ID = os.getenv("OMNIDIM_AGENT_ID", "")
    OMNIDIM_FROM_NUMBER_ID = os.getenv("OMNIDIM_FROM_NUMBER_ID", "")
    OMNIDIM_URL = os.getenv("OMNIDIM_DISPATCH_URL", "https://omnidim.io/api/v1/calls/dispatch")
    # On-call duty number (company phone). Never an emergency-service number.
    ALERT_PHONE_NUMBER = os.getenv("ALERT_PHONE_NUMBER", "")
    CALLS_ENABLED = _bool("CALLS_ENABLED", False)
    CALL_ALLOWLIST = _csv("CALL_ALLOWLIST")  # extra numbers that may be called when DEMO_MODE is false
    ESCALATE_AFTER_S = int(os.getenv("ESCALATE_AFTER_S", "120"))
    ESCALATION_ENABLED = _bool("ESCALATION_ENABLED", True)
    # Uploads
    MAX_IMAGE_MB = 10
    MAX_VIDEO_MB = 60
    MAX_AUDIO_MB = 10
    EVIDENCE_RETENTION_DAYS = int(os.getenv("EVIDENCE_RETENTION_DAYS", "30"))
    RATE_LIMIT_PER_MIN = int(os.getenv("RATE_LIMIT_PER_MIN", "20"))
    DETECTION_COOLDOWN_S = int(os.getenv("DETECTION_COOLDOWN_S", "90"))


settings = Settings()
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
settings.EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
