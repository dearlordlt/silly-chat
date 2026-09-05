"""Projects: folders of chats with a standing instruction, defaults and shared files.

A project holds what a recurring piece of work needs in one place — the instruction the
user would otherwise retype every chat ("you craft image prompts from my descriptions"),
the reference documents they'd otherwise re-attach, and the defaults new chats start with.

Sealed like conversations: the name and master prompt are user content and live encrypted
under the owner's data key. The behaviour flags stay plaintext — they're settings, and the
sidebar/composer must configure themselves without a key.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field as PField
from sqlalchemy import func
from sqlmodel import Session, select

from app.auth import crypto
from app.auth.deps import ApprovedUser, SessionDep, SessionKey
from app.config import get_settings
from app.logging_setup import get_logger
from app.models import Conversation, DocChunk, Project, Upload
from app.uploads import (
    _delete_upload,
    _gc_orphan_files,
    _is_doc,
    ingest_doc,
    project_quota_bytes,
    project_used,
    unseal_chunks,
)

log = get_logger("projects")
router = APIRouter(prefix="/api/projects", tags=["projects"])

Mode = Literal["search", "chat", "code", "images"]
# Canonical order — a project's chats start in the first mode it allows.
MODE_ORDER: tuple[str, ...] = ("search", "chat", "code", "images")


# ---- sealing ------------------------------------------------------------------------

def _seal(p: Project, dk: bytes) -> None:
    p.enc_name = crypto.encrypt_json(dk, p.name)
    p.enc_data = crypto.encrypt_json(dk, {"prompt": p.prompt})
    p.name, p.prompt = "", ""


def _unseal_name(p: Project, dk: bytes | None) -> str:
    if not p.enc_name:
        return p.name
    if dk is None:
        return "(locked)"
    name = crypto.decrypt_json(dk, p.enc_name)
    return name if isinstance(name, str) else "(locked)"


def _unseal_prompt(p: Project, dk: bytes | None) -> str:
    if not p.enc_data:
        return p.prompt
    if dk is None:
        return ""
    data = crypto.decrypt_json(dk, p.enc_data)
    return data.get("prompt", "") if isinstance(data, dict) else ""


# ---- wire models --------------------------------------------------------------------

class ProjectIn(BaseModel):
    id: str | None = None  # client uuid, like a chat; the server mints one if absent
    name: str = PField(default="", max_length=80)
    prompt: str = ""
    storage_mode: Literal["off", "local", "server"] = "local"
    modes: list[Mode] = []
    memory: bool = False


class ProjectPatch(BaseModel):
    """Partial edit — None means "leave as is", so each card on the project page can
    save its own field without resending the others."""

    name: str | None = PField(default=None, max_length=80)
    prompt: str | None = None
    storage_mode: Literal["off", "local", "server"] | None = None
    modes: list[Mode] | None = None
    memory: bool | None = None


class ProjectOut(BaseModel):
    id: str
    name: str
    prompt: str
    storage_mode: str
    modes: list[str]
    memory: bool
    chat_count: int = 0  # server-side chats only; the client adds its local ones
    file_count: int = 0
    files_bytes: int = 0
    updated_at: datetime


class ProjectFileOut(BaseModel):
    id: str
    name: str
    mime: str
    size: int
    chunks: int = 0
    created_at: datetime


class FileQuota(BaseModel):
    used: int
    limit: int  # bytes; meaningless when unlimited
    unlimited: bool


class FilesOut(BaseModel):
    files: list[ProjectFileOut]
    quota: FileQuota


class DigestOut(BaseModel):
    id: str
    title: str
    digest: str


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _own(session: Session, user_id: int, pid: str) -> Project:
    p = session.get(Project, pid)
    if not p or p.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no such project")
    return p


def _counts(session: Session, pid: str) -> tuple[int, int, int]:
    chats = session.exec(
        select(func.count()).select_from(Conversation).where(Conversation.project_id == pid)
    ).one()
    files, size = session.exec(
        select(func.count(), func.coalesce(func.sum(Upload.size), 0)).where(
            Upload.project_id == pid
        )
    ).one()
    return chats, files, size


def _out(session: Session, p: Project, dk: bytes | None) -> ProjectOut:
    chats, files, size = _counts(session, p.id)
    return ProjectOut(
        id=p.id, name=_unseal_name(p, dk), prompt=_unseal_prompt(p, dk),
        storage_mode=p.storage_mode, modes=list(p.modes or []), memory=p.memory,
        chat_count=chats, file_count=files, files_bytes=size, updated_at=_utc(p.updated_at),
    )


def _quota(session: Session, user) -> FileQuota:
    limit = project_quota_bytes(user)
    return FileQuota(
        used=project_used(session, user.id), limit=limit or 0, unlimited=limit is None
    )


# ---- project CRUD -------------------------------------------------------------------

@router.get("")
def list_projects(user: ApprovedUser, session: SessionDep, dk: SessionKey) -> list[ProjectOut]:
    rows = session.exec(
        select(Project).where(Project.user_id == user.id).order_by(Project.updated_at.desc())
    ).all()
    return [_out(session, p, dk) for p in rows]


@router.post("")
def create_project(
    body: ProjectIn, user: ApprovedUser, session: SessionDep, dk: SessionKey
) -> ProjectOut:
    cfg = get_settings().limits
    count = session.exec(
        select(func.count()).select_from(Project).where(Project.user_id == user.id)
    ).one()
    if count >= cfg.project_max_per_user:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"You've reached the limit of {cfg.project_max_per_user} projects",
        )
    now = datetime.now(timezone.utc)
    p = Project(
        id=body.id or uuid.uuid4().hex, user_id=user.id,
        name=body.name.strip() or "Untitled project",
        prompt=body.prompt[: cfg.project_prompt_max_chars],
        storage_mode=body.storage_mode, modes=list(body.modes), memory=body.memory,
        created_at=now, updated_at=now,
    )
    if dk is not None:
        _seal(p, dk)
    session.add(p)
    session.commit()
    return _out(session, p, dk)


@router.get("/{pid}")
def get_project(pid: str, user: ApprovedUser, session: SessionDep, dk: SessionKey) -> ProjectOut:
    return _out(session, _own(session, user.id, pid), dk)


@router.patch("/{pid}")
def update_project(
    pid: str, body: ProjectPatch, user: ApprovedUser, session: SessionDep, dk: SessionKey
) -> ProjectOut:
    cfg = get_settings().limits
    p = _own(session, user.id, pid)
    # Content fields live sealed, so editing either one means re-sealing both.
    name, prompt = _unseal_name(p, dk), _unseal_prompt(p, dk)
    if body.name is not None or body.prompt is not None:
        if p.enc_name and dk is None:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED, "log in again to edit this project"
            )
        if body.name is not None:
            name = body.name.strip() or name
        if body.prompt is not None:
            prompt = body.prompt[: cfg.project_prompt_max_chars]
        p.name, p.prompt = name, prompt
        if dk is not None:
            _seal(p, dk)
    if body.storage_mode is not None:
        p.storage_mode = body.storage_mode
    if body.modes is not None:
        p.modes = list(body.modes)
    if body.memory is not None:
        p.memory = body.memory
    p.updated_at = datetime.now(timezone.utc)
    session.add(p)
    session.commit()
    return _out(session, p, dk)


@router.delete("/{pid}")
def delete_project(pid: str, user: ApprovedUser, session: SessionDep) -> dict:
    """Hard-delete the project with everything in it: its chats and its files.

    The client says exactly what will go before asking — and deletes the project's
    *local* chats itself, since the server never sees those.
    """
    p = _own(session, user.id, pid)
    files = session.exec(select(Upload).where(Upload.project_id == pid)).all()
    for up in files:
        _delete_upload(session, up)
    chats = session.exec(
        select(Conversation).where(
            Conversation.user_id == user.id, Conversation.project_id == pid
        )
    ).all()
    for c in chats:
        session.delete(c)
    session.delete(p)
    session.commit()
    _gc_orphan_files(session)
    return {"ok": True, "deleted_chats": len(chats), "files_deleted": len(files)}


# ---- files --------------------------------------------------------------------------

def _file_out(session: Session, up: Upload) -> ProjectFileOut:
    chunks = session.exec(
        select(func.count()).select_from(DocChunk).where(DocChunk.upload_id == up.id)
    ).one()
    return ProjectFileOut(
        id=up.id, name=up.name, mime=up.mime, size=up.size, chunks=chunks,
        created_at=_utc(up.created_at),
    )


@router.get("/{pid}/files")
def list_files(pid: str, user: ApprovedUser, session: SessionDep) -> FilesOut:
    _own(session, user.id, pid)
    rows = session.exec(
        select(Upload).where(Upload.project_id == pid).order_by(Upload.created_at.desc())
    ).all()
    return FilesOut(files=[_file_out(session, up) for up in rows], quota=_quota(session, user))


@router.post("/{pid}/files")
async def upload_file(
    pid: str, user: ApprovedUser, session: SessionDep, dk: SessionKey,
    file: UploadFile = File(...),
) -> dict:
    cfg = get_settings().limits
    _own(session, user.id, pid)
    raw = await file.read()
    name = file.filename or "file"
    if not _is_doc(file.content_type or "", name):
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Only documents work as project files (PDF, DOCX, XLSX, PPTX, TXT, MD, CSV). "
            "Images belong in a chat message.",
        )
    if len(raw) > cfg.doc_max_mb * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE,
            f"That file is too large (max {cfg.doc_max_mb} MB)",
        )

    files, chunks = session.exec(
        select(func.count(), func.coalesce(func.sum(Upload.size), 0)).where(
            Upload.project_id == pid
        )
    ).one()
    if files >= cfg.project_max_files:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE,
            f"This project already has {cfg.project_max_files} files — remove one first",
        )
    limit = project_quota_bytes(user)
    if limit is not None and project_used(session, user.id) + len(raw) > limit:
        mb = limit // (1024 * 1024)
        left = max(0, limit - project_used(session, user.id)) // (1024 * 1024)
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE,
            f"Your project files are full ({mb} MB, {left} MB left) — delete one to make room",
        )
    # Bound the per-turn ranking cost at ingest rather than truncating at query time:
    # refusing here is explainable, silently dropping passages later is not.
    used_chunks = session.exec(
        select(func.count())
        .select_from(DocChunk)
        .join(Upload, Upload.id == DocChunk.upload_id)
        .where(Upload.project_id == pid)
    ).one()
    if used_chunks >= cfg.project_max_chunks:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE,
            "This project's files hold as much text as the assistant can search — "
            "remove a file before adding another",
        )

    up, n = await ingest_doc(
        session, user.id, raw, name, file.content_type or "", dk, project_id=pid
    )
    log.info("project %s: +doc %s (%d chunks)", pid, up.id, n)
    return {"file": _file_out(session, up).model_dump(mode="json"),
            "quota": _quota(session, user).model_dump()}


@router.delete("/{pid}/files/{uid}")
def delete_file(pid: str, uid: str, user: ApprovedUser, session: SessionDep) -> dict:
    _own(session, user.id, pid)
    up = session.get(Upload, uid)
    if up is not None and up.user_id == user.id and up.project_id == pid:
        _delete_upload(session, up)
        session.commit()
        _gc_orphan_files(session)
    return {"ok": True, "quota": _quota(session, user).model_dump()}


# ---- turn-time helpers --------------------------------------------------------------

class TurnContext(BaseModel):
    """What a project contributes to one turn: its standing instruction and the names
    of the files the assistant can search."""

    prompt: str = ""
    files: str = ""  # "rules.pdf (412 passages), sheet.docx (9 passages)"


def load_for_turn(
    session: Session, pid: str, user_id: int, dk: bytes | None
) -> TurnContext | None:
    """Resolve a project for a chat turn, or None if it's gone or not this user's.

    The client sends only the id — the master prompt is read from the sealed row here,
    never taken from the request body.
    """
    p = session.get(Project, pid)
    if not p or p.user_id != user_id:
        return None
    names = []
    for up in session.exec(
        select(Upload).where(Upload.project_id == pid).order_by(Upload.created_at)
    ).all():
        n = session.exec(
            select(func.count()).select_from(DocChunk).where(DocChunk.upload_id == up.id)
        ).one()
        names.append(f"{up.name} ({n} passages)")
    return TurnContext(prompt=_unseal_prompt(p, dk), files=", ".join(names))


def load_chunks(pid: str, user_id: int, dk: bytes | None) -> list[tuple[str, bytes]]:
    """Every passage in this project's files, unsealed — called lazily by
    ``search_document`` so turns that never search pay nothing.

    Deliberately not cached across requests: a process-level cache would park the
    user's decrypted documents in server memory between turns, which is exactly what
    sealing them at rest is meant to prevent.
    """
    from app.db import engine

    out: list[tuple[str, bytes]] = []
    with Session(engine) as session:
        for up in session.exec(
            select(Upload).where(Upload.project_id == pid, Upload.user_id == user_id)
        ).all():
            out.extend(unseal_chunks(session, up, dk))
    return out


@router.get("/{pid}/digests")
def list_digests(
    pid: str, user: ApprovedUser, session: SessionDep, dk: SessionKey
) -> list[DigestOut]:
    """Short digests of this project's server-side chats, newest first — the client
    merges its local ones and sends the combined memory with the next turn."""
    from app.conversations import _unseal_digest, _unseal_title

    _own(session, user.id, pid)
    rows = session.exec(
        select(Conversation)
        .where(Conversation.user_id == user.id, Conversation.project_id == pid)
        .order_by(Conversation.updated_at.desc())
    ).all()
    out: list[DigestOut] = []
    for c in rows:
        text, _ = _unseal_digest(c, dk)
        if text:
            out.append(DigestOut(id=c.id, title=_unseal_title(c, dk), digest=text))
    return out


def cascade_delete_for_user(session: Session, user_id: int) -> int:
    """Drop a user's projects (their uploads are cleaned up with the rest of the user's)."""
    rows = session.exec(select(Project).where(Project.user_id == user_id)).all()
    for p in rows:
        session.delete(p)
    return len(rows)
