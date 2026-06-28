"""Database models."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, Column
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


class Conversation(SQLModel, table=True):
    # id is the client-generated uuid (stable when a chat moves local<->server).
    id: str = Field(primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    title: str = ""
    turns: list[Any] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
