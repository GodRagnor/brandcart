from datetime import datetime, timedelta
from jose import jwt
import os

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_DAYS = 30  # login valid for 30 days

def create_access_token(payload: dict) -> str:
    payload = payload.copy()
    payload.update({
        "exp": datetime.utcnow() + timedelta(days=ACCESS_TOKEN_DAYS),
        "iat": datetime.utcnow()
    })
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
