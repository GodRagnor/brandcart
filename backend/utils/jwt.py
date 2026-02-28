from datetime import datetime, timedelta
from jose import jwt
from config.env import JWT_SECRET, JWT_ALGORITHM, ACCESS_TOKEN_DAYS

def _require_jwt_secret() -> str:
    secret = (JWT_SECRET or "").strip()
    if not secret:
        raise RuntimeError("JWT_SECRET is not configured")
    return secret

def create_access_token(payload: dict) -> str:
    payload = payload.copy()
    payload.update({
        "exp": datetime.utcnow() + timedelta(days=ACCESS_TOKEN_DAYS),
        "iat": datetime.utcnow()
    })
    return jwt.encode(payload, _require_jwt_secret(), algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, _require_jwt_secret(), algorithms=[JWT_ALGORITHM])
