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
        cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(conversation)").fetchall()}
        if "linked" not in cols:
            conn.exec_driver_sql("ALTER TABLE conversation ADD COLUMN linked TEXT DEFAULT '[]'")
            conn.commit()
        if "summary" not in cols:
            conn.exec_driver_sql("ALTER TABLE conversation ADD COLUMN summary TEXT DEFAULT ''")
            conn.exec_driver_sql("ALTER TABLE conversation ADD COLUMN summarized_upto INTEGER DEFAULT 0")
            conn.commit()
        if "artifacts" not in cols:
            conn.exec_driver_sql("ALTER TABLE conversation ADD COLUMN artifacts TEXT DEFAULT '[]'")
            conn.commit()
        if "enc_data" not in cols:
            conn.exec_driver_sql("ALTER TABLE conversation ADD COLUMN enc_title TEXT DEFAULT ''")
            conn.exec_driver_sql("ALTER TABLE conversation ADD COLUMN enc_data TEXT DEFAULT ''")
            conn.commit()
        if "pinned" not in cols:
            conn.exec_driver_sql("ALTER TABLE conversation ADD COLUMN pinned BOOLEAN DEFAULT 0")
            conn.commit()
        if "project_id" not in cols:
            conn.exec_driver_sql("ALTER TABLE conversation ADD COLUMN project_id TEXT")
            # create_all only indexes tables it creates, so existing DBs need this by hand.
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_conversation_project_id ON conversation (project_id)"
            )
            conn.commit()
        if "enc_digest" not in cols:
            conn.exec_driver_sql("ALTER TABLE conversation ADD COLUMN enc_digest TEXT DEFAULT ''")
            conn.commit()
        ucols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(user)").fetchall()}
        if "wrapped_dk" not in ucols:
            conn.exec_driver_sql("ALTER TABLE user ADD COLUMN wrapped_dk TEXT DEFAULT ''")
            conn.exec_driver_sql("ALTER TABLE user ADD COLUMN wrapped_dk_recovery TEXT DEFAULT ''")
            conn.commit()
        if "image_gen" not in ucols:
            conn.exec_driver_sql("ALTER TABLE user ADD COLUMN image_gen BOOLEAN")
            conn.commit()
        if "image_quota" not in ucols:
            conn.exec_driver_sql("ALTER TABLE user ADD COLUMN image_quota INTEGER")
            conn.commit()
        if "project_quota_mb" not in ucols:
            conn.exec_driver_sql("ALTER TABLE user ADD COLUMN project_quota_mb INTEGER")
            conn.commit()
        upcols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(upload)").fetchall()}
        if "enc" not in upcols:
            conn.exec_driver_sql("ALTER TABLE upload ADD COLUMN enc INTEGER DEFAULT 0")
            conn.commit()
        if "gen_meta" not in upcols:
            conn.exec_driver_sql("ALTER TABLE upload ADD COLUMN gen_meta TEXT DEFAULT ''")
            conn.commit()
        if "project_id" not in upcols:
            conn.exec_driver_sql("ALTER TABLE upload ADD COLUMN project_id TEXT")
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_upload_project_id ON upload (project_id)"
            )
            conn.commit()


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
