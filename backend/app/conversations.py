"""Server-side conversation store (per user).

Enables the "save to server" storage mode: history that follows a user across
devices. Each conversation is owned by a user; the id is the client uuid so a chat
keeps its identity when moved between local and server.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select

from app.auth import crypto
from app.auth.deps import ApprovedUser, SessionDep, SessionKey
from app.models import Conversation

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


# ---- encryption at rest -------------------------------------------------------------
# Conversations are stored sealed under the owner's data key (see auth/crypto.py):
# nobody with just the database — admin included — can read them.

def seal_conv(c: Conversation, dk: bytes) -> None:
    c.enc_title = crypto.encrypt_json(dk, c.title)
    c.enc_data = crypto.encrypt_json(
        dk,
        {
            "turns": c.turns,
            "linked": c.linked or [],
            "summary": c.summary or "",
            "summarized_upto": c.summarized_upto or 0,
            "artifacts": c.artifacts or [],
        },
    )
    c.title, c.turns, c.linked, c.summary, c.summarized_upto, c.artifacts = "", [], [], "", 0, []


def _unseal_title(c: Conversation, dk: bytes | None) -> str:
    if not c.enc_title:
        return c.title
    if dk is None:
        return "(locked)"
    title = crypto.decrypt_json(dk, c.enc_title)
    return title if isinstance(title, str) else "(locked)"


def _unseal_data(c: Conversation, dk: bytes | None) -> dict | None:
    if not c.enc_data:
        return {
            "turns": c.turns, "linked": c.linked or [], "summary": c.summary or "",
            "summarized_upto": c.summarized_upto or 0, "artifacts": c.artifacts or [],
        }
    data = crypto.decrypt_json(dk, c.enc_data) if dk is not None else None
    return data if isinstance(data, dict) else None


class ConvIn(BaseModel):
    title: str = ""
    turns: list[Any] = []
    linked: list[str] = []  # ids of @-linked conversations (context for this chat)
    summary: str = ""  # rolling summary of compacted older messages
    summarized_upto: int = 0  # turns[:this] are covered by the summary
    artifacts: list[Any] = []  # code artifacts, latest version each
    # None = leave as is (regular saves omit it); set only when moving a chat in.
    pinned: bool | None = None


class ConvPatch(BaseModel):
    """Metadata-only edits: rename and pin/unpin. Neither bumps updated_at —
    housekeeping shouldn't reorder the sidebar."""

    title: str | None = None
    pinned: bool | None = None


class ConvSummary(BaseModel):
    id: str
    title: str
    updated_at: datetime
    pinned: bool = False


class ConvOut(ConvSummary):
    turns: list[Any]
    linked: list[str] = []
    summary: str = ""
    summarized_upto: int = 0
    artifacts: list[Any] = []


def _utc(dt: datetime) -> datetime:
    # SQLite stores naive datetimes; they're UTC (written with utcnow). Mark them
    # so the JSON carries an offset and clients don't read them as local time.
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _own(session: SessionDep, user: ApprovedUser, cid: str) -> Conversation:
    c = session.get(Conversation, cid)
    if not c or c.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no such conversation")
    return c


@router.get("")
def list_conversations(user: ApprovedUser, session: SessionDep, dk: SessionKey) -> list[ConvSummary]:
    rows = session.exec(
        select(Conversation)
        .where(Conversation.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
    ).all()
    return [
        ConvSummary(id=c.id, title=_unseal_title(c, dk), updated_at=_utc(c.updated_at), pinned=c.pinned)
        for c in rows
    ]


@router.get("/{cid}")
def get_conversation(cid: str, user: ApprovedUser, session: SessionDep, dk: SessionKey) -> ConvOut:
    c = _own(session, user, cid)
    data = _unseal_data(c, dk)
    if data is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "log in again to unlock this chat")
    return ConvOut(
        id=c.id, title=_unseal_title(c, dk), turns=data.get("turns", []),
        linked=data.get("linked", []), summary=data.get("summary", ""),
        summarized_upto=data.get("summarized_upto", 0), artifacts=data.get("artifacts", []),
        updated_at=_utc(c.updated_at), pinned=c.pinned,
    )


@router.put("/{cid}")
def upsert_conversation(
    cid: str, body: ConvIn, user: ApprovedUser, session: SessionDep, dk: SessionKey
) -> ConvSummary:
    now = datetime.now(timezone.utc)
    c = session.get(Conversation, cid)
    if c is not None:
        if c.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "no such conversation")
        c.updated_at = now
    else:
        c = Conversation(id=cid, user_id=user.id, created_at=now, updated_at=now)
    c.title = body.title
    c.turns = body.turns
    c.linked = body.linked
    c.summary = body.summary
    c.summarized_upto = body.summarized_upto
    c.artifacts = body.artifacts
    if body.pinned is not None:
        c.pinned = body.pinned
    c.enc_title = c.enc_data = ""
    if dk is not None:
        seal_conv(c, dk)
    session.add(c)
    session.commit()
    return ConvSummary(id=c.id, title=body.title, updated_at=_utc(c.updated_at), pinned=c.pinned)


@router.patch("/{cid}")
def patch_conversation(
    cid: str, body: ConvPatch, user: ApprovedUser, session: SessionDep, dk: SessionKey
) -> ConvSummary:
    c = _own(session, user, cid)
    if body.pinned is not None:
        c.pinned = body.pinned
    title = _unseal_title(c, dk)
    if body.title is not None:
        title = body.title
        if c.enc_title:
            if dk is None:
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "log in again to rename this chat")
            c.enc_title = crypto.encrypt_json(dk, body.title)
        else:
            c.title = body.title
    session.add(c)
    session.commit()
    return ConvSummary(id=c.id, title=title, updated_at=_utc(c.updated_at), pinned=c.pinned)


@router.delete("/{cid}")
def delete_conversation(cid: str, user: ApprovedUser, session: SessionDep) -> dict:
    c = session.get(Conversation, cid)
    if c and c.user_id == user.id:
        session.delete(c)
        session.commit()
    return {"ok": True}
