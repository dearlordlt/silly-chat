"""Auth dependencies: resolve and gate the current user."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session

from app.auth.security import COOKIE_NAME, read_session_token
from app.db import get_session
from app.models import User

SessionDep = Annotated[Session, Depends(get_session)]


def current_user(request: Request, session: SessionDep) -> User | None:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    uid = read_session_token(token)
    if uid is None:
        return None
    return session.get(User, uid)


CurrentUser = Annotated[User | None, Depends(current_user)]


def require_approved(user: CurrentUser) -> User:
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not logged in")
    if user.status != "approved":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "account pending approval")
    return user


def require_admin(user: Annotated[User, Depends(require_approved)]) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin only")
    return user


ApprovedUser = Annotated[User, Depends(require_approved)]
AdminUser = Annotated[User, Depends(require_admin)]
