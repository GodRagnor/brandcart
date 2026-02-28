from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime

from utils.jwt import decode_token
from database import get_db

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db=Depends(get_db),
):
    token = credentials.credentials
    payload = decode_token(token)

    phone = payload.get("sub")

    if not phone:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user = await db.users.find_one({"phone": phone})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # Update last activity
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_active_at": datetime.utcnow()}}
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

async def get_current_seller(
    user=Depends(get_current_user),
):
    if user.get("role") != "seller":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seller access only",
        )
    return user
