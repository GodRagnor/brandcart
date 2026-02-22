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
from routes.auth import SellerDocuments

router = APIRouter(
    prefix="/api/seller",
    tags=["Seller"]
)


# ======================================================
# SCHEMAS
# ======================================================

class SellerProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    short_tagline: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    support_email: Optional[str] = None

class ServiceableArea(BaseModel):
    pincode: str = Field(..., min_length=6, max_length=6)
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
            "brand_name": profile.get("brand_name"),
            "display_name": profile.get("display_name"),
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
        },
    }



@router.patch("/profile")
async def update_seller_profile(
    data: SellerProfileUpdate,
    seller=Depends(require_role("seller"))
):
    db = get_db()

    await db.users.update_one(
        {"_id": seller["_id"]},
        {
            "$set": {
                "seller_profile.logo_url": data.logo_url,
                "seller_profile.description": data.description,
                "updated_at": datetime.utcnow()
            }
        }
    )

    await log_audit(
        db,
        actor_id=str(seller["_id"]),
        actor_role="seller",
        action="SELLER_PROFILE_UPDATED"
    )

    return {"message": "Seller profile updated"}


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


# ======================================================
# SELLER SERVICEABLE AREAS (CORE DELIVERY LOGIC)
# ======================================================

@router.post("/serviceable-areas")
async def set_serviceable_areas(
    areas: List[ServiceableArea],
    seller=Depends(require_role("seller"))
):
    if seller.get("seller_status") != "verified":
        raise HTTPException(403, "Seller not verified")

    if seller.get("is_frozen"):
        raise HTTPException(403, "Seller account frozen")

    # Deduplicate by pincode
    unique = {}
    for area in areas:
        unique[area.pincode] = area.dict()

    db = get_db()
    await db.users.update_one(
        {"_id": seller["_id"]},
        {
            "$set": {
                "serviceable_areas": list(unique.values()),
                "updated_at": datetime.utcnow()
            }
        }
    )

    await log_audit(
        db,
        actor_id=str(seller["_id"]),
        actor_role="seller",
        action="SELLER_SERVICEABLE_AREAS_UPDATED",
        metadata={
            "pincode_count": len(unique)
        }
    )

    return {
        "message": "Serviceable areas updated",
        "count": len(unique)
    }


@router.get("/serviceable-areas")
async def get_serviceable_areas(
    seller=Depends(require_role("seller"))
):
    return {
        "seller_id": str(seller["_id"]),
        "serviceable_areas": seller.get("serviceable_areas", [])
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

    return {
        "balances": {
            "available": available_balance,
            "reserved": reserved_balance,
        },
        "totals": {
            "earned": summary.get("SALE_CREDIT", 0),
            "commission": summary.get("COMMISSION_DEBIT", 0),
            "refunds": summary.get("REFUND_DEBIT", 0),
        },
        "settlement_promise": {
            "tier": seller.get("seller_tier"),
            "settlement_hours": seller.get("settlement_hours"),
            "commission_percent": seller.get("commission_percent"),
        },
        "ledger": ledger,
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
