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

from app.auth.deps import ApprovedUser, SessionDep
from app.models import Conversation

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


class ConvIn(BaseModel):
    title: str = ""
    turns: list[Any] = []
    linked: list[str] = []  # ids of @-linked conversations (context for this chat)
    summary: str = ""  # rolling summary of compacted older messages
    summarized_upto: int = 0  # turns[:this] are covered by the summary


class ConvSummary(BaseModel):
    id: str
    title: str
    updated_at: datetime


class ConvOut(ConvSummary):
    turns: list[Any]
    linked: list[str] = []
    summary: str = ""
    summarized_upto: int = 0


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
def list_conversations(user: ApprovedUser, session: SessionDep) -> list[ConvSummary]:
    rows = session.exec(
        select(Conversation)
        .where(Conversation.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
    ).all()
    return [ConvSummary(id=c.id, title=c.title, updated_at=_utc(c.updated_at)) for c in rows]


@router.get("/{cid}")
def get_conversation(cid: str, user: ApprovedUser, session: SessionDep) -> ConvOut:
    c = _own(session, user, cid)
    return ConvOut(
        id=c.id, title=c.title, turns=c.turns, linked=c.linked or [],
        summary=c.summary or "", summarized_upto=c.summarized_upto or 0,
        updated_at=_utc(c.updated_at),
    )


@router.put("/{cid}")
def upsert_conversation(
    cid: str, body: ConvIn, user: ApprovedUser, session: SessionDep
) -> ConvSummary:
    now = datetime.now(timezone.utc)
    c = session.get(Conversation, cid)
    if c is not None:
        if c.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "no such conversation")
        c.title = body.title
        c.turns = body.turns
        c.linked = body.linked
        c.summary = body.summary
        c.summarized_upto = body.summarized_upto
        c.updated_at = now
    else:
        c = Conversation(
            id=cid, user_id=user.id, title=body.title, turns=body.turns, linked=body.linked,
            summary=body.summary, summarized_upto=body.summarized_upto,
            created_at=now, updated_at=now,
        )
    session.add(c)
    session.commit()
    session.refresh(c)
    return ConvSummary(id=c.id, title=c.title, updated_at=_utc(c.updated_at))


@router.delete("/{cid}")
def delete_conversation(cid: str, user: ApprovedUser, session: SessionDep) -> dict:
    c = session.get(Conversation, cid)
    if c and c.user_id == user.id:
        session.delete(c)
        session.commit()
    return {"ok": True}
