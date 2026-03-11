from datetime import datetime, timedelta

from jose import jwt

from config.env import JWT_ALGORITHM, JWT_SECRET

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"


def _require_jwt_secret() -> str:
    secret = (JWT_SECRET or "").strip()
    if not secret:
        raise RuntimeError("JWT_SECRET is not configured")
    return secret


def _create_token(*, payload: dict, expires_delta: timedelta) -> str:
    now = datetime.utcnow()
    token_payload = payload.copy()
    token_payload.update({
        "exp": now + expires_delta,
        "iat": now,
    })
    return jwt.encode(token_payload, _require_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_access_token(*, subject: str, role: str, session_id: str, expires_delta: timedelta) -> str:
    return _create_token(
        payload={
            "sub": subject,
            "role": role,
            "sid": session_id,
            "typ": ACCESS_TOKEN_TYPE,
        },
        expires_delta=expires_delta,
    )


def create_refresh_token(*, subject: str, role: str, session_id: str, token_id: str, expires_delta: timedelta) -> str:
    return _create_token(
        payload={
            "sub": subject,
            "role": role,
            "sid": session_id,
            "jti": token_id,
            "typ": REFRESH_TOKEN_TYPE,
        },
        expires_delta=expires_delta,
    )


def decode_token(token: str, *, expected_type: str | None = None) -> dict:
    payload = jwt.decode(token, _require_jwt_secret(), algorithms=[JWT_ALGORITHM])
    token_type = payload.get("typ")
    if expected_type and token_type and token_type != expected_type:
        raise ValueError("Invalid token type")
    return payload
