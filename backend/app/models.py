"""Database models."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    password_hash: str
    status: str = Field(default="pending")  # pending | approved
    role: str = Field(default="user")  # user | admin
    created_at: datetime = Field(default_factory=_utcnow)
