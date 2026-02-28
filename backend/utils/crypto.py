import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException

from config.env import BANK_DATA_ENCRYPTION_KEY, JWT_SECRET


def _build_fernet() -> Fernet:
    seed = (BANK_DATA_ENCRYPTION_KEY or JWT_SECRET or "").strip()
    if not seed:
        raise HTTPException(status_code=500, detail="Bank data encryption key is not configured")
    key = base64.urlsafe_b64encode(hashlib.sha256(seed.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_sensitive_value(value: str) -> str:
    if not value:
        raise HTTPException(status_code=400, detail="Sensitive value missing")
    token = _build_fernet().encrypt(value.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_sensitive_value(token: str) -> str:
    if not token:
        raise HTTPException(status_code=400, detail="Encrypted sensitive value missing")
    try:
        raw = _build_fernet().decrypt(token.encode("utf-8"))
    except InvalidToken:
        raise HTTPException(status_code=400, detail="Invalid encrypted sensitive value")
    return raw.decode("utf-8")
