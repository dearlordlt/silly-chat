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
    parsed = read_session_token(token)
    if parsed is None:
        return None
    uid, dk = parsed
    user = session.get(User, uid)
    # Encryption enabled but this session predates it (no key aboard): force a
    # fresh login so the token can carry the data key.
    if user is not None and user.wrapped_dk and dk is None:
        return None
    request.state.dk = dk
    return user


def session_key(request: Request) -> bytes | None:
    """The requester's chat data key (from their session token), if any."""
    return getattr(request.state, "dk", None)


CurrentUser = Annotated[User | None, Depends(current_user)]
SessionKey = Annotated[bytes | None, Depends(session_key)]


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
