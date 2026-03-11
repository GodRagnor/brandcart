from datetime import datetime

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose.exceptions import ExpiredSignatureError, JWTError

from database import get_db
from utils.jwt import ACCESS_TOKEN_TYPE, decode_token

security = HTTPBearer(auto_error=False)

ACCESS_COOKIE_NAME = "brandcart_access_token"
REFRESH_COOKIE_NAME = "brandcart_refresh_token"


def _extract_access_token(request: Request, credentials: HTTPAuthorizationCredentials | None) -> str:
    if credentials and credentials.credentials:
        return credentials.credentials
    return request.cookies.get(ACCESS_COOKIE_NAME) or ""


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db=Depends(get_db),
):
    token = _extract_access_token(request, credentials)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    try:
        payload = decode_token(token, expected_type=ACCESS_TOKEN_TYPE)
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token expired",
        )
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
        )

    phone = payload.get("sub")
    session_id = str(payload.get("sid") or "").strip()

    if not phone:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    now = datetime.utcnow()
    if session_id:
        session = await db.auth_sessions.find_one({
            "session_id": session_id,
            "user_phone": phone,
            "revoked_at": None,
            "expires_at": {"$gt": now},
        })
        if not session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired",
            )

        await db.auth_sessions.update_one(
            {"_id": session["_id"]},
            {"$set": {"last_seen_at": now}},
        )

    user = await db.users.find_one({"phone": phone})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_active_at": now}},
    )

    return user


def require_role(required_role: str):
    async def checker(user=Depends(get_current_user)):
        if user.get("role") != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return checker


def require_roles(*allowed_roles: str):
    allowed = {role for role in allowed_roles if role}

    async def checker(user=Depends(get_current_user)):
        if user.get("role") not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return checker


async def get_current_seller(
    user=Depends(get_current_user),
):
    if user.get("role") != "seller":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seller access only",
        )
    return user
