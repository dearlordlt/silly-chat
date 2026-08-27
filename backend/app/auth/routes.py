"""Auth + admin routes.

Self-registration with manual approval. The FIRST registered user is auto-approved
and made admin (bootstrap); everyone after is pending until an admin approves them.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlmodel import func, select

from app.auth import crypto
from app.auth.deps import AdminUser, ApprovedUser, CurrentUser, SessionDep, SessionKey
from app.auth.security import (
    COOKIE_NAME,
    hash_password,
    make_session_token,
    verify_password,
)
from app.config import get_settings
from app.models import User

auth_router = APIRouter(prefix="/api/auth", tags=["auth"])
admin_router = APIRouter(prefix="/api/admin", tags=["admin"])


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    id: int
    username: str
    status: str
    role: str
    settings: dict[str, Any] = {}
    # Raw per-user image-generation flag; None = role default (admins yes).
    image_gen: bool | None = None
    # Effective capability: permission AND a configured OpenRouter key. The client
    # uses this to show the "Images" mode pill.
    can_generate_images: bool = False
    # Weekly image quota override — surfaced only through admin endpoints; the
    # /me and login payloads keep it None (quotas stay invisible to users).
    image_quota: int | None = None
    # Project-file storage override in MB. Admin-only, same reasoning.
    project_quota_mb: int | None = None


def _user_out(user: User, admin: bool = False) -> UserOut:
    from app import runtime
    from app.models import image_gen_enabled

    data = user.model_dump()
    if not admin:
        data["image_quota"] = None
        data["project_quota_mb"] = None
    return UserOut(
        **data,
        can_generate_images=image_gen_enabled(user) and runtime.any_image_key(),
    )


def _set_session_cookie(response: Response, user_id: int, dk: bytes | None = None) -> None:
    auth = get_settings().auth
    response.set_cookie(
        COOKIE_NAME,
        make_session_token(user_id, dk),
        max_age=auth.session_days * 86400,
        httponly=True,
        samesite="lax",
        secure=auth.cookie_secure,  # true behind HTTPS (Caddy) via AUTH__COOKIE_SECURE
    )


def _issue_keys(user: User, password: str) -> tuple[bytes, str]:
    """Create the user's data key + recovery key; wrap both onto the user row.
    Only callable when the password is in hand (register/login/reset). Caller commits."""
    dk = crypto.new_data_key()
    recovery = crypto.new_recovery_key()
    user.wrapped_dk = crypto.wrap_dk(dk, password)
    user.wrapped_dk_recovery = crypto.wrap_dk(dk, recovery)
    return dk, recovery


def _encrypt_existing_convs(session, user: User, dk: bytes) -> int:
    """Lazy migration: seal any plaintext conversations this user still has."""
    from app.conversations import seal_conv
    from app.models import Conversation

    rows = session.exec(select(Conversation).where(Conversation.user_id == user.id)).all()
    n = 0
    for c in rows:
        if not c.enc_data:
            seal_conv(c, dk)
            session.add(c)
            n += 1
    return n


@auth_router.post("/register")
def register(creds: Credentials, session: SessionDep, response: Response) -> dict:
    if session.exec(select(User).where(User.username == creds.username)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "username taken")

    is_first = session.exec(select(func.count()).select_from(User)).one() == 0
    user = User(
        username=creds.username,
        password_hash=hash_password(creds.password),
        status="approved" if is_first else "pending",
        role="admin" if is_first else "user",
    )
    dk, recovery = _issue_keys(user, creds.password)
    session.add(user)
    session.commit()
    session.refresh(user)

    # The bootstrap admin is logged in immediately; pending users are not.
    if is_first:
        _set_session_cookie(response, user.id, dk)
    return {"first": is_first, "status": user.status, "recovery_key": recovery}


@auth_router.post("/login")
def login(creds: Credentials, session: SessionDep, response: Response) -> dict:
    user = session.exec(select(User).where(User.username == creds.username)).first()
    if not user or not verify_password(creds.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    if user.status != "approved":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "account pending approval")

    recovery = None
    if not user.wrapped_dk:
        # Pre-encryption account: mint keys now and seal their existing chats.
        dk, recovery = _issue_keys(user, creds.password)
        n = _encrypt_existing_convs(session, user, dk)
        session.add(user)
        session.commit()
        if n:
            from app.logging_setup import get_logger

            get_logger("auth").info("encrypted %d existing conversation(s) for %s", n, user.username)
    else:
        dk = crypto.unwrap_dk(user.wrapped_dk, creds.password)
        if dk is None:
            # Password verified but the wrap didn't open — should never happen.
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "key unwrap failed")

    _set_session_cookie(response, user.id, dk)
    out = _user_out(user).model_dump()
    if recovery:
        out["recovery_key"] = recovery
    return out


class PasswordChange(BaseModel):
    old_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


@auth_router.put("/password")
def change_password(
    body: PasswordChange, user: ApprovedUser, session: SessionDep, response: Response
) -> dict:
    """Change password knowing the old one — the data key is re-wrapped, chats intact."""
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "wrong current password")
    dk = crypto.unwrap_dk(user.wrapped_dk, body.old_password) if user.wrapped_dk else None
    user.password_hash = hash_password(body.new_password)
    if dk is not None:
        user.wrapped_dk = crypto.wrap_dk(dk, body.new_password)
    session.add(user)
    session.commit()
    _set_session_cookie(response, user.id, dk)
    return {"ok": True}


class PasswordReset(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    recovery_key: str = Field(min_length=10, max_length=64)
    new_password: str = Field(min_length=8, max_length=128)


@auth_router.post("/reset")
def reset_password(body: PasswordReset, session: SessionDep, response: Response) -> dict:
    """Forgot password: the recovery key unlocks the data key and sets a new password.
    Without it, encrypted chats are unrecoverable — that is the privacy guarantee."""
    from app import ratelimit

    if not ratelimit.allow(f"reset:{body.username.lower()}", 5):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "slow down a moment")
    user = session.exec(select(User).where(User.username == body.username)).first()
    dk = (
        crypto.unwrap_dk(user.wrapped_dk_recovery, crypto.canon_recovery(body.recovery_key))
        if user and user.wrapped_dk_recovery
        else None
    )
    if user is None or dk is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid username or recovery key")
    if user.status != "approved":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "account pending approval")
    user.password_hash = hash_password(body.new_password)
    user.wrapped_dk = crypto.wrap_dk(dk, body.new_password)
    session.add(user)
    session.commit()
    _set_session_cookie(response, user.id, dk)
    return {"ok": True}


class RecoveryRegen(BaseModel):
    password: str = Field(min_length=8, max_length=128)


@auth_router.post("/recovery")
def regenerate_recovery(body: RecoveryRegen, user: ApprovedUser, session: SessionDep) -> dict:
    """Issue a fresh recovery key (invalidates the old one). Needs the password."""
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "wrong password")
    dk = crypto.unwrap_dk(user.wrapped_dk, body.password) if user.wrapped_dk else None
    if dk is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "encryption not initialized — log in again first")
    recovery = crypto.new_recovery_key()
    user.wrapped_dk_recovery = crypto.wrap_dk(dk, recovery)
    session.add(user)
    session.commit()
    return {"recovery_key": recovery}


@auth_router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@auth_router.get("/me")
def me(user: CurrentUser) -> UserOut | None:
    return _user_out(user) if user else None


@auth_router.put("/settings")
def update_settings(body: dict[str, Any], user: ApprovedUser, session: SessionDep) -> dict[str, Any]:
    merged = {**(user.settings or {}), **body}
    user.settings = merged
    session.add(user)
    session.commit()
    return merged


@admin_router.get("/users")
def list_users(_: AdminUser, session: SessionDep) -> list[UserOut]:
    users = session.exec(select(User).order_by(User.created_at)).all()
    return [_user_out(u, admin=True) for u in users]


@admin_router.post("/users/{user_id}/approve")
def approve_user(user_id: int, _: AdminUser, session: SessionDep) -> UserOut:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no such user")
    user.status = "approved"
    session.add(user)
    session.commit()
    session.refresh(user)
    return _user_out(user, admin=True)


class RoleIn(BaseModel):
    role: str  # "admin" | "user"


@admin_router.put("/users/{user_id}/role")
def set_role(user_id: int, body: RoleIn, admin: AdminUser, session: SessionDep) -> UserOut:
    if body.role not in ("admin", "user"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "role must be admin or user")
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no such user")
    if user.id == admin.id and body.role != "admin":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "you can't demote yourself")
    if user.role == "admin" and body.role == "user":
        admins = session.exec(select(func.count()).select_from(User).where(User.role == "admin")).one()
        if admins <= 1:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "there must be at least one admin")
    user.role = body.role
    session.add(user)
    session.commit()
    session.refresh(user)
    return _user_out(user, admin=True)


@admin_router.delete("/users/{user_id}")
def delete_user(user_id: int, admin: AdminUser, session: SessionDep) -> dict:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no such user")
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "you can't delete yourself")
    if user.role == "admin":
        admins = session.exec(select(func.count()).select_from(User).where(User.role == "admin")).one()
        if admins <= 1:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "there must be at least one admin")
    # Take the user's data with them (conversations, projects, uploads + doc chunks,
    # usage rows). Project files are ordinary uploads owned by the user, so the upload
    # loop below already covers them.
    from app.models import Conversation, DocChunk, Project, Upload, UsageEvent
    from app.uploads import _gc_orphan_files

    for conv in session.exec(select(Conversation).where(Conversation.user_id == user.id)).all():
        session.delete(conv)
    for proj in session.exec(select(Project).where(Project.user_id == user.id)).all():
        session.delete(proj)
    for ev in session.exec(select(UsageEvent).where(UsageEvent.user_id == user.id)).all():
        session.delete(ev)
    for up in session.exec(select(Upload).where(Upload.user_id == user.id)).all():
        for ch in session.exec(select(DocChunk).where(DocChunk.upload_id == up.id)).all():
            session.delete(ch)
        session.delete(up)
    session.delete(user)
    session.commit()
    _gc_orphan_files(session)
    return {"ok": True}


@admin_router.get("/models")
async def get_models(_: AdminUser) -> dict[str, Any]:
    from app import runtime
    from app.agent.models_catalog import available_models

    # current = raw settings ("" on a helper role means "same as main"); resolved =
    # what each role actually runs on — the UI needs both to render the choice.
    return {
        "current": runtime.settings_view(),
        "resolved": runtime.current(),
        "available": await available_models(),
    }


@admin_router.put("/models")
def set_models(body: dict[str, str], _: AdminUser) -> dict[str, str]:
    from app import runtime

    return runtime.set_overrides(body)


@admin_router.get("/models/capabilities")
async def model_capabilities(name: str, _: AdminUser) -> dict[str, Any]:
    """Capability tags for one model (per-chat picker hint: a vision-capable chat
    model reads images itself, so no separate vision model runs)."""
    from app.agent.ollama import capabilities

    return {"name": name, "capabilities": await capabilities(name)}


@admin_router.post("/users/{user_id}/reset")
def admin_reset_password(user_id: int, admin: AdminUser, session: SessionDep) -> dict:
    """Account-only recovery: issue a temporary password. The user's encryption keys
    are wiped and their (now undecryptable) server chats deleted — by design, an
    admin reset can never expose or restore encrypted data."""
    import secrets as _secrets

    from app.models import Conversation, Project, Upload
    from app.uploads import _delete_upload, _gc_orphan_files

    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no such user")
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "use Settings to change your own password")
    temp = "-".join(_secrets.token_hex(2) for _ in range(3))
    user.password_hash = hash_password(temp)
    user.wrapped_dk = ""
    user.wrapped_dk_recovery = ""
    # Only sealed chats die (they're undecryptable without the lost key); any
    # still-plaintext ones survive and seal under the fresh key at next login.
    deleted = 0
    for c in session.exec(select(Conversation).where(Conversation.user_id == user.id)).all():
        if c.enc_data:
            session.delete(c)
            deleted += 1
    # Sealed projects go the same way, files included — their name, master prompt and
    # document text were all sealed under the key that just died.
    projects = 0
    for p in session.exec(select(Project).where(Project.user_id == user.id)).all():
        if not p.enc_name and not p.enc_data:
            continue
        for up in session.exec(select(Upload).where(Upload.project_id == p.id)).all():
            _delete_upload(session, up)
        session.delete(p)
        projects += 1
    session.add(user)
    session.commit()
    if projects:
        _gc_orphan_files(session)
    return {"temp_password": temp, "deleted_chats": deleted, "deleted_projects": projects}


class ImageGenIn(BaseModel):
    enabled: bool


@admin_router.put("/users/{user_id}/imagegen")
def set_user_image_gen(user_id: int, body: ImageGenIn, _: AdminUser, session: SessionDep) -> UserOut:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no such user")
    user.image_gen = body.enabled
    session.add(user)
    session.commit()
    session.refresh(user)
    return _user_out(user, admin=True)


class ImageQuotaIn(BaseModel):
    # None = back to the config default; 0 = unlimited for this user.
    quota: int | None = Field(default=None, ge=0, le=100_000)


@admin_router.put("/users/{user_id}/imagequota")
def set_user_image_quota(user_id: int, body: ImageQuotaIn, _: AdminUser, session: SessionDep) -> UserOut:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no such user")
    user.image_quota = body.quota
    session.add(user)
    session.commit()
    session.refresh(user)
    return _user_out(user, admin=True)


class ProjectQuotaIn(BaseModel):
    # None = back to the config default; 0 = unlimited for this user.
    quota_mb: int | None = Field(default=None, ge=0, le=1_000_000)


@admin_router.put("/users/{user_id}/projectquota")
def set_user_project_quota(
    user_id: int, body: ProjectQuotaIn, _: AdminUser, session: SessionDep
) -> UserOut:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no such user")
    user.project_quota_mb = body.quota_mb
    session.add(user)
    session.commit()
    session.refresh(user)
    return _user_out(user, admin=True)


def _key_hint(key: str) -> str:
    """A recognizable, non-revealing fingerprint of the stored API key."""
    return (key[:9] + "…" + key[-4:]) if len(key) > 16 else ("set" if key else "")


class ImagesCfgIn(BaseModel):
    model: str = ""  # empty = keep
    api_key: str = ""  # empty = keep the stored key
    xai_api_key: str = ""  # direct xAI (Grok) key; empty = keep
    # None = keep; "" = clear (fall back to the fast model); value = set.
    model_quality: str | None = None
    model_edit: str | None = None


def _images_cfg() -> dict[str, Any]:
    from app import runtime

    key = runtime.image_api_key()
    xkey = runtime.xai_api_key()
    return {
        "model": runtime.image_model(),
        "model_quality": runtime.image_model_quality_setting(),
        "model_edit": runtime.image_model_edit_setting(),
        "has_key": bool(key),
        "key_hint": _key_hint(key),
        "has_xai_key": bool(xkey),
        "xai_key_hint": _key_hint(xkey),
    }


@admin_router.get("/images")
async def get_images_cfg(_: AdminUser) -> dict[str, Any]:
    from app import runtime
    from app.agent import xai
    from app.agent.imagegen import available_image_models

    available = await available_image_models()
    if runtime.xai_api_key():
        available = await xai.image_models() + available
    return {**_images_cfg(), "available": available}


@admin_router.put("/images")
def set_images_cfg(body: ImagesCfgIn, _: AdminUser) -> dict[str, Any]:
    from app import runtime

    runtime.set_images(
        {
            "model": body.model,
            "api_key": body.api_key,
            "xai_api_key": body.xai_api_key,
            "model_quality": body.model_quality,
            "model_edit": body.model_edit,
        }
    )
    return _images_cfg()


class SearchCfgIn(BaseModel):
    brave_api_key: str = ""  # empty = keep the stored key


def _search_cfg() -> dict[str, Any]:
    from app import runtime

    key = runtime.brave_api_key()
    st = runtime.search_status()
    return {
        "has_brave_key": bool(key),
        "brave_key_hint": _key_hint(key),
        "provider": "brave" if key else "searxng",
        # Empty unless a configured key actually failed — then it says why, so a
        # spent credit shows up here instead of as mysteriously worse answers.
        "brave_problem": "" if (not key or st.get("ok")) else str(st.get("detail") or ""),
    }


@admin_router.get("/search")
def get_search_cfg(_: AdminUser) -> dict[str, Any]:
    return _search_cfg()


@admin_router.put("/search")
def set_search_cfg(body: SearchCfgIn, _: AdminUser) -> dict[str, Any]:
    from app import runtime

    runtime.set_search({"brave_api_key": body.brave_api_key})
    return _search_cfg()


@admin_router.get("/stats")
def usage_stats(_: AdminUser, session: SessionDep, since: str | None = None) -> dict[str, Any]:
    """Aggregated usage per user/model — counts only, never any message content."""
    from datetime import datetime, timezone

    from app.usage import stats

    cutoff = None
    if since:
        try:
            cutoff = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "since must be ISO 8601")
        if cutoff.tzinfo is not None:
            cutoff = cutoff.astimezone(timezone.utc)
    return {"users": stats(session, cutoff)}


@admin_router.get("/chat")
def get_chat_cfg(_: AdminUser) -> dict[str, int]:
    from app import runtime

    return {"compact_pct": runtime.compact_pct()}


@admin_router.put("/chat")
def set_chat_cfg(body: dict[str, int], _: AdminUser) -> dict[str, int]:
    from app import runtime

    return runtime.set_chat(body)
