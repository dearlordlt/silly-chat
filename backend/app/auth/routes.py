"""Auth + admin routes.

Self-registration with manual approval. The FIRST registered user is auto-approved
and made admin (bootstrap); everyone after is pending until an admin approves them.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlmodel import func, select

from app.auth.deps import AdminUser, ApprovedUser, CurrentUser, SessionDep
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


def _set_session_cookie(response: Response, user_id: int) -> None:
    response.set_cookie(
        COOKIE_NAME,
        make_session_token(user_id),
        max_age=get_settings().auth.session_days * 86400,
        httponly=True,
        samesite="lax",
    )


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
    session.add(user)
    session.commit()
    session.refresh(user)

    # The bootstrap admin is logged in immediately; pending users are not.
    if is_first:
        _set_session_cookie(response, user.id)
    return {"first": is_first, "status": user.status}


@auth_router.post("/login")
def login(creds: Credentials, session: SessionDep, response: Response) -> UserOut:
    user = session.exec(select(User).where(User.username == creds.username)).first()
    if not user or not verify_password(creds.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    if user.status != "approved":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "account pending approval")
    _set_session_cookie(response, user.id)
    return UserOut(**user.model_dump())


@auth_router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@auth_router.get("/me")
def me(user: CurrentUser) -> UserOut | None:
    return UserOut(**user.model_dump()) if user else None


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
    return [UserOut(**u.model_dump()) for u in users]


@admin_router.post("/users/{user_id}/approve")
def approve_user(user_id: int, _: AdminUser, session: SessionDep) -> UserOut:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no such user")
    user.status = "approved"
    session.add(user)
    session.commit()
    session.refresh(user)
    return UserOut(**user.model_dump())


@admin_router.get("/models")
async def get_models(_: AdminUser) -> dict[str, Any]:
    from app import runtime
    from app.agent.models_catalog import available_models

    return {"current": runtime.current(), "available": await available_models()}


@admin_router.put("/models")
def set_models(body: dict[str, str], _: AdminUser) -> dict[str, str]:
    from app import runtime

    return runtime.set_overrides(body)
