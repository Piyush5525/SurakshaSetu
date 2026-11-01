"""Departments are data, not constants: admins can add them. Seeded from the defaults in domain.py."""

from .. import db
from ..domain import DEPARTMENTS


def seed() -> None:
    for d in DEPARTMENTS:
        db.run("INSERT OR IGNORE INTO departments(name) VALUES(?)", (d,))


def names() -> list[str]:
    return [r["name"] for r in db.rows("SELECT name FROM departments WHERE active=1 ORDER BY name")]
