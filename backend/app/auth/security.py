"""Password hashing + signed session tokens."""

from __future__ import annotations

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from pwdlib import PasswordHash

from app.config import get_settings

COOKIE_NAME = "silly_session"

_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _hasher.verify(password, password_hash)


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().session_secret, salt="silly-session")


def make_session_token(user_id: int, dk: bytes | None = None) -> str:
    """Signed session. Carries the user's chat data key (their own key — minted only
    at login, never stored server-side) SEALED under the app secret, so even the raw
    cookie value doesn't expose it."""
    from app.auth import crypto

    payload: dict = {"uid": user_id}
    if dk is not None:
        payload["dk"] = crypto.seal_for_secret(get_settings().session_secret, dk)
    return _serializer().dumps(payload)


def read_session_token(token: str) -> tuple[int, bytes | None] | None:
    from app.auth import crypto

    max_age = get_settings().auth.session_days * 86400
    try:
        data = _serializer().loads(token, max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None
    uid = data.get("uid")
    if not isinstance(uid, int):
        return None
    dk = None
    if isinstance(data.get("dk"), str):
        dk = crypto.open_for_secret(get_settings().session_secret, data["dk"])
    return uid, dk
