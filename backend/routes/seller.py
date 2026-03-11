from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional
from bson import ObjectId

from database import get_db
from utils.security import require_role
from utils.audit import log_audit
from utils.security import get_current_seller
from utils.wallet_service import get_wallet_balance
from utils.trust import SELLER_TIER_CONFIG
from config.env import EMERGENCY_PAYOUT_FEE_PERCENT, EMERGENCY_PAYOUT_FEE_FLAT
from utils.crypto import encrypt_sensitive_value
from utils.validators import normalize_phone
from utils.guards import parse_object_id
from utils.order_timeline import record_order_event
from routes.auth import SellerDocuments

router = APIRouter(
    prefix="/api/seller",
    tags=["Seller"]
)


# ======================================================
# SCHEMAS
# ======================================================

class SellerProfileUpdate(BaseModel):
    short_tagline: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    support_email: Optional[str] = None

class ServiceableRegion(BaseModel):
    state: str = Field(..., min_length=2, max_length=80)
    city: Optional[str] = Field(default=None, min_length=2, max_length=80)
    delivery_enabled: bool = True
    cod_enabled: bool = False

class SellerReturnAction(BaseModel):
    action: str  # approve | reject
    reason: str | None = None


class SellerOfferCreate(BaseModel):
    product_id: str
    offer_price: float = Field(..., gt=0)
    start_at: datetime
    end_at: datetime
    festival_slug: Optional[str] = None


class EmergencyPayoutRequest(BaseModel):
    amount: float = Field(..., gt=0)
    account_holder_name: Optional[str] = Field(default=None, min_length=3, max_length=120)
    bank_account_number: Optional[str] = Field(default=None, min_length=9, max_length=24)
    ifsc_code: Optional[str] = Field(default=None, min_length=11, max_length=11)
    bank_name: Optional[str] = None


class SellerBankAccountPayload(BaseModel):
    account_holder_name: str = Field(..., min_length=3, max_length=120)
    bank_account_number: str = Field(..., min_length=9, max_length=24)
    ifsc_code: str = Field(..., min_length=11, max_length=11)
    bank_name: Optional[str] = None


class DeliveryPartnerCreatePayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    phone: str = Field(..., min_length=10, max_length=20)
    email: Optional[str] = Field(default=None, max_length=120)
    vehicle_type: Optional[str] = Field(default=None, max_length=40)
    service_area: Optional[str] = Field(default=None, max_length=160)
    notes: Optional[str] = Field(default=None, max_length=240)


class DeliveryPartnerAssignPayload(BaseModel):
    partner_id: str = Field(..., min_length=8, max_length=64)


class ExternalShipmentPayload(BaseModel):
    partner_id: str = Field(..., min_length=8, max_length=64)
    tracking_number: str = Field(..., min_length=4, max_length=80)
    tracking_url: Optional[str] = Field(default=None, max_length=400)


class ShipmentStatusPayload(BaseModel):
    status: str = Field(..., min_length=3, max_length=32)
    message: Optional[str] = Field(default=None, max_length=200)


def mask_phone(value: str) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if len(digits) >= 4:
        return f"******{digits[-4:]}"
    return "******"


def clean_optional_text(value: Optional[str], *, lower: bool = False) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text.lower() if lower else text


def serialize_delivery_partner(row: dict) -> dict:
    partner_user_id = row.get("partner_user_id")
    partner_user_id_str = None
    if isinstance(partner_user_id, ObjectId):
        partner_user_id_str = str(partner_user_id)
    elif partner_user_id:
        partner_user_id_str = str(partner_user_id).strip() or None

    portal_access_status = row.get("portal_access_status") or ("ready" if partner_user_id_str else "action_required")
    portal_access_message = row.get("portal_access_message") or (
        "Partner can log in with OTP using this phone."
        if partner_user_id_str
        else "Use a dedicated delivery partner phone to enable portal login."
    )

    return {
        "id": str(row["_id"]),
        "name": row.get("name"),
        "phone": row.get("phone"),
        "phone_masked": row.get("phone_masked"),
        "email": row.get("email"),
        "source": row.get("source") or "seller_custom",
        "code": row.get("code"),
        "partner_user_id": partner_user_id_str,
        "vehicle_type": row.get("vehicle_type"),
        "service_area": row.get("service_area"),
        "notes": row.get("notes"),
        "portal_access_status": portal_access_status,
        "portal_access_message": portal_access_message,
        "is_active": bool(row.get("is_active", True)),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def serialize_shipping_catalog_partner(row: dict) -> dict:
    return {
        "id": str(row["_id"]),
        "code": row.get("code"),
        "name": row.get("name"),
        "email": row.get("email"),
        "phone_masked": row.get("phone_masked"),
        "rating": row.get("rating"),
        "coverage": row.get("coverage"),
        "provider_type": "third_party_courier",
    }


def serialize_order_shipping(order: dict) -> dict:
    shipping_partner = order.get("shipping_partner") or {}
    shipment = order.get("shipment") or {}

    partner_id = shipping_partner.get("id") or shipping_partner.get("_id")
    if isinstance(partner_id, ObjectId):
        partner_id = str(partner_id)
    elif partner_id:
        partner_id = str(partner_id)
    else:
        partner_id = None

    return {
        "partner_id": partner_id,
        "partner_name": shipping_partner.get("name"),
        "partner_code": shipping_partner.get("code"),
        "provider_type": shipping_partner.get("provider_type") or "third_party_courier",
        "tracking_number": shipment.get("tracking_number"),
        "tracking_url": shipment.get("tracking_url"),
        "booked_at": shipment.get("booked_at"),
        "last_status_sync_at": shipment.get("last_status_sync_at"),
    }


def serialize_wallet_payout_request(row: dict) -> dict:
    bank_details = row.get("bank_details") or {}
    request_id = row.get("_id")
    return {
        "id": str(request_id) if request_id else None,
        "type": row.get("type") or "emergency",
        "method": row.get("method"),
        "status": row.get("status"),
        "amount": row.get("amount", 0),
        "settlement_fee": row.get("settlement_fee", 0),
        "total_debit": row.get("total_debit", row.get("amount", 0)),
        "requested_at": row.get("requested_at"),
        "reviewed_at": row.get("reviewed_at"),
        "review_reason": row.get("review_reason"),
        "failure_reason": row.get("failure_reason"),
        "rejected_at": row.get("rejected_at"),
        "retried_at": row.get("retried_at"),
        "reconciled_at": row.get("reconciled_at"),
        "transfer_processed_at": row.get("transfer_processed_at"),
        "transfer_reference": row.get("transfer_reference"),
        "provider": row.get("provider"),
        "provider_payout_id": row.get("provider_payout_id"),
        "provider_payout_status": row.get("provider_payout_status"),
        "hold_released_at": row.get("hold_released_at"),
        "bank_details": {
            "account_holder_name": bank_details.get("account_holder_name"),
            "bank_account_masked": bank_details.get("bank_account_masked"),
            "ifsc_code": bank_details.get("ifsc_code"),
            "bank_name": bank_details.get("bank_name"),
        } if bank_details else None,
    }


async def ensure_delivery_partner_account(
    db,
    *,
    phone: str,
    name: str,
    email: Optional[str],
    vehicle_type: Optional[str],
    service_area: Optional[str],
    notes: Optional[str],
):
    now = datetime.utcnow()
    profile = {
        "name": name,
        "vehicle_type": vehicle_type,
        "service_area": service_area,
        "notes": notes,
    }
    if email:
        profile["email"] = email

    user = await db.users.find_one({"phone": phone})
    if not user:
        result = await db.users.insert_one({
            "phone": phone,
            "role": "delivery_partner",
            "delivery_partner_profile": profile,
            "is_frozen": False,
            "created_at": now,
            "last_active_at": now,
        })
        return result.inserted_id, "ready", "Partner can log in with OTP using this phone."

    if user.get("role") == "delivery_partner":
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {
                "delivery_partner_profile": profile,
                "updated_at": now,
            }},
        )
        if user.get("is_frozen"):
            return user["_id"], "restricted", "Partner account is frozen and cannot log in right now."
        return user["_id"], "ready", "Partner can log in with OTP using this phone."

    existing_role = str(user.get("role") or "buyer").strip().lower() or "buyer"
    return None, "action_required", f"Phone is already linked to a {existing_role} account. Use a dedicated delivery partner number."


DEFAULT_DELIVERY_APP_PARTNERS = [
    {
        "code": "shiprocket",
        "name": "Shiprocket Express",
        "email": "ops@shiprocket.partner",
        "phone": "+919820000001",
        "rating": 4.6,
        "coverage": "All India",
    },
    {
        "code": "delhivery",
        "name": "Delhivery Surface",
        "email": "ops@delhivery.partner",
        "phone": "+919820000002",
        "rating": 4.5,
        "coverage": "All India",
    },
    {
        "code": "xpressbees",
        "name": "Xpressbees Priority",
        "email": "ops@xpressbees.partner",
        "phone": "+919820000003",
        "rating": 4.3,
        "coverage": "Metro + Tier 2/3",
    },
]


async def ensure_delivery_app_partner_catalog(db, create_partner_accounts: bool = True):
    total = await db.delivery_app_partners.count_documents({})
    now = datetime.utcnow()

    if total == 0:
        seed_docs = []
        for row in DEFAULT_DELIVERY_APP_PARTNERS:
            try:
                normalized_phone = normalize_phone(row["phone"])
            except ValueError:
                continue
            seed_docs.append({
                "code": row["code"],
                "name": row["name"],
                "email": row.get("email"),
                "phone": normalized_phone,
                "phone_masked": mask_phone(normalized_phone),
                "rating": float(row.get("rating") or 0),
                "coverage": row.get("coverage") or "All India",
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            })
        if seed_docs:
            await db.delivery_app_partners.insert_many(seed_docs)

    if not create_partner_accounts:
        return

    # Ensure each catalog partner has a delivery_partner login account.
    catalog_rows = await db.delivery_app_partners.find({}, {"_id": 1, "name": 1, "phone": 1, "code": 1}).to_list(300)
    for row in catalog_rows:
        phone = row.get("phone")
        if not phone:
            continue

        user = await db.users.find_one({"phone": phone})
        partner_user_id = None
        if not user:
            result = await db.users.insert_one({
                "phone": phone,
                "role": "delivery_partner",
                "delivery_partner_profile": {
                    "name": row.get("name"),
                    "company_code": row.get("code"),
                },
                "is_frozen": False,
                "created_at": now,
                "last_active_at": now,
            })
            partner_user_id = result.inserted_id
        elif user.get("role") == "delivery_partner":
            partner_user_id = user.get("_id")

        if partner_user_id:
            await db.delivery_app_partners.update_one(
                {"_id": row["_id"]},
                {"$set": {
                    "partner_user_id": partner_user_id,
                    "updated_at": datetime.utcnow(),
                }},
            )


async def finalize_external_delivery(db, *, order: dict, seller_id, message: Optional[str] = None):
    if order.get("delivered_at"):
        raise HTTPException(400, "Order already delivered")

    product = await db.products.find_one({"_id": order["product_id"]})
    if not product:
        raise HTTPException(404, "Product not found")

    qty = order.get("quantity", 0)
    if product.get("reserved_stock", 0) < qty:
        raise HTTPException(409, "Reserved stock corrupted")

    now = datetime.utcnow()
    payment = order.get("payment") or {}
    delivered_message = message or "Courier updated order as delivered"

    await db.products.update_one(
        {"_id": product["_id"]},
        {"$inc": {"reserved_stock": -qty}}
    )

    await db.orders.update_one(
        {"_id": order["_id"]},
        {
            "$set": {
                "status": "delivered",
                "delivered_at": now,
                "payment.status": "cod_pending" if payment.get("method") == "COD" else "paid",
                "settlement.status": "pending",
                "settlement.settled_at": None,
                "shipment.last_status_sync_at": now,
                "updated_at": now,
            },
            "$unset": {
                "delivery_partner": "",
                "delivery_otp_hash": "",
                "delivery_otp_encrypted": "",
                "delivery_otp_generated_at": "",
            },
            "$push": {
                "tracking": {
                    "status": "DELIVERED",
                    "message": delivered_message,
                    "at": now,
                }
            }
        }
    )

    await record_order_event(
        db=db,
        order_id=order["_id"],
        event="ORDER_DELIVERED",
        actor_role="seller",
        actor_id=seller_id,
        metadata={"mode": "third_party_courier"},
    )

    buyer_notice = {
        "type": "delivery_update",
        "title": "Order delivered",
        "message": "Your order was marked delivered by the courier",
        "order_id": str(order["_id"]),
        "created_at": now,
        "read": False,
    }
    await db.users.update_one(
        {"_id": order["buyer_id"]},
        {"$push": {"buyer_notifications": {"$each": [buyer_notice], "$slice": -100}}},
    )

    return now

# ----------------------------------------
# SELLER PROFILE
# ----------------------------------------

@router.get("/profile")
async def seller_profile(
    seller=Depends(require_role("seller"))
):
    db = get_db()

    profile = seller.get("seller_profile")
    if not profile:
        raise HTTPException(status_code=404, detail="Seller profile not found")

    # -------------------------
    # Sanitize logo for frontend (Next/Image strict mode)
    # -------------------------
    logo = profile.get("logo_url")

    if logo and not logo.startswith(("http://", "https://", "/")):
        logo = None

    return {
        "seller_id": str(seller["_id"]),

        "brand": {
            "legal_name": profile.get("legal_name"),
            "brand_name": profile.get("brand_name"),
            "short_tagline": profile.get("short_tagline"),
            "description": profile.get("description"),
            "email": profile.get("email"),
            "logo_url": logo,
        },

        "public": {
            "slug": seller.get("slug"),
        },

        "verification": {
            "pan_verified": seller.get("pan_verified", False),
            "gst_verified": seller.get("gst_verified", False),
            "address_verified": seller.get("address_verified", False),
        },

        "status": {
            "seller_status": seller.get("seller_status"),
            "is_frozen": seller.get("is_frozen", False),
            "all_india": bool(seller.get("serviceability_all_india", False)),
            "cod_enabled": bool(
                seller.get("cod_settings", {}).get("enabled", False)
                or seller.get("cod_enabled", False)
            ),
        },
    }



@router.patch("/profile")
async def update_seller_profile(
    data: SellerProfileUpdate,
    seller=Depends(require_role("seller"))
):
    db = get_db()

    updates = {"updated_at": datetime.utcnow()}
    if data.logo_url is not None:
        updates["seller_profile.logo_url"] = data.logo_url
    if data.description is not None:
        updates["seller_profile.description"] = data.description
    if data.short_tagline is not None:
        updates["seller_profile.short_tagline"] = data.short_tagline
    if data.support_email is not None:
        updates["seller_profile.email"] = data.support_email

    await db.users.update_one(
        {"_id": seller["_id"]},
        {
            "$set": updates
        }
    )

    await log_audit(
        db,
        actor_id=str(seller["_id"]),
        actor_role="seller",
        action="SELLER_PROFILE_UPDATED"
    )

    return {"message": "Seller profile updated"}


@router.post("/bank-account")
async def upsert_seller_bank_account(
    data: SellerBankAccountPayload,
    seller=Depends(require_role("seller"))
):
    db = get_db()

    account_holder_name = data.account_holder_name.strip()
    bank_account_number = data.bank_account_number.strip()
    ifsc_code = data.ifsc_code.strip().upper()
    bank_name = data.bank_name.strip() if data.bank_name else None

    if not account_holder_name:
        raise HTTPException(400, "Account holder name is required")
    if not bank_account_number.isdigit():
        raise HTTPException(400, "Invalid bank account number")
    if not ifsc_code.isalnum() or len(ifsc_code) != 11:
        raise HTTPException(400, "Invalid IFSC code")

    await db.users.update_one(
        {"_id": seller["_id"]},
        {
            "$set": {
                "seller_bank_account": {
                    "account_holder_name": account_holder_name,
                    "bank_account_encrypted": encrypt_sensitive_value(bank_account_number),
                    "bank_account_masked": f"****{bank_account_number[-4:]}",
                    "ifsc_code": ifsc_code,
                    "bank_name": bank_name,
                    "updated_at": datetime.utcnow(),
                },
                "updated_at": datetime.utcnow(),
            }
        },
    )

    await log_audit(
        db,
        actor_id=str(seller["_id"]),
        actor_role="seller",
        action="SELLER_BANK_ACCOUNT_UPDATED",
    )

    return {
        "message": "Seller bank account updated",
        "bank_account": {
            "account_holder_name": account_holder_name,
            "bank_account_masked": f"****{bank_account_number[-4:]}",
            "ifsc_code": ifsc_code,
            "bank_name": bank_name,
        },
    }


@router.get("/bank-account")
async def get_seller_bank_account(
    seller=Depends(require_role("seller"))
):
    bank = seller.get("seller_bank_account") or {}
    return {
        "exists": bool(bank),
        "bank_account": {
            "account_holder_name": bank.get("account_holder_name"),
            "bank_account_masked": bank.get("bank_account_masked"),
            "ifsc_code": bank.get("ifsc_code"),
            "bank_name": bank.get("bank_name"),
            "updated_at": bank.get("updated_at"),
        } if bank else None,
    }


# ======================================================
# SELLER DOCUMENTS (KYC)
# ======================================================

@router.post("/documents")
async def submit_documents(
    data: SellerDocuments,
    seller=Depends(require_role("seller"))
):
    if seller.get("seller_status") != "verified":
        raise HTTPException(
            status_code=403,
            detail="Seller not approved"
        )

    db = get_db()

    await db.users.update_one(
        {"_id": seller["_id"]},
        {
            "$set": {
                "seller_profile.documents": data.dict(exclude_none=True),
                "seller_profile.documents_submitted": True,
                "updated_at": datetime.utcnow()
            }
        }
    )

    await log_audit(
        db,
        actor_id=str(seller["_id"]),
        actor_role="seller",
        action="SELLER_DOCUMENTS_SUBMITTED"
    )

    return {"message": "Documents submitted successfully"}


@router.post("/serviceable-regions")
async def set_serviceable_regions(
    regions: List[ServiceableRegion],
    seller=Depends(require_role("seller"))
):
    if seller.get("seller_status") != "verified":
        raise HTTPException(403, "Seller not verified")

    if seller.get("is_frozen"):
        raise HTTPException(403, "Seller account frozen")

    unique = {}
    for region in regions:
        state = (region.state or "").strip()
        city = (region.city or "").strip()
        if not state:
            continue
        key = f"{state.lower()}::{city.lower()}"
        unique[key] = {
            "state": state,
            "city": city or None,
            "delivery_enabled": bool(region.delivery_enabled),
            "cod_enabled": bool(region.cod_enabled),
        }

    db = get_db()
    await db.users.update_one(
        {"_id": seller["_id"]},
        {
            "$set": {
                "serviceable_regions": list(unique.values()),
                "serviceability_all_india": False,
                "serviceable_areas": [],
                "updated_at": datetime.utcnow()
            }
        }
    )

    await log_audit(
        db,
        actor_id=str(seller["_id"]),
        actor_role="seller",
        action="SELLER_SERVICEABLE_REGIONS_UPDATED",
        metadata={
            "region_count": len(unique)
        }
    )

    return {
        "message": "Serviceable regions updated",
        "count": len(unique)
    }

@router.get("/serviceable-regions")
async def get_serviceable_regions(
    seller=Depends(require_role("seller"))
):
    return {
        "seller_id": str(seller["_id"]),
        "all_india": bool(seller.get("serviceability_all_india", False)),
        "serviceable_regions": seller.get("serviceable_regions", [])
    }

@router.post("/serviceable-regions/all-india")
async def set_all_india_serviceability(
    seller=Depends(require_role("seller"))
):
    if seller.get("seller_status") != "verified":
        raise HTTPException(403, "Seller not verified")

    if seller.get("is_frozen"):
        raise HTTPException(403, "Seller account frozen")

    db = get_db()
    await db.users.update_one(
        {"_id": seller["_id"]},
        {
            "$set": {
                "serviceability_all_india": True,
                "serviceable_areas": [],
                "serviceable_regions": [],
                "updated_at": datetime.utcnow()
            }
        }
    )

    await log_audit(
        db,
        actor_id=str(seller["_id"]),
        actor_role="seller",
        action="SELLER_ALL_INDIA_SERVICEABILITY_ENABLED"
    )

    return {
        "message": "All India serviceability enabled",
        "all_india": True
    }


# ============================================
# SELLER – ENABLE COD
# ============================================

@router.post("/enable-cod")
async def enable_cod(
    seller=Depends(require_role("seller")),
    db=Depends(get_db),
):
    # Must be verified seller
    if seller.get("seller_status") != "verified":
        raise HTTPException(403, "Seller not verified")

    legacy_cod_enabled = bool(seller.get("cod_enabled", False))
    modern_cod_enabled = bool(seller.get("cod_settings", {}).get("enabled", False))

    # Migrate legacy COD flag to new structure.
    if legacy_cod_enabled or modern_cod_enabled:
        await db.users.update_one(
            {"_id": seller["_id"]},
            {
                "$set": {
                    "cod_enabled": True,
                    "cod_settings.enabled": True,
                    "cod_settings.activated_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                }
            },
        )
        return {"message": "COD enabled"}

    # Minimum trust score required
    trust_score = (
        seller.get("seller_profile", {})
        .get("trust", {})
        .get("score", 0)
    )

    if trust_score < 40:
        raise HTTPException(403, "Insufficient trust score")

    await db.users.update_one(
        {"_id": seller["_id"]},
        {
            "$set": {
                "cod_enabled": True,
                "cod_settings.enabled": True,
                "cod_settings.activated_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
        },
    )

    return {"message": "COD enabled"}

# ======================================================
# SELLER PRODUCTS
# ======================================================

@router.get("/my-products")
async def seller_products(
    seller=Depends(require_role("seller"))
):
    db = get_db()
    products = []

    cursor = db.products.find({"seller_id": seller["_id"]})
    async for product in cursor:
        reserved = product.get("reserved_stock", 0)
        products.append({
            "id": str(product["_id"]),
            "title": product["title"],
            "mrp": product["mrp"],
            "selling_price": product["selling_price"],
            "stock": product["stock"],
            "reserved_stock": reserved,
            "available_stock": product["stock"] - reserved,
            "created_at": product["created_at"]
        })

    return {
        "count": len(products),
        "products": products
    }


@router.get("/orders")
async def seller_orders(
    status: Optional[str] = Query(default="all"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    seller=Depends(require_role("seller"))
):
    db = get_db()

    query = {"seller_id": seller["_id"]}
    normalized_status = (status or "all").strip().lower()
    if normalized_status and normalized_status != "all":
        query["status"] = normalized_status

    skip = (page - 1) * limit
    total = await db.orders.count_documents(query)

    rows = await db.orders.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    product_ids = [row.get("product_id") for row in rows if row.get("product_id")]
    products_map = {}
    if product_ids:
        products = await db.products.find(
            {"_id": {"$in": product_ids}},
            {"title": 1, "images": 1}
        ).to_list(len(product_ids))
        products_map = {prod["_id"]: prod for prod in products}

    items = []
    for order in rows:
        delivery = order.get("delivery_address") or {}
        payment = order.get("payment") or {}
        pricing = order.get("pricing") or {}
        ret = order.get("return") or {}
        snapshot = order.get("seller_snapshot") or {}
        delivery_partner = order.get("delivery_partner") or {}
        product = products_map.get(order.get("product_id")) or {}

        partner_id_value = delivery_partner.get("id") or delivery_partner.get("_id")
        if isinstance(partner_id_value, ObjectId):
            partner_id_value = str(partner_id_value)

        tracking_rows = []
        for row in (order.get("tracking") or []):
            if isinstance(row, dict):
                tracking_rows.append({
                    "status": row.get("status"),
                    "message": row.get("message"),
                    "at": row.get("at"),
                })
        items.append({
            "id": str(order["_id"]),
            "status": order.get("status"),
            "quantity": order.get("quantity", 0),
            "created_at": order.get("created_at"),
            "updated_at": order.get("updated_at"),
            "delivered_at": order.get("delivered_at"),
            "delivery_otp_generated_at": order.get("delivery_otp_generated_at"),
            "product_id": str(order.get("product_id")) if order.get("product_id") else None,
            "product": {
                "id": str(order.get("product_id")) if order.get("product_id") else None,
                "title": product.get("title"),
                "image": (product.get("images") or [None])[0],
            },
            "pricing": {
                "subtotal": pricing.get("subtotal", 0),
                "seller_payout": pricing.get("seller_payout", 0),
                "unit_price": pricing.get("unit_price", 0),
            },
            "payment": {
                "method": payment.get("method"),
                "status": payment.get("status"),
            },
            "return": {
                "status": ret.get("status"),
                "reason": ret.get("reason"),
                "seller_action": ret.get("seller_action"),
            },
            "delivery_address": {
                "name": delivery.get("name"),
                "phone": delivery.get("phone"),
                "city": delivery.get("city"),
                "state": delivery.get("state"),
                "pincode": delivery.get("pincode"),
            },
            "seller_snapshot": {
                "brand_name": snapshot.get("brand_name"),
            },
            "delivery_partner": {
                "id": str(partner_id_value) if partner_id_value else None,
                "name": delivery_partner.get("name"),
                "phone": delivery_partner.get("phone"),
                "phone_masked": delivery_partner.get("phone_masked"),
                "source": delivery_partner.get("source"),
                "code": delivery_partner.get("code"),
                "user_id": delivery_partner.get("user_id"),
                "assigned_at": delivery_partner.get("assigned_at"),
                "out_for_delivery_at": delivery_partner.get("out_for_delivery_at"),
            },
            "shipping": serialize_order_shipping(order),
            "tracking": tracking_rows[-20:],
        })

    return {
        "count": len(items),
        "total": total,
        "page": page,
        "limit": limit,
        "has_more": (skip + len(items)) < total,
        "orders": items,
    }


@router.post("/delivery-partners")
async def create_delivery_partner(
    data: DeliveryPartnerCreatePayload,
    seller=Depends(require_role("seller"))
):
    db = get_db()

    if seller.get("seller_status") != "verified":
        raise HTTPException(403, "Seller not verified")
    if seller.get("is_frozen"):
        raise HTTPException(403, "Seller account frozen")

    name = data.name.strip()
    email = clean_optional_text(data.email, lower=True)
    vehicle_type = clean_optional_text(data.vehicle_type)
    service_area = clean_optional_text(data.service_area)
    notes = clean_optional_text(data.notes)
    try:
        phone = normalize_phone(data.phone)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    now = datetime.utcnow()
    partner_user_id, portal_access_status, portal_access_message = await ensure_delivery_partner_account(
        db,
        phone=phone,
        name=name,
        email=email,
        vehicle_type=vehicle_type,
        service_area=service_area,
        notes=notes,
    )
    existing = await db.seller_delivery_partners.find_one({
        "seller_id": seller["_id"],
        "phone": phone,
    })

    if existing:
        await db.seller_delivery_partners.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "name": name,
                "email": email,
                "phone_masked": mask_phone(phone),
                "vehicle_type": vehicle_type,
                "service_area": service_area,
                "notes": notes,
                "partner_user_id": partner_user_id,
                "portal_access_status": portal_access_status,
                "portal_access_message": portal_access_message,
                "is_active": True,
                "updated_at": now,
            }},
        )
        partner_id = existing["_id"]
    else:
        result = await db.seller_delivery_partners.insert_one({
            "seller_id": seller["_id"],
            "name": name,
            "phone": phone,
            "phone_masked": mask_phone(phone),
            "email": email,
            "source": "seller_custom",
            "vehicle_type": vehicle_type,
            "service_area": service_area,
            "notes": notes,
            "partner_user_id": partner_user_id,
            "portal_access_status": portal_access_status,
            "portal_access_message": portal_access_message,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        })
        partner_id = result.inserted_id

    partner = await db.seller_delivery_partners.find_one({"_id": partner_id})

    await log_audit(
        db=db,
        actor_id=str(seller["_id"]),
        actor_role="seller",
        action="SELLER_DELIVERY_PARTNER_SAVED",
        metadata={
            "partner_id": str(partner["_id"]),
            "partner_phone": partner.get("phone"),
            "portal_access_status": portal_access_status,
        },
    )

    return {
        "message": "Delivery partner saved",
        "partner": serialize_delivery_partner(partner),
    }


@router.get("/delivery-partners")
async def get_delivery_partners(
    seller=Depends(require_role("seller"))
):
    db = get_db()
    rows = await db.seller_delivery_partners.find(
        {"seller_id": seller["_id"]}
    ).sort("created_at", -1).to_list(200)

    partners = [serialize_delivery_partner(row) for row in rows]

    return {
        "count": len(partners),
        "partners": partners,
    }


@router.get("/shipping-partners/catalog")
async def list_shipping_partners_catalog(
    limit: int = Query(default=100, ge=1, le=300),
    seller=Depends(require_role("seller")),
):
    db = get_db()
    await ensure_delivery_app_partner_catalog(db, create_partner_accounts=False)

    rows = await db.delivery_app_partners.find(
        {"is_active": True}
    ).sort("name", 1).limit(limit).to_list(limit)

    partners = [serialize_shipping_catalog_partner(row) for row in rows]
    return {
        "count": len(partners),
        "partners": partners,
    }


@router.get("/delivery-app/partners")
async def list_delivery_app_partners(
    limit: int = Query(default=100, ge=1, le=300),
    seller=Depends(require_role("seller")),
):
    db = get_db()
    await ensure_delivery_app_partner_catalog(db, create_partner_accounts=False)

    rows = await db.delivery_app_partners.find(
        {"is_active": True}
    ).sort("name", 1).limit(limit).to_list(limit)

    hired_rows = await db.seller_delivery_partners.find(
        {"seller_id": seller["_id"], "app_partner_id": {"$exists": True}},
        {"app_partner_id": 1},
    ).to_list(limit)
    hired_ids = {str(row.get("app_partner_id")) for row in hired_rows if row.get("app_partner_id")}

    partners = []
    for row in rows:
        partners.append({
            "id": str(row["_id"]),
            "code": row.get("code"),
            "name": row.get("name"),
            "email": row.get("email"),
            "phone": row.get("phone"),
            "phone_masked": row.get("phone_masked"),
            "rating": row.get("rating"),
            "coverage": row.get("coverage"),
            "hired": str(row["_id"]) in hired_ids,
        })

    return {
        "count": len(partners),
        "partners": partners,
    }


@router.post("/delivery-app/partners/{partner_id}/hire")
async def hire_delivery_app_partner(
    partner_id: str,
    seller=Depends(require_role("seller")),
):
    db = get_db()
    now = datetime.utcnow()

    if seller.get("seller_status") != "verified":
        raise HTTPException(403, "Seller not verified")
    if seller.get("is_frozen"):
        raise HTTPException(403, "Seller account frozen")

    await ensure_delivery_app_partner_catalog(db, create_partner_accounts=False)
    app_partner = await db.delivery_app_partners.find_one({
        "_id": parse_object_id(partner_id, "partner_id"),
        "is_active": True,
    })
    if not app_partner:
        raise HTTPException(404, "Delivery app partner not found")

    partner_user_id = app_partner.get("partner_user_id")
    if isinstance(partner_user_id, ObjectId):
        partner_user_id = str(partner_user_id)

    existing = await db.seller_delivery_partners.find_one({
        "seller_id": seller["_id"],
        "phone": app_partner.get("phone"),
    })

    if existing:
        partner_doc_id = existing["_id"]
        await db.seller_delivery_partners.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "name": app_partner.get("name"),
                "email": app_partner.get("email"),
                "phone": app_partner.get("phone"),
                "phone_masked": app_partner.get("phone_masked"),
                "source": "delivery_app",
                "app_partner_id": app_partner["_id"],
                "partner_user_id": partner_user_id,
                "code": app_partner.get("code"),
                "rating": app_partner.get("rating"),
                "coverage": app_partner.get("coverage"),
                "is_active": True,
                "hired_at": now,
                "updated_at": now,
            }},
        )
    else:
        result = await db.seller_delivery_partners.insert_one({
            "seller_id": seller["_id"],
            "name": app_partner.get("name"),
            "email": app_partner.get("email"),
            "phone": app_partner.get("phone"),
            "phone_masked": app_partner.get("phone_masked"),
            "source": "delivery_app",
            "app_partner_id": app_partner["_id"],
            "partner_user_id": partner_user_id,
            "code": app_partner.get("code"),
            "rating": app_partner.get("rating"),
            "coverage": app_partner.get("coverage"),
            "is_active": True,
            "hired_at": now,
            "created_at": now,
            "updated_at": now,
        })
        partner_doc_id = result.inserted_id

    partner = await db.seller_delivery_partners.find_one({"_id": partner_doc_id})

    await log_audit(
        db=db,
        actor_id=str(seller["_id"]),
        actor_role="seller",
        action="SELLER_DELIVERY_APP_PARTNER_HIRED",
        metadata={
            "seller_partner_id": str(partner_doc_id),
            "app_partner_id": str(app_partner["_id"]),
            "code": app_partner.get("code"),
        },
    )

    return {
        "message": "Delivery app partner hired successfully",
        "partner": {
            "id": str(partner["_id"]),
            "name": partner.get("name"),
            "phone": partner.get("phone"),
            "phone_masked": partner.get("phone_masked"),
            "email": partner.get("email"),
            "source": partner.get("source"),
            "code": partner.get("code"),
            "rating": partner.get("rating"),
            "coverage": partner.get("coverage"),
            "partner_user_id": str(partner.get("partner_user_id") or ""),
            "is_active": bool(partner.get("is_active", True)),
            "hired_at": partner.get("hired_at"),
        },
    }


@router.post("/orders/{order_id}/shipping")
async def save_order_shipping(
    order_id: str,
    data: ExternalShipmentPayload,
    seller=Depends(require_role("seller"))
):
    db = get_db()
    now = datetime.utcnow()

    if seller.get("seller_status") != "verified":
        raise HTTPException(403, "Seller not verified")
    if seller.get("is_frozen"):
        raise HTTPException(403, "Seller account frozen")

    order_oid = parse_object_id(order_id, "order_id")
    partner_oid = parse_object_id(data.partner_id, "partner_id")
    order = await db.orders.find_one({
        "_id": order_oid,
        "seller_id": seller["_id"],
    })
    if not order:
        raise HTTPException(404, "Order not found")
    if order.get("status") in {"delivered", "cancelled", "rto"}:
        raise HTTPException(400, "Order is not eligible for shipping updates")

    await ensure_delivery_app_partner_catalog(db)
    partner = await db.delivery_app_partners.find_one({
        "_id": partner_oid,
        "is_active": True,
    })
    if not partner:
        raise HTTPException(404, "Shipping partner not found")

    tracking_number = str(data.tracking_number or "").strip()
    if len(tracking_number) < 4:
        raise HTTPException(400, "Tracking number is too short")

    tracking_url = clean_optional_text(data.tracking_url)
    if tracking_url and not tracking_url.lower().startswith(("http://", "https://")):
        raise HTTPException(400, "Tracking URL must start with http:// or https://")

    shipping_partner_payload = {
        "id": str(partner["_id"]),
        "name": partner.get("name"),
        "code": partner.get("code"),
        "coverage": partner.get("coverage"),
        "rating": partner.get("rating"),
        "provider_type": "third_party_courier",
        "booked_by": str(seller["_id"]),
    }
    shipment_payload = {
        "tracking_number": tracking_number,
        "tracking_url": tracking_url,
        "booked_at": now,
        "last_status_sync_at": now,
    }

    next_status = "shipped" if order.get("status") == "created" else order.get("status")
    tracking_message = f"Shipment booked with {partner.get('name') or 'shipping partner'} ({tracking_number})"

    await db.orders.update_one(
        {"_id": order_oid},
        {
            "$set": {
                "status": next_status,
                "shipping_partner": shipping_partner_payload,
                "shipment": shipment_payload,
                "updated_at": now,
            },
            "$unset": {
                "delivery_partner": "",
                "delivery_otp_hash": "",
                "delivery_otp_encrypted": "",
                "delivery_otp_generated_at": "",
            },
            "$push": {
                "tracking": {
                    "status": "SHIPPED",
                    "message": tracking_message,
                    "at": now,
                }
            }
        }
    )

    await record_order_event(
        db=db,
        order_id=order_oid,
        event="ORDER_SHIPPED",
        actor_role="seller",
        actor_id=seller["_id"],
        metadata={
            "shipping_partner": shipping_partner_payload.get("name"),
            "tracking_number": tracking_number,
            "mode": "third_party_courier",
        },
    )

    buyer_notice = {
        "type": "delivery_update",
        "title": "Shipment booked",
        "message": f"Your order has been shipped with {partner.get('name') or 'the courier partner'}",
        "order_id": order_id,
        "created_at": now,
        "read": False,
    }
    await db.users.update_one(
        {"_id": order["buyer_id"]},
        {"$push": {"buyer_notifications": {"$each": [buyer_notice], "$slice": -100}}},
    )

    await log_audit(
        db=db,
        actor_id=str(seller["_id"]),
        actor_role="seller",
        action="SELLER_ORDER_SHIPPING_SAVED",
        metadata={
            "order_id": order_id,
            "shipping_partner": shipping_partner_payload.get("name"),
            "tracking_number": tracking_number,
        },
    )

    return {
        "message": "Shipment saved",
        "order_id": order_id,
        "status": next_status,
        "shipping": {
            "partner_id": shipping_partner_payload.get("id"),
            "partner_name": shipping_partner_payload.get("name"),
            "partner_code": shipping_partner_payload.get("code"),
            "provider_type": shipping_partner_payload.get("provider_type"),
            "tracking_number": tracking_number,
            "tracking_url": tracking_url,
            "booked_at": now,
            "last_status_sync_at": now,
        },
    }


@router.post("/orders/{order_id}/shipping-status")
async def update_order_shipping_status(
    order_id: str,
    data: ShipmentStatusPayload,
    seller=Depends(require_role("seller"))
):
    db = get_db()
    now = datetime.utcnow()
    normalized_status = str(data.status or "").strip().lower()
    allowed_statuses = {"shipped", "out_for_delivery", "delivered"}
    if normalized_status not in allowed_statuses:
        raise HTTPException(400, f"Invalid shipping status. Allowed: {', '.join(sorted(allowed_statuses))}")

    order = await db.orders.find_one({
        "_id": parse_object_id(order_id, "order_id"),
        "seller_id": seller["_id"],
    })
    if not order:
        raise HTTPException(404, "Order not found")
    if order.get("status") in {"cancelled", "rto"}:
        raise HTTPException(400, "Order is not eligible for shipping updates")

    if normalized_status == "delivered":
        await finalize_external_delivery(
            db,
            order=order,
            seller_id=seller["_id"],
            message=clean_optional_text(data.message) or "Courier updated order as delivered",
        )
        return {"message": "Order marked delivered", "order_id": order_id, "status": "delivered"}

    tracking_status = "OUT_FOR_DELIVERY" if normalized_status == "out_for_delivery" else "SHIPPED"
    default_message = (
        "Courier marked order as out for delivery"
        if normalized_status == "out_for_delivery"
        else "Courier shipment is in transit"
    )
    message = clean_optional_text(data.message) or default_message

    await db.orders.update_one(
        {"_id": order["_id"]},
        {
            "$set": {
                "status": normalized_status,
                "shipment.last_status_sync_at": now,
                "updated_at": now,
            },
            "$push": {
                "tracking": {
                    "status": tracking_status,
                    "message": message,
                    "at": now,
                }
            }
        }
    )

    await record_order_event(
        db=db,
        order_id=order["_id"],
        event=tracking_status,
        actor_role="seller",
        actor_id=seller["_id"],
        metadata={"mode": "third_party_courier"},
    )

    await log_audit(
        db=db,
        actor_id=str(seller["_id"]),
        actor_role="seller",
        action="SELLER_ORDER_SHIPPING_STATUS_UPDATED",
        metadata={
            "order_id": order_id,
            "status": normalized_status,
        },
    )

    return {"message": "Shipping status updated", "order_id": order_id, "status": normalized_status}


@router.post("/orders/{order_id}/assign-delivery-partner")
async def assign_delivery_partner_to_order(
    order_id: str,
    data: DeliveryPartnerAssignPayload,
    seller=Depends(require_role("seller"))
):
    db = get_db()
    now = datetime.utcnow()
    order_oid = parse_object_id(order_id, "order_id")
    partner_oid = parse_object_id(data.partner_id, "partner_id")

    order = await db.orders.find_one({
        "_id": order_oid,
        "seller_id": seller["_id"],
    })
    if not order:
        raise HTTPException(404, "Order not found")
    if order.get("status") in {"delivered", "cancelled", "rto"}:
        raise HTTPException(400, "Order is not eligible for delivery assignment")

    partner = await db.seller_delivery_partners.find_one({
        "_id": partner_oid,
        "seller_id": seller["_id"],
        "is_active": True,
    })
    if not partner:
        raise HTTPException(404, "Delivery partner not found")

    partner_user_id = partner.get("partner_user_id")
    if isinstance(partner_user_id, ObjectId):
        partner_user_id = str(partner_user_id)
    if not str(partner_user_id or "").strip():
        raise HTTPException(400, partner.get("portal_access_message") or "Delivery partner needs a delivery login before assignment")

    partner_payload = {
        "id": str(partner["_id"]),
        "name": partner.get("name"),
        "phone": partner.get("phone"),
        "phone_masked": partner.get("phone_masked"),
        "email": partner.get("email"),
        "source": partner.get("source") or "seller_custom",
        "code": partner.get("code"),
        "user_id": partner_user_id,
        "assigned_at": now,
        "assigned_by": str(seller["_id"]),
        "out_for_delivery_at": (order.get("delivery_partner") or {}).get("out_for_delivery_at"),
    }

    await db.orders.update_one(
        {"_id": order_oid},
        {
            "$set": {
                "delivery_partner": partner_payload,
                "updated_at": now,
            },
            "$push": {
                "tracking": {
                    "status": "DELIVERY_PARTNER_ASSIGNED",
                    "message": f"Assigned to delivery partner {partner_payload['name']}",
                    "at": now,
                }
            }
        }
    )

    await record_order_event(
        db=db,
        order_id=order_oid,
        event="DELIVERY_PARTNER_ASSIGNED",
        actor_role="seller",
        actor_id=seller["_id"],
        metadata={
            "partner_id": str(partner["_id"]),
            "partner_name": partner.get("name"),
        },
    )

    await log_audit(
        db=db,
        actor_id=str(seller["_id"]),
        actor_role="seller",
        action="SELLER_DELIVERY_PARTNER_ASSIGNED",
        metadata={"order_id": order_id, "partner_id": str(partner["_id"])},
    )

    return {
        "message": "Delivery partner assigned to order",
        "order_id": order_id,
        "delivery_partner": partner_payload,
    }


@router.get("/notifications")
async def get_seller_notifications(
    limit: int = Query(default=30, ge=1, le=200),
    seller=Depends(require_role("seller"))
):
    db = get_db()
    current = await db.users.find_one(
        {"_id": seller["_id"]},
        {"seller_notifications": {"$slice": -limit}}
    )
    rows = (current or {}).get("seller_notifications") or []
    rows = sorted(
        rows,
        key=lambda item: item.get("created_at") if isinstance(item.get("created_at"), datetime) else datetime.min,
        reverse=True,
    )
    unread_count = sum(1 for row in rows if not bool(row.get("read")))

    return {
        "count": len(rows),
        "unread": unread_count,
        "notifications": rows,
    }

# ======================================================
# SELLER PERFORMANCE
# ======================================================

@router.get("/performance")
async def seller_performance(
    seller=Depends(require_role("seller"))
):
    db = get_db()

    total_orders = await db.orders.count_documents({
        "seller_id": seller["_id"]
    })

    delivered = await db.orders.count_documents({
        "seller_id": seller["_id"],
        "status": "delivered"
    })

    cancelled = await db.orders.count_documents({
        "seller_id": seller["_id"],
        "status": "cancelled"
    })

    if seller.get("is_frozen"):
        raise HTTPException(403, "Frozen sellers cannot take actions")

    pipeline = [
        {"$match": {
            "seller_id": seller["_id"],
            "status": "delivered"
        }},
        {"$group": {
            "_id": None,
            "revenue": {"$sum": "$pricing.seller_payout"}
        }}
    ]

    agg = await db.orders.aggregate(pipeline).to_list(1)
    revenue = agg[0]["revenue"] if agg else 0

    return {
        "orders": {
            "total": total_orders,
            "delivered": delivered,
            "cancelled": cancelled
        },
        "revenue": {
            "net": revenue
        }
    }


# ======================================================
# SELLER WALLET (READ ONLY)
# ======================================================

@router.get("/wallet")
async def get_seller_wallet(
    seller=Depends(require_role("seller")),
    db=Depends(get_db),
):
    from utils.wallet_service import (
        get_wallet_balance,
        get_reserve_balance,
        get_wallet_summary,
    )

    seller_id = seller["_id"]

    available_balance = await get_wallet_balance(db, seller_id)
    reserved_balance = await get_reserve_balance(db, seller_id)
    summary = await get_wallet_summary(db, seller_id)

    ledger = (
        await db.wallet_ledger
        .find({"seller_id": seller_id})
        .sort("created_at", -1)
        .limit(50)
        .to_list(50)
    )
    payout_rows = (
        await db.payout_requests
        .find({"seller_id": seller_id, "type": "emergency"})
        .sort("requested_at", -1)
        .limit(20)
        .to_list(20)
    )
    payout_requests = [serialize_wallet_payout_request(row) for row in payout_rows]
    active_payout_request = next(
        (
            row for row in payout_requests
            if str(row.get("status") or "").strip().lower() in {"requested", "processing"}
        ),
        None,
    )

    seller_tier = seller.get("seller_tier", "standard")
    tier_config = SELLER_TIER_CONFIG.get(seller_tier, SELLER_TIER_CONFIG["standard"])

    is_verified_seller = seller.get("seller_status") == "verified"
    release_type = "T+2" if is_verified_seller else "T+3/T+4"
    release_window_hours = {
        "min": 48 if is_verified_seller else 72,
        "max": 48 if is_verified_seller else 96,
    }

    return {
        "balances": {
            "available": available_balance,
            "reserved": reserved_balance,
        },
        "totals": {
            "earned": summary.get("SALE_CREDIT", 0),
            "commission": summary.get("COMMISSION_DEBIT", 0),
            "platform_fees": summary.get("PLATFORM_FEE_DEBIT", 0),
            "refunds": summary.get("REFUND_DEBIT", 0),
            "emergency_holds": summary.get("EMERGENCY_PAYOUT_HOLD", 0),
        },
        "settlement_promise": {
            "tier": seller_tier,
            "settlement_hours": seller.get("settlement_hours", tier_config["settlement_hours"]),
            "commission_percent": seller.get("commission_percent", tier_config["commission_percent"]),
            "release_type": release_type,
            "release_window_hours": release_window_hours,
            "policy_release_type": tier_config.get("release_type"),
            "policy_release_note": tier_config.get("release_note"),
        },
        "ledger": ledger,
        "payout_requests": payout_requests,
        "emergency_payout": {
            "can_request": active_payout_request is None,
            "active_request": active_payout_request,
        },
    }


@router.post("/wallet/emergency-payout")
async def request_emergency_payout(
    data: EmergencyPayoutRequest,
    seller=Depends(require_role("seller")),
    db=Depends(get_db),
):
    if seller.get("seller_status") != "verified":
        raise HTTPException(403, "Only verified sellers can request emergency payout")
    if seller.get("is_frozen") or seller.get("seller_status") == "frozen":
        raise HTTPException(403, "Seller account frozen")

    existing_active_request = await db.payout_requests.find_one({
        "seller_id": seller["_id"],
        "type": "emergency",
        "status": {"$in": ["requested", "processing"]},
    })
    if existing_active_request:
        raise HTTPException(400, "You already have an emergency payout under review")

    saved_bank = seller.get("seller_bank_account") or {}

    account_holder_name = (data.account_holder_name or "").strip() or saved_bank.get("account_holder_name", "")
    bank_account_number = (data.bank_account_number or "").strip()
    ifsc_code = (data.ifsc_code or "").strip().upper() or (saved_bank.get("ifsc_code") or "").strip().upper()
    bank_name = data.bank_name.strip() if data.bank_name else saved_bank.get("bank_name")

    encrypted_account_number = None
    masked_account_number = None

    if bank_account_number:
        if not bank_account_number.isdigit():
            raise HTTPException(400, "Invalid bank account number")
        encrypted_account_number = encrypt_sensitive_value(bank_account_number)
        masked_account_number = f"****{bank_account_number[-4:]}"
    else:
        encrypted_account_number = saved_bank.get("bank_account_encrypted")
        masked_account_number = saved_bank.get("bank_account_masked")

    if not account_holder_name:
        raise HTTPException(400, "Account holder name required. Save bank account first.")
    if not encrypted_account_number or not masked_account_number:
        raise HTTPException(400, "Bank account required. Save bank account first.")
    if not ifsc_code.isalnum() or len(ifsc_code) != 11:
        raise HTTPException(400, "Invalid IFSC code")

    amount = round(float(data.amount), 2)
    fee_percent = max(float(EMERGENCY_PAYOUT_FEE_PERCENT or 0), 0)
    fee_flat = max(float(EMERGENCY_PAYOUT_FEE_FLAT or 0), 0)
    settlement_fee = round((amount * fee_percent / 100) + fee_flat, 2)
    total_debit = round(amount + settlement_fee, 2)

    available_balance = await get_wallet_balance(db, seller["_id"])
    if available_balance < total_debit:
        raise HTTPException(400, "Insufficient wallet balance after settlement fee")

    payout_doc = {
        "seller_id": seller["_id"],
        "method": "BANK_TRANSFER",
        "type": "emergency",
        "status": "requested",
        "amount": amount,
        "settlement_fee": settlement_fee,
        "total_debit": total_debit,
        "bank_details": {
            "account_holder_name": account_holder_name,
            "bank_account_encrypted": encrypted_account_number,
            "bank_account_masked": masked_account_number,
            "ifsc_code": ifsc_code,
            "bank_name": bank_name,
        },
        "requested_at": datetime.utcnow(),
    }

    res = await db.payout_requests.insert_one(payout_doc)
    requested_at = payout_doc["requested_at"]

    await db.wallet_ledger.insert_one({
        "seller_id": seller["_id"],
        "order_id": None,
        "entry_type": "EMERGENCY_PAYOUT_HOLD",
        "credit": 0,
        "debit": total_debit,
        "reason_code": "EMERGENCY_PAYOUT_REQUESTED",
        "reference_id": res.inserted_id,
        "created_at": requested_at,
    })
    await log_audit(
        db=db,
        actor_id=str(seller["_id"]),
        actor_role="seller",
        action="EMERGENCY_PAYOUT_REQUESTED",
        metadata={
            "request_id": str(res.inserted_id),
            "amount": amount,
            "settlement_fee": settlement_fee,
            "total_debit": total_debit,
            "bank_account": masked_account_number,
        },
    )

    return {
        "message": "Emergency payout requested",
        "request_id": str(res.inserted_id),
        "method": "BANK_TRANSFER",
        "amount": amount,
        "settlement_fee": settlement_fee,
        "total_debit": total_debit,
        "bank_account": masked_account_number,
        "status": "requested",
    }

# ======================================================
# OFFERS-START
# ======================================================

@router.post("/offers")
async def create_offer(
    data: SellerOfferCreate,
    seller=Depends(require_role("seller")),
    db=Depends(get_db),
):
    now = datetime.utcnow()

    # 1️⃣ Validate product ownership
    product = await db.products.find_one({
        "_id": ObjectId(data.product_id),
        "seller_id": seller["_id"],
    })

    if not product:
        raise HTTPException(404, "Product not found")

    base_price = product.get("selling_price")
    if not base_price:
        raise HTTPException(400, "Product price not set")

    # 2️⃣ Validate pricing logic
    if data.offer_price >= base_price:
        raise HTTPException(400, "Offer price must be lower than product price")

    if data.start_at >= data.end_at:
        raise HTTPException(400, "Invalid offer duration")

    # 3️⃣ Enforce SINGLE active offer per product
    existing = await db.seller_offers.find_one({
        "product_id": product["_id"],
        "status": "active",
        "end_at": {"$gte": now}
    })

    if existing:
        raise HTTPException(
            400,
            "An active offer already exists for this product"
        )

    # 4️⃣ Optional Festival Link
    festival_id = None
    if data.festival_slug:
        festival = await db.festivals.find_one({
            "slug": data.festival_slug,
            "status": "live"
        })

        if not festival:
            raise HTTPException(400, "Festival not active")

        festival_id = festival["_id"]

    # 5️⃣ Create Offer
    offer = {
        "seller_id": seller["_id"],
        "product_id": product["_id"],
        "offer_price": data.offer_price,
        "start_at": data.start_at,
        "end_at": data.end_at,
        "festival_id": festival_id,
        "status": "active",
        "used_count": 0,
        "created_at": now,
        "updated_at": now,
    }

    await db.seller_offers.insert_one(offer)

    return {"message": "Offer created successfully"}

# ======================================================
# OFFERS-STOP
# ======================================================

@router.patch("/offers/{offer_id}/pause")
async def pause_offer(
    offer_id: str,
    seller=Depends(require_role("seller")),
    db=Depends(get_db),
):
    from bson import ObjectId

    result = await db.seller_offers.update_one(
        {
            "_id": ObjectId(offer_id),
            "seller_id": seller["_id"],
        },
        {"$set": {"status": "paused"}},
    )

    if result.modified_count == 0:
        raise HTTPException(404, "Offer not found")

    return {"message": "Offer paused"}

# ======================================================
# OFFERS-DELETED
# ======================================================

@router.delete("/offers/{offer_id}")
async def delete_offer(
    offer_id: str,
    seller=Depends(require_role("seller")),
    db=Depends(get_db),
):
    from bson import ObjectId

    offer = await db.seller_offers.find_one({
        "_id": ObjectId(offer_id),
        "seller_id": seller["_id"],
    })

    if not offer:
        raise HTTPException(404, "Offer not found")

    if offer["used_count"] > 0:
        raise HTTPException(400, "Cannot delete offer already used")

    await db.seller_offers.delete_one({"_id": offer["_id"]})

    return {"message": "Offer deleted"}

# ======================================================
# OFFERS-LIST
# ======================================================

@router.get("/offers")
async def list_offers(
    seller=Depends(require_role("seller")),
    db=Depends(get_db),
):
    offers = await db.seller_offers.find(
        {"seller_id": seller["_id"]}
    ).sort("created_at", -1).to_list(100)

    return {"offers": offers}
