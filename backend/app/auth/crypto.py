"""Per-user chat encryption primitives.

Design (the "wrap" pattern):
  - Each user gets one random 32-byte DATA KEY (DK). Conversations are encrypted
    with the DK (AES-256-GCM), so changing a password never re-encrypts data.
  - The DK is stored only WRAPPED: once under a key derived from the password,
    once under a key derived from the recovery key. The server never stores a
    usable key at rest — someone with the DB (including the admin) sees ciphertext.
  - At login (the only moment the password exists in plaintext) the DK is
    unwrapped and placed in the signed session token, so requests can decrypt.
  - Forgot password: the recovery key unwraps the DK and re-wraps it under the
    new password. Lose both → the data is unrecoverable, by design.
"""

from __future__ import annotations

import base64
import hashlib
import json
import secrets

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode()


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s.encode())


def _kdf(secret: str, salt: bytes) -> bytes:
    """scrypt — memory-hard, stdlib, fine at login frequency."""
    return hashlib.scrypt(secret.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)


def new_data_key() -> bytes:
    return secrets.token_bytes(32)


def new_recovery_key() -> str:
    """Human-friendly one-time code: 6 groups of 5 base32 chars (~150 bits)."""
    raw = base64.b32encode(secrets.token_bytes(19)).decode().rstrip("=").lower()
    return "-".join(raw[i : i + 5] for i in range(0, 30, 5))


def canon_recovery(s: str) -> str:
    """Normalize user-typed recovery keys (case, spaces, missing dashes)."""
    raw = "".join(ch for ch in s.lower() if ch.isalnum())
    return "-".join(raw[i : i + 5] for i in range(0, len(raw), 5))


def _seal(key: bytes, plaintext: bytes) -> str:
    nonce = secrets.token_bytes(12)
    return _b64e(nonce + AESGCM(key).encrypt(nonce, plaintext, None))


def _open(key: bytes, blob: str) -> bytes | None:
    try:
        raw = _b64d(blob)
        return AESGCM(key).decrypt(raw[:12], raw[12:], None)
    except (InvalidTag, ValueError):
        return None


def wrap_dk(dk: bytes, secret: str) -> str:
    """Wrap the data key under a password/recovery secret → 'salt.blob'."""
    salt = secrets.token_bytes(16)
    return f"{_b64e(salt)}.{_seal(_kdf(secret, salt), dk)}"


def unwrap_dk(wrapped: str, secret: str) -> bytes | None:
    try:
        salt_s, blob = wrapped.split(".", 1)
    except ValueError:
        return None
    return _open(_kdf(secret, _b64d(salt_s)), blob)


def encrypt_json(dk: bytes, obj: object) -> str:
    return _seal(dk, json.dumps(obj, separators=(",", ":")).encode())


def decrypt_json(dk: bytes, blob: str) -> object | None:
    raw = _open(dk, blob)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return None
