"""Attachment uploads (images now; docs later).

Design goals, in order:
  1. Don't fill the disk. Images are recompressed on ingest (downscaled + JPEG), bytes are
     deduped by content hash, and there are per-user + global quotas plus a TTL sweep.
  2. Owner-only. An upload is readable only by the user who created it.
  3. Cheap to wire into a turn. ``load_attachment`` returns (mime, bytes) for the vision tool.
"""

from __future__ import annotations

import hashlib
import io
import uuid
from datetime import timedelta
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from PIL import Image, ImageOps
from sqlalchemy import func
from sqlmodel import Session, select

from app.auth.deps import ApprovedUser, SessionDep
from app.config import ROOT, get_settings
from app.db import engine
from app.logging_setup import get_logger
from app.models import Upload, _utcnow

log = get_logger("uploads")
router = APIRouter(prefix="/api/uploads", tags=["uploads"])


def _dir() -> Path:
    d = ROOT / "data" / "uploads"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _process_image(raw: bytes, max_dim: int) -> bytes:
    """Downscale to max_dim on the long side and re-encode as JPEG (flatten alpha).

    JPEG is universally accepted by vision models and keeps stored size to ~100–300KB.
    """
    img = Image.open(io.BytesIO(raw))
    img = ImageOps.exif_transpose(img)  # honor camera orientation
    if max(img.size) > max_dim:
        img.thumbnail((max_dim, max_dim))
    if img.mode in ("RGBA", "LA", "P"):
        rgba = img.convert("RGBA")
        bg = Image.new("RGB", rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[-1])
        img = bg
    else:
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85, optimize=True)
    return buf.getvalue()


def _user_used(session: Session, uid: int) -> int:
    return session.exec(select(func.coalesce(func.sum(Upload.size), 0)).where(Upload.user_id == uid)).one()


def _global_used(session: Session) -> int:
    return session.exec(select(func.coalesce(func.sum(Upload.size), 0))).one()


def _gc_orphan_files(session: Session) -> None:
    """Delete on-disk files no Upload row references anymore."""
    referenced = set(session.exec(select(Upload.sha256)).all())
    for f in _dir().glob("*.*"):
        if f.stem not in referenced:
            f.unlink(missing_ok=True)


def _evict_until_room(session: Session, incoming: int, limit: int) -> None:
    """LRU-evict uploads until the new file fits under the global limit."""
    used = _global_used(session)
    if used + incoming <= limit:
        return
    for up in session.exec(select(Upload).order_by(Upload.last_used_at)).all():
        if used + incoming <= limit:
            break
        used -= up.size
        session.delete(up)
    session.commit()
    _gc_orphan_files(session)


def sweep_expired() -> int:
    """Delete uploads past their TTL (called at startup). Returns count removed."""
    cfg = get_settings().limits
    cutoff = _utcnow() - timedelta(days=cfg.upload_ttl_days)
    with Session(engine) as session:
        olds = session.exec(select(Upload).where(Upload.created_at < cutoff)).all()
        for up in olds:
            session.delete(up)
        session.commit()
        _gc_orphan_files(session)
    if olds:
        log.info("upload sweep: removed %d expired", len(olds))
    return len(olds)


@router.post("")
async def create_upload(
    user: ApprovedUser, session: SessionDep, file: UploadFile = File(...)
) -> dict:
    cfg = get_settings().limits
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "only images are supported right now")
    raw = await file.read()
    if len(raw) > cfg.upload_max_mb * 1024 * 1024:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"image over {cfg.upload_max_mb} MB")
    try:
        data = _process_image(raw, cfg.upload_image_max_dim)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "could not read that image")

    if _user_used(session, user.id) + len(data) > cfg.upload_user_quota_mb * 1024 * 1024:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "you've reached your upload quota")
    _evict_until_room(session, len(data), cfg.upload_global_quota_mb * 1024 * 1024)

    sha = hashlib.sha256(data).hexdigest()
    path = _dir() / f"{sha}.jpg"
    if not path.exists():
        path.write_bytes(data)
    up = Upload(
        id=uuid.uuid4().hex,
        user_id=user.id,
        sha256=sha,
        kind="image",
        mime="image/jpeg",
        ext="jpg",
        size=len(data),
        name=file.filename or "image.jpg",
    )
    session.add(up)
    session.commit()
    return {"id": up.id, "kind": up.kind, "name": up.name, "mime": up.mime}


@router.get("/{uid}")
def serve_upload(uid: str, user: ApprovedUser, session: SessionDep) -> FileResponse:
    up = session.get(Upload, uid)
    if up is None or up.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
    path = _dir() / f"{up.sha256}.{up.ext}"
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "expired")
    up.last_used_at = _utcnow()
    session.add(up)
    session.commit()
    return FileResponse(path, media_type=up.mime, headers={"Cache-Control": "private, max-age=86400"})


def load_attachment(session: Session, uid: str, user_id: int) -> tuple[str, bytes] | None:
    """(mime, bytes) for an owned, unexpired upload — used to feed the vision model."""
    up = session.get(Upload, uid)
    if up is None or up.user_id != user_id:
        return None
    path = _dir() / f"{up.sha256}.{up.ext}"
    if not path.exists():
        return None
    up.last_used_at = _utcnow()
    session.add(up)
    session.commit()
    return up.mime, path.read_bytes()
