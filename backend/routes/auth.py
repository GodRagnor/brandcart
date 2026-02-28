from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
import random, hashlib, os
from typing import Optional
from pydantic import EmailStr
import re

from database import get_db
from utils.jwt import create_access_token
from utils.security import get_current_user, require_role
from utils.validators import normalize_phone
from utils.audit import log_audit
from utils.rate_limit import rate_limit

router = APIRouter(prefix="/api/auth", tags=["Auth"])

ADMIN_PHONE = os.getenv("ADMIN_PHONE")

OTP_EXPIRY_MINUTES = 5
OTP_MAX_ATTEMPTS = 5

# ======================
# Schemas
# ======================

class SendOtpRequest(BaseModel):
    phone: str

class VerifyOtpRequest(BaseModel):
    phone: str
    otp: str

# ======================
# Helpers
# ======================

def generate_otp() -> str:
    return str(random.randint(100000, 999999))

def hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()

# ======================
# Send OTP
# ======================

@router.post("/send-otp", response_model=None)
async def send_otp(data: SendOtpRequest):
    db = get_db()
    phone = normalize_phone(data.phone)

    await rate_limit(
        db=db,
        key=f"otp:{phone}",
        max_requests=3,
        window_seconds=300,  # 3 OTPs per 5 minutes
    )

    otp = generate_otp()
    otp_hash = hash_otp(otp)

    await db.otp_codes.update_one(
        {"phone": phone},
        {"$set": {
            "otp_hash": otp_hash,
            "expires_at": datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES),
            "attempts": 0,
            "created_at": datetime.utcnow(),
        }},
        upsert=True
    )

    return {"message": "OTP sent"}

# ======================
# Verify OTP (LOGIN)
# ======================

@router.post("/verify-otp")
async def verify_otp(data: VerifyOtpRequest):
    db = get_db()
    phone = normalize_phone(data.phone)

    otp_doc = await db.otp_codes.find_one({"phone": phone})
    if not otp_doc:
        raise HTTPException(400, "OTP not found")

    if otp_doc.get("expires_at") and datetime.utcnow() > otp_doc["expires_at"]:
        await db.otp_codes.delete_one({"phone": phone})
        raise HTTPException(400, "OTP expired")

    if otp_doc.get("attempts", 0) >= OTP_MAX_ATTEMPTS:
        await db.otp_codes.delete_one({"phone": phone})
        raise HTTPException(429, "Too many OTP attempts. Please request a new OTP.")

    if otp_doc["otp_hash"] != hash_otp(data.otp):
        await db.otp_codes.update_one(
            {"phone": phone},
            {"$inc": {"attempts": 1}},
        )
        raise HTTPException(400, "Invalid OTP")

    await db.otp_codes.delete_one({"phone": phone})

    user = await db.users.find_one({"phone": phone})

    role = "admin" if phone == ADMIN_PHONE else (user.get("role") if user else "buyer")

    if not user:
        user = {
            "phone": phone,
            "role": role,
            "seller_status": "none",
            "is_frozen": False,
            "created_at": datetime.utcnow(),
            "last_active_at": datetime.utcnow()
        }
        await db.users.insert_one(user)
    else:
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"last_active_at": datetime.utcnow()}}
        )

    token = create_access_token({
        "sub": phone,
        "role": role
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": role
    }

# ======================
# Current User
# ======================

@router.get("/me")
async def me(user=Depends(get_current_user)):
    return {
        "phone": user["phone"],
        "role": user["role"],
        "is_frozen": user.get("is_frozen", False)
    }

# -----------------------
# REGEX PATTERNS
# -----------------------
PAN_PATTERN = r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$"
GST_PATTERN = r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"

# -----------------------
# SELLER DOCUMENTS
# -----------------------
class SellerDocuments(BaseModel):
    pan_card: str = Field(
        ...,
        pattern=PAN_PATTERN,
        description="PAN number (e.g. ABCDE1234F)"
    )
    gst_certificate: str = Field(
        ...,
        pattern=GST_PATTERN,
        description="GST number (e.g. 22ABCDE1234F1Z5)"
    )
    address_proof: str = Field(
        ...,
        min_length=3,
        description="URL or file ID for address proof"
    )


# -----------------------
# SELLER REQUEST PAYLOAD
# -----------------------

class SellerRequestData(BaseModel):
    legal_name: str
    brand_name: str
    category: str
    description: Optional[str] = ""
    email: EmailStr | None = None   # ✅ NEW
    documents: SellerDocuments
    logo_url: str | None = None

# ------------------------------
# REQUEST SELLER (BUYER)
# ------------------------------

@router.post("/request-seller")
async def request_seller(
    data: SellerRequestData,
    user=Depends(require_role("buyer")),
):
    db = get_db()

    await rate_limit(
        db=db,
        key=f"seller_request:{user['_id']}",
        max_requests=1,
        window_seconds=86400,  # once per day
    )

    email = data.email or user.get("email")

    if user.get("seller_status") == "requested":
        raise HTTPException(status_code=400, detail="Seller request already pending")

    if user.get("seller_status") == "verified":
        raise HTTPException(status_code=400, detail="Already a seller")

    # -------------------------
    # 🔒 SANITIZE LOGO
    # -------------------------
    logo = data.logo_url

    if logo and not logo.startswith(("http://", "https://", "/")):
        logo = None

    # -------------------------
    # Build seller_profile
    # -------------------------
    seller_profile = {
        "legal_name": data.legal_name,
        "brand_name": data.brand_name,
        "slug": data.brand_name.lower().replace(" ", "-"),
        "category": data.category,
        "description": data.description,
        "email": email,
        "documents": data.documents.dict(),
        "logo_url": logo,
        "trust": {
            "score": 0,
            "reviews": 0,
        },
    }

    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "seller_status": "requested",
                "seller_request": seller_profile,
                "seller_requested_at": datetime.utcnow(),
            }
        },
    )

    await log_audit(
        db=db,
        actor_id=str(user["_id"]),
        actor_role="buyer",
        action="SELLER_REQUESTED",
        metadata={
            "brand_name": data.brand_name,
            "email": email,
        },
    )

    return {"message": "Seller request submitted"}


# ===============================
# ROLE TESTS
# ===============================
@router.get("/buyer-only")
async def buyer_only(user=Depends(require_role("buyer"))):
    return {"message": "Buyer access OK"}

@router.get("/seller-only")
async def seller_only(user=Depends(require_role("seller"))):
    return {"message": "Seller access OK"}
