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
    # Per-user preferences synced across devices (e.g. {"storageMode": "server"}).
    settings: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    # May this user generate images? None = default (admins yes, others no). A
    # dedicated column — deliberately NOT in `settings`, which users can write
    # themselves via /api/auth/settings; only admins flip this.
    image_gen: bool | None = Field(default=None)
    # Weekly image quota override (admin-set). None = the config default; admins
    # are always unlimited. Invisible to the user until it nearly runs out.
    image_quota: int | None = Field(default=None)
    # Chat-encryption data key, wrapped under the password / the recovery key.
    # Empty until the user's first login after encryption shipped.
    wrapped_dk: str = ""
    wrapped_dk_recovery: str = ""
    created_at: datetime = Field(default_factory=_utcnow)


def image_gen_enabled(user: User) -> bool:
    """Effective image-generation permission: explicit flag wins, else role default."""
    return user.image_gen if user.image_gen is not None else user.role == "admin"


class UsageEvent(SQLModel, table=True):
    """One LLM run or image generation — counts only, never any content. Powers the
    admin Statistics panel; what was asked or answered is never stored here."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(index=True)
    kind: str = "llm"  # llm | image
    model: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    images: int = 0
    created_at: datetime = Field(default_factory=_utcnow, index=True)


class AppSetting(SQLModel, table=True):
    """App-wide settings editable by admins (e.g. model overrides)."""

    key: str = Field(primary_key=True)
    value: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class Upload(SQLModel, table=True):
    """An uploaded attachment (image now; docs later). Bytes live on disk keyed by
    content hash so identical files dedupe; this row is the per-user reference + metadata."""

    id: str = Field(primary_key=True)  # uuid; what the client/chat references
    user_id: int = Field(index=True, foreign_key="user.id")
    sha256: str = Field(index=True)  # on-disk file name; dedupes identical bytes
    kind: str = "image"  # image | doc
    mime: str = "application/octet-stream"
    ext: str = "bin"
    size: int = 0  # stored (post-compression) byte size
    name: str = ""  # original filename, for display/download
    # 1 = file bytes (and doc chunks) sealed under the owner's data key; the file on
    # disk is named {id}.enc. 0 = legacy plaintext ({sha256}.{ext}), ages out via TTL.
    enc: int = 0
    created_at: datetime = Field(default_factory=_utcnow)
    last_used_at: datetime = Field(default_factory=_utcnow)


class DocChunk(SQLModel, table=True):
    """A chunk of an uploaded document + its embedding (for RAG). These are tiny and
    outlive the original file, so the chat keeps its context after the file is purged."""

    id: int | None = Field(default=None, primary_key=True)
    upload_id: str = Field(index=True, foreign_key="upload.id")
    idx: int = 0  # order within the document
    text: str = ""
    embedding: bytes = b""  # float32 vector


class Conversation(SQLModel, table=True):
    # id is the client-generated uuid (stable when a chat moves local<->server).
    id: str = Field(primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    title: str = ""
    turns: list[Any] = Field(default_factory=list, sa_column=Column(JSON))
    # Ids of other conversations @-linked into this one's context.
    linked: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    # Rolling summary of compacted (older) messages + how many turns it covers.
    summary: str = ""
    summarized_upto: int = 0
    # Code artifacts: [{id, name, language, content, updatedAt}] — latest version each.
    artifacts: list[Any] = Field(default_factory=list, sa_column=Column(JSON))
    # Encrypted-at-rest payload (AES-GCM under the owner's data key). When set, the
    # plaintext columns above hold empty placeholders. Title is sealed separately so
    # the sidebar list decrypts cheaply.
    enc_title: str = ""
    enc_data: str = ""
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
