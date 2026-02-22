from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from enum import Enum

class SellerTier(str, Enum):
    STANDARD = "standard"
    VERIFIED_FAST = "verified_fast"
    PREMIUM = "premium"


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: Optional[str] = "buyer"   # buyer | seller


class UserInDB(BaseModel):
    email: EmailStr
    password: str
    role: str

    # seller lifecycle
    seller_status: Optional[str] = None

    # seller trust & payout contract
    seller_tier: SellerTier = SellerTier.STANDARD
    settlement_hours: int = 72
    commission_percent: float = 8.0

    created_at: datetime
    last_active_at: datetime
