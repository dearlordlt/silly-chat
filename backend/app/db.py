"""SQLite engine + session (SQLModel)."""

from __future__ import annotations

from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

_settings = get_settings()
_settings.db_file.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    f"sqlite:///{_settings.db_file}",
    connect_args={"check_same_thread": False},
)


def init_db() -> None:
    # Import models so their tables register before create_all.
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _ensure_columns()


def _ensure_columns() -> None:
    """Tiny additive migration: add new columns to existing tables (SQLite)."""
    with engine.connect() as conn:
        cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(user)").fetchall()}
        if "settings" not in cols:
            conn.exec_driver_sql("ALTER TABLE user ADD COLUMN settings TEXT DEFAULT '{}'")
            conn.commit()


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
