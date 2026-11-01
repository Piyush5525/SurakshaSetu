import os
import sys
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="sw-test-")
os.environ["DATA_DIR"] = _tmp
os.environ["INCIDENT_DB"] = str(Path(_tmp) / "t.db")
os.environ["DEMO_MODE"] = "true"
os.environ["CALLS_ENABLED"] = "false"
os.environ["RATE_LIMIT_PER_MIN"] = "1000"
os.environ["ESCALATE_AFTER_S"] = "1"
os.environ["TELEGRAM_BOT_TOKEN"] = ""
os.environ["JWT_SECRET"] = "test-secret"
os.environ["CV_WORKER_KEY"] = "test-key"
os.environ["DEMO_PASSWORD"] = "demo1234"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # repo root, so `backend.app` imports

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def login(client, user="admin", pw="demo1234"):
    r = client.post("/api/auth/login", json={"username": user, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def admin(client):
    return login(client)
