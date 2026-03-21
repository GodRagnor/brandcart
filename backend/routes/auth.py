from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
import logging
from typing import Optional
from pydantic import EmailStr
from uuid import uuid4

from jose.exceptions import ExpiredSignatureError, JWTError

from database import get_db
from utils.jwt import ACCESS_TOKEN_TYPE, REFRESH_TOKEN_TYPE, create_access_token, create_refresh_token, decode_token
from utils.security import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, get_current_user, require_role
from utils.otp import generate_otp, hash_otp
from utils.validators import normalize_phone
from utils.audit import log_audit
from utils.rate_limit import rate_limit
from utils.otp_notify import notify_otp
from config.env import (
    ADMIN_PHONE,
    AUTH_COOKIE_DOMAIN,
    AUTH_COOKIE_SAMESITE,
    AUTH_COOKIE_SECURE,
    BUYER_ACCESS_TOKEN_MINUTES,
    BUYER_REFRESH_TOKEN_DAYS,
    OTP_DEV_MODE,
    SELLER_ACCESS_TOKEN_MINUTES,
    SELLER_REFRESH_TOKEN_DAYS,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Auth"])

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

def _session_ttls_for_role(role: str) -> tuple[timedelta, timedelta]:
    normalized_role = (role or "").strip().lower()
    if normalized_role in {"seller", "admin", "delivery_partner"}:
        return (
            timedelta(minutes=SELLER_ACCESS_TOKEN_MINUTES),
            timedelta(days=SELLER_REFRESH_TOKEN_DAYS),
        )
    return (
        timedelta(minutes=BUYER_ACCESS_TOKEN_MINUTES),
        timedelta(days=BUYER_REFRESH_TOKEN_DAYS),
    )


def _set_auth_cookies(response: Response, *, access_token: str, refresh_token: str, access_ttl: timedelta, refresh_ttl: timedelta) -> None:
    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=AUTH_COOKIE_SECURE,
        samesite=AUTH_COOKIE_SAMESITE,
        max_age=max(1, int(access_ttl.total_seconds())),
        path="/",
        domain=AUTH_COOKIE_DOMAIN,
    )
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=AUTH_COOKIE_SECURE,
        samesite=AUTH_COOKIE_SAMESITE,
        max_age=max(1, int(refresh_ttl.total_seconds())),
        path="/api/auth",
        domain=AUTH_COOKIE_DOMAIN,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(
        key=ACCESS_COOKIE_NAME,
        path="/",
        secure=AUTH_COOKIE_SECURE,
        samesite=AUTH_COOKIE_SAMESITE,
        domain=AUTH_COOKIE_DOMAIN,
    )
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path="/api/auth",
        secure=AUTH_COOKIE_SECURE,
        samesite=AUTH_COOKIE_SAMESITE,
        domain=AUTH_COOKIE_DOMAIN,
    )


def _client_meta(request: Request) -> dict:
    forwarded_for = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    client_host = request.client.host if request.client else ""
    return {
        "ip": forwarded_for or client_host or None,
        "user_agent": request.headers.get("user-agent") or None,
    }


async def _create_session_tokens(*, db, user_id, phone: str, role: str, request: Request) -> tuple[str, str, timedelta, timedelta]:
    access_ttl, refresh_ttl = _session_ttls_for_role(role)
    now = datetime.utcnow()
    session_id = uuid4().hex
    refresh_token_id = uuid4().hex
    client_meta = _client_meta(request)

    await db.auth_sessions.insert_one({
        "session_id": session_id,
        "user_id": user_id,
        "user_phone": phone,
        "role": role,
        "refresh_token_id": refresh_token_id,
        "created_at": now,
        "last_seen_at": now,
        "expires_at": now + refresh_ttl,
        "revoked_at": None,
        "ip": client_meta["ip"],
        "user_agent": client_meta["user_agent"],
    })

    access_token = create_access_token(
        subject=phone,
        role=role,
        session_id=session_id,
        expires_delta=access_ttl,
    )
    refresh_token = create_refresh_token(
        subject=phone,
        role=role,
        session_id=session_id,
        token_id=refresh_token_id,
        expires_delta=refresh_ttl,
    )
    return access_token, refresh_token, access_ttl, refresh_ttl


def _normalize_phone_or_400(phone: str) -> str:
    try:
        return normalize_phone(phone)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

# ======================
# Send OTP
# ======================

@router.post("/send-otp", response_model=None)
async def send_otp(data: SendOtpRequest):
    db = get_db()
    phone = _normalize_phone_or_400(data.phone)

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

    # Send OTP via SMS/Email
    notification = await notify_otp(phone=phone, otp=otp)
    
    response = {
        "message": notification.get("message", "OTP sent"),
        "sms_sent": notification.get("sms_sent", False),
        "email_sent": notification.get("email_sent", False),
    }
    
    # In dev mode, return OTP for testing
    if OTP_DEV_MODE:
        response["otp"] = otp
        logger.warning(f"⚠️  OTP_DEV_MODE: OTP for {phone} is {otp}")
    
    if not OTP_DEV_MODE and not response["sms_sent"] and not response["email_sent"]:
        await db.otp_codes.delete_one({"phone": phone})
        raise HTTPException(status_code=502, detail="OTP could not be delivered. Check SMS/email provider configuration.")

    return response

# ======================
# Verify OTP (LOGIN)
# ======================

@router.post("/verify-otp")
async def verify_otp(data: VerifyOtpRequest, request: Request, response: Response):
    db = get_db()
    phone = _normalize_phone_or_400(data.phone)

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

    user_id = None
    if not user:
        user = {
            "phone": phone,
            "role": role,
            "seller_status": "none",
            "is_frozen": False,
            "cart": [],
            "wishlist": [],
            "created_at": datetime.utcnow(),
            "last_active_at": datetime.utcnow()
        }
        inserted = await db.users.insert_one(user)
        user_id = inserted.inserted_id
        user["_id"] = user_id
    else:
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"last_active_at": datetime.utcnow()}}
        )
        user_id = user["_id"]

    access_token, refresh_token, access_ttl, refresh_ttl = await _create_session_tokens(
        db=db,
        user_id=user_id,
        phone=phone,
        role=role,
        request=request,
    )
    _set_auth_cookies(
        response,
        access_token=access_token,
        refresh_token=refresh_token,
        access_ttl=access_ttl,
        refresh_ttl=refresh_ttl,
    )

    return {
        "message": "Login successful",
        "role": role,
        "phone": phone,
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


@router.post("/refresh")
async def refresh_session(request: Request, response: Response):
    db = get_db()
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME) or ""
    if not refresh_token:
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Refresh token missing")

    try:
        payload = decode_token(refresh_token, expected_type=REFRESH_TOKEN_TYPE)
    except ExpiredSignatureError:
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except (JWTError, ValueError):
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    phone = payload.get("sub")
    session_id = str(payload.get("sid") or "").strip()
    refresh_token_id = str(payload.get("jti") or "").strip()
    if not phone or not session_id or not refresh_token_id:
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Invalid refresh token payload")

    now = datetime.utcnow()
    session = await db.auth_sessions.find_one({
        "session_id": session_id,
        "user_phone": phone,
        "revoked_at": None,
        "expires_at": {"$gt": now},
    })
    if not session or session.get("refresh_token_id") != refresh_token_id:
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Refresh session expired")

    user = await db.users.find_one({"phone": phone})
    if not user:
        await db.auth_sessions.update_one(
            {"_id": session["_id"]},
            {"$set": {"revoked_at": now, "expires_at": now}},
        )
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="User not found")

    role = "admin" if phone == ADMIN_PHONE else (user.get("role") or session.get("role") or "buyer")
    access_ttl, refresh_ttl = _session_ttls_for_role(role)
    next_refresh_token_id = uuid4().hex

    await db.auth_sessions.update_one(
        {"_id": session["_id"]},
        {"$set": {
            "role": role,
            "refresh_token_id": next_refresh_token_id,
            "last_seen_at": now,
            "expires_at": now + refresh_ttl,
            "ip": _client_meta(request)["ip"],
            "user_agent": _client_meta(request)["user_agent"],
        }},
    )

    access_token = create_access_token(
        subject=phone,
        role=role,
        session_id=session_id,
        expires_delta=access_ttl,
    )
    next_refresh_token = create_refresh_token(
        subject=phone,
        role=role,
        session_id=session_id,
        token_id=next_refresh_token_id,
        expires_delta=refresh_ttl,
    )
    _set_auth_cookies(
        response,
        access_token=access_token,
        refresh_token=next_refresh_token,
        access_ttl=access_ttl,
        refresh_ttl=refresh_ttl,
    )

    return {
        "message": "Session refreshed",
        "role": role,
        "phone": phone,
    }


@router.post("/logout")
async def logout(request: Request, response: Response):
    db = get_db()
    now = datetime.utcnow()
    session_id = ""

    for token_name, expected_type in (
        (ACCESS_COOKIE_NAME, ACCESS_TOKEN_TYPE),
        (REFRESH_COOKIE_NAME, REFRESH_TOKEN_TYPE),
    ):
        token = request.cookies.get(token_name) or ""
        if not token:
            continue
        try:
            payload = decode_token(token, expected_type=expected_type)
        except Exception:
            continue
        session_id = str(payload.get("sid") or "").strip()
        if session_id:
            break

    if session_id:
        await db.auth_sessions.update_one(
            {"session_id": session_id, "revoked_at": None},
            {"$set": {"revoked_at": now, "expires_at": now}},
        )

    _clear_auth_cookies(response)
    return {"message": "Logged out"}


@router.get("/seller-request-status")
async def seller_request_status(user=Depends(get_current_user)):
    seller_request = user.get("seller_request") or {}
    seller_profile = user.get("seller_profile") or {}

    request_payload = None
    if seller_request:
        docs = seller_request.get("documents") or {}
        request_payload = {
            "legal_name": seller_request.get("legal_name"),
            "brand_name": seller_request.get("brand_name"),
            "category": seller_request.get("category"),
            "description": seller_request.get("description"),
            "email": seller_request.get("email"),
            "logo_url": seller_request.get("logo_url"),
            "documents": {
                "pan_card": docs.get("pan_card"),
                "gst_certificate": docs.get("gst_certificate"),
                "address_proof": docs.get("address_proof"),
            },
        }

    profile_payload = None
    if seller_profile:
        profile_payload = {
            "brand_name": seller_profile.get("brand_name"),
            "slug": seller_profile.get("slug"),
            "category": seller_profile.get("category"),
        }

    return {
        "role": user.get("role"),
        "seller_status": user.get("seller_status", "none"),
        "requested_at": user.get("seller_requested_at"),
        "rejected_at": user.get("seller_rejected_at"),
        "rejected_reason": user.get("seller_rejected_reason"),
        "verified_at": user.get("seller_verified_at"),
        "request": request_payload,
        "seller_profile": profile_payload,
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
