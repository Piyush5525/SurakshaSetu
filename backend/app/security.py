"""Passwords, JWT roles, signed evidence URLs, rate limiting, upload validation."""

import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque

import jwt
from fastapi import Depends, Header, HTTPException, Request

from .config import settings

ROLES = ("worker", "responder", "manager", "admin")
RANK = {"worker": 0, "responder": 1, "manager": 2, "admin": 3}


def hash_pw(pw: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(8)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 120_000).hex()
    return f"{salt}${h}"


def check_pw(pw: str, stored: str) -> bool:
    salt, _ = stored.split("$", 1)
    return hmac.compare_digest(hash_pw(pw, salt), stored)


def make_token(user: dict) -> str:
    exp = int(time.time()) + settings.TOKEN_HOURS * 3600
    return jwt.encode(
        {"sub": str(user["id"]), "u": user["username"], "role": user["role"], "dept": user.get("department"), "exp": exp},
        settings.SECRET,
        algorithm="HS256",
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET, algorithms=["HS256"])
    except jwt.PyJWTError as e:
        raise HTTPException(401, "Invalid or expired token") from e


def current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Sign in required")
    return decode_token(authorization.split(" ", 1)[1])


def optional_user(authorization: str | None = Header(default=None)) -> dict | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        return decode_token(authorization.split(" ", 1)[1])
    except HTTPException:
        return None


def require(min_role: str):
    def dep(user: dict = Depends(current_user)) -> dict:
        if RANK.get(user["role"], -1) < RANK[min_role]:
            raise HTTPException(403, f"Requires {min_role} role")
        return user

    return dep


def worker_key(x_worker_key: str | None = Header(default=None)) -> None:
    if not x_worker_key or not hmac.compare_digest(x_worker_key, settings.WORKER_KEY):
        raise HTTPException(401, "Bad worker key")


def sign_evidence(evidence_id: str, ttl: int = 600) -> str:
    exp = int(time.time()) + ttl
    sig = hmac.new(settings.SECRET.encode(), f"{evidence_id}.{exp}".encode(), "sha256").hexdigest()[:32]
    return f"exp={exp}&sig={sig}"


def verify_evidence_sig(evidence_id: str, exp: int, sig: str) -> bool:
    if exp < time.time():
        return False
    good = hmac.new(settings.SECRET.encode(), f"{evidence_id}.{exp}".encode(), "sha256").hexdigest()[:32]
    return hmac.compare_digest(good, sig)


_hits: dict[tuple[str, str], deque] = defaultdict(deque)


def _limiter(bucket: str, per_min):
    def check(request: Request) -> None:
        """Sliding one-minute window per client IP and bucket."""
        ip = request.client.host if request.client else "?"
        now = time.time()
        q = _hits[(bucket, ip)]
        while q and q[0] < now - 60:
            q.popleft()
        if len(q) >= per_min():
            raise HTTPException(429, "Too many requests, please wait a minute")
        q.append(now)

    return check


rate_limit = _limiter("write", lambda: settings.RATE_LIMIT_PER_MIN)  # creating reports, sign-in
rate_limit_read = _limiter("read", lambda: settings.RATE_LIMIT_PER_MIN * 10)  # status polling, QR lookup


ALLOWED = {
    "image": ({"image/jpeg", "image/png", "image/webp"}, {".jpg", ".jpeg", ".png", ".webp"}, settings.MAX_IMAGE_MB),
    "video": ({"video/mp4", "video/webm", "video/quicktime"}, {".mp4", ".webm", ".mov"}, settings.MAX_VIDEO_MB),
    "audio": (
        {"audio/webm", "audio/ogg", "audio/mpeg", "audio/wav", "audio/mp4", "audio/x-wav", "video/webm"},
        {".webm", ".ogg", ".mp3", ".wav", ".m4a", ".mp4"},
        settings.MAX_AUDIO_MB,
    ),
}


def classify_upload(filename: str, mime: str, size: int) -> str:
    """Return the evidence kind, or raise 415/413. Extension AND mime type must both be allowed."""
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    base = mime.split(";")[0].strip().lower()
    # Voice notes recorded in a browser are audio/webm but a few browsers label them video/webm: treat .webm
    # named voice* as audio.
    if base == "video/webm" and filename.lower().startswith("voice"):
        base = "audio/webm"
    for kind, (mimes, exts, mb) in ALLOWED.items():
        if base in mimes and ext in exts:
            if size > mb * 1024 * 1024:
                raise HTTPException(413, f"{kind} larger than {mb} MB")
            return kind
    raise HTTPException(415, f"File type not allowed: {filename} ({base})")
