from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timedelta
from typing import Literal, Optional
from pydantic import BaseModel
from bson import ObjectId

from database import get_db
from utils.guards import parse_object_id, assert_valid_seller_state
from utils.audit import log_audit
from utils.security import get_current_user, require_role
from utils.slug import make_slug, generate_unique_seller_slug
from utils.trust import SELLER_TIER_CONFIG
from models.user import SellerTier


router = APIRouter(prefix="/api/admin", tags=["Admin"])


# =====================================================
# SCHEMAS
# =====================================================

class VerifyIdentity(BaseModel):
    action: Literal["approve", "reject"]
    reason: Optional[str] = None


# =====================================================
# VIEW SELLER REQUESTS
# =====================================================

@router.get("/seller-requests")
async def seller_requests(admin=Depends(require_role("admin"))):
    db = get_db()

    cursor = db.users.find(
        {"seller_status": "requested"},
        {
            "phone": 1,
            "email": 1,
            "seller_request": 1,
            "seller_requested_at": 1,
        }
    ).sort("seller_requested_at", 1)

    requests = []

    async for u in cursor:
        req = u.get("seller_request", {})

        requests.append({
            "user_id": str(u["_id"]),
            "phone": u.get("phone"),
            "email": u.get("email"),                  # ✅ NEW
            "brand_name": req.get("brand_name"),
            "legal_name": req.get("legal_name"),      # ✅ NEW
            "category": req.get("category"),
            "documents": req.get("documents"),        # ✅ NEW
            "requested_at": u.get("seller_requested_at"),
        })

    return {
        "count": len(requests),
        "requests": requests
    }

# =========================
# VERIFY / REJECT SELLER
# =========================
@router.post("/seller/{user_id}/verify-identity")
async def verify_identity(
    user_id: str,
    data: VerifyIdentity,
    admin=Depends(require_role("admin"))
):
    db = get_db()
    oid = parse_object_id(user_id)

    user = await db.users.find_one({"_id": oid})
    if not user:
        raise HTTPException(404, "Seller not found")

    # SAFETY: already finalized
    if user.get("seller_status") == "verified":
        raise HTTPException(400, "Seller already verified")

    if user.get("seller_status") == "rejected":
        raise HTTPException(400, "Seller already rejected")

    seller_request = user.get("seller_request")

    if not seller_request:
        raise HTTPException(400, "Seller request not found")

    # =========================
    # APPROVE SELLER
    # =========================
    if data.action == "approve":
        documents = seller_request.get("documents")
        if not documents:
            raise HTTPException(400, "Seller documents missing")

        base_slug = make_slug(seller_request["brand_name"])
        slug = await generate_unique_seller_slug(db, base_slug)
        
        
        seller_profile = {
            "legal_name": seller_request["legal_name"],
            "brand_name": seller_request["brand_name"],
            "slug": slug,
            "category": seller_request["category"],
            "description": seller_request.get("description"),
            "documents": documents,
            
            "trust": {
                "score": 0,
                "badges": []
            },
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        tier = SellerTier.VERIFIED_FAST  # default for newly verified sellers
        config = SELLER_TIER_CONFIG[tier.value]


        await db.users.update_one(
            {"_id": oid},
            {"$set": {
        "role": "seller",
        "seller_status": "verified",

        # seller profile
        "seller_profile": seller_profile,

        # SELLER CONTRACT (THIS IS STEP 3)
        "seller_tier": tier.value,
        "settlement_hours": config["settlement_hours"],
        "commission_percent": config["commission_percent"],

        # metadata
        "seller_verified_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),

        # operational flags
        "cod_enabled": True,

        # cleanup
        "seller_rejected_reason": None,
        "seller_rejected_at": None
    }}
)
    
        await log_audit(
            db,
            actor_id=str(admin["_id"]),
            actor_role="admin",
            action="SELLER_VERIFIED",
            metadata={
                "user_id": user_id,
                "slug": slug
            }
        )

        return {
            "message": "Seller verified",
            "slug": slug
        }

    # =========================
    # REJECT SELLER
    # =========================
    if data.action == "reject":
        if not data.reason:
            raise HTTPException(400, "Reason required for rejection")

        await db.users.update_one(
            {"_id": oid},
            {
                "$set": {
                    "seller_status": "rejected",
                    "seller_rejected_reason": data.reason,
                    "seller_rejected_at": datetime.utcnow()
                }
            }
        )

        await log_audit(
            db,
            actor_id=str(admin["_id"]),
            actor_role="admin",
            action="SELLER_REJECTED",
            metadata={
                "user_id": user_id,
                "reason": data.reason
            }
        )

        return {
            "message": "Seller rejected"
        }

    # SHOULD NEVER REACH
    raise HTTPException(400, "Invalid action")

# ---------------------------
# FREEZE SELLER
# ---------------------------
@router.post("/seller/{user_id}/freeze")
async def freeze_seller(
    user_id: str,
    reason: str,
    admin=Depends(require_role("admin")),
    db=Depends(get_db),
):
    seller = await db.users.find_one({"_id": ObjectId(user_id), "role": "seller"})
    if not seller:
        raise HTTPException(404, "Seller not found")

    if seller.get("seller_status") == "frozen":
        return {"message": "Seller already frozen"}

    await db.users.update_one(
        {"_id": seller["_id"]},
        {
            "$set": {
                "seller_status": "frozen",
                "seller_frozen_reason": reason,
                "seller_frozen_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
        }
    )

    await log_audit(
        db=db,
        actor_id=str(admin["_id"]),
        actor_role="admin",
        action="SELLER_FROZEN",
        metadata={
            "seller_id": user_id,
            "reason": reason,
        },
    )

    return {"message": "Seller frozen successfully"}


# ---------------------------
# UNFREEZE SELLER → PROBATION
# ---------------------------
@router.post("/seller/{user_id}/unfreeze")
async def unfreeze_seller(
    user_id: str,
    admin=Depends(require_role("admin")),
    db=Depends(get_db),
):
    seller = await db.users.find_one({"_id": ObjectId(user_id), "role": "seller"})
    if not seller:
        raise HTTPException(404, "Seller not found")

    if seller.get("seller_status") != "frozen":
        raise HTTPException(400, "Seller is not frozen")

    now = datetime.utcnow()
    probation_days = 14

    await db.users.update_one(
        {"_id": seller["_id"]},
        {
            "$set": {
                "seller_status": "verified",
                "seller_probation": {
                    "active": True,
                    "started_at": now,
                    "ends_at": now + timedelta(days=probation_days),
                    "restrictions": {
                        "cod_enabled": False,
                        "max_daily_orders": 5,
                        "max_order_value": 5000,
                    },
                },
                "seller_unfrozen_at": now,
                "updated_at": now,
            },
            "$unset": {
                "seller_frozen_reason": "",
                "seller_frozen_at": "",
            },
        }
    )

    await log_audit(
        db=db,
        actor_id=str(admin["_id"]),
        actor_role="admin",
        action="SELLER_UNFROZEN_WITH_PROBATION",
        metadata={
            "seller_id": user_id,
            "probation_days": probation_days,
        },
    )

    return {
        "message": "Seller unfrozen and placed under probation",
        "probation_days": probation_days,
    }



# =========================================================
# ACTIVE / FROZEN SELLERS (KEPT ✅)
# =========================================================

@router.get("/sellers/active")
async def active_sellers(admin=Depends(require_role("admin"))):
    db = get_db()

    sellers = await db.users.find(
        {"role": "seller", "is_frozen": False},
        {"password": 0}
    ).to_list(length=100)

    for s in sellers:
        s["_id"] = str(s["_id"])

    return sellers

# =========================================================
# SELLER RANKING (KEPT, CLEANED ✏️)
# =========================================================

@router.get("/sellers/ranking")
async def seller_ranking(admin=Depends(require_role("admin"))):
    db = get_db()

    cursor = db.users.find(
        {"role": "seller", "seller_status": "verified"},
        {
            "seller_profile.brand_name": 1,
            "seller_profile.trust": 1
        }
    ).sort("seller_profile.trust.score", -1)

    sellers = []
    async for s in cursor:
        sellers.append({
            "seller_id": str(s["_id"]),
            "brand_name": s.get("seller_profile", {}).get("brand_name"),
            "score": s.get("seller_profile", {}).get("trust", {}).get("score", 0),
            "badges": s.get("seller_profile", {}).get("trust", {}).get("badges", [])
        })

    return sellers


# =========================================================
# COMMISSION SETTING (KEPT ✅)
# =========================================================

@router.post("/set-commission")
async def set_commission(
    rate: float,
    admin=Depends(require_role("admin"))
):
    if rate < 0 or rate > 0.10:
        raise HTTPException(400, "Commission must be between 0 and 10%")

    db = get_db()
    await db.settings.update_one(
        {"_id": "platform"},
        {"$set": {"commission_rate": rate}},
        upsert=True
    )

    return {"message": "Commission updated", "rate": rate}

# ======================================================
# OFFERS
# ======================================================

@router.post("/festivals")
async def create_festival(
    data: dict,
    admin=Depends(require_role("admin")),
    db=Depends(get_db),
):
    festival = {
        "slug": data["slug"],
        "name": data["name"],
        "start_at": data["start_at"],
        "end_at": data["end_at"],
        "eligible_tiers": data["eligible_tiers"],
        "status": "live",
        "created_at": datetime.utcnow(),
    }

    await db.festivals.insert_one(festival)
    return {"message": "Festival created"}

# =========================================================
# SELLER RISK SNAPSHOT
# =========================================================

@router.get("/admin/sellers/{seller_id}/risk")
async def seller_risk_snapshot(
    seller_id: str,
    admin=Depends(require_role("admin")),
    db=Depends(get_db),
):
    seller = await db.users.find_one({"_id": ObjectId(seller_id), "role": "seller"})
    if not seller:
        raise HTTPException(404, "Seller not found")

    trust = seller.get("seller_profile", {}).get("trust", {})
    probation = seller.get("seller_probation")
    frozen = seller.get("seller_status") == "frozen"

    return {
        "seller_id": seller_id,
        "status": seller.get("seller_status"),
        "tier": seller.get("seller_tier"),
        "trust_score": trust.get("score", 0),
        "badges": trust.get("badges", []),
        "probation": probation,
        "frozen": frozen,
        "settlement_hours": seller.get("settlement_hours"),
        "commission_percent": seller.get("commission_percent"),
        "last_updated": seller.get("updated_at"),
    }

# =========================================================
# SELLER RISK DASHBOARD
# =========================================================

@router.get("/dashboard/sellers")
async def seller_risk_dashboard(
    admin=Depends(require_role("admin")),
    db=Depends(get_db),
):
    """
    Read-only seller risk overview.
    Used by admin dashboards & ops teams.
    """

    # --- Summary counts ---
    total_sellers = await db.users.count_documents({"role": "seller"})
    frozen_sellers = await db.users.count_documents({"seller_status": "frozen"})
    probation_sellers = await db.users.count_documents({
        "seller_probation.active": True
    })
    low_trust_sellers = await db.users.count_documents({
        "seller_profile.trust.score": {"$lt": 30}
    })

    # --- High risk sellers (detailed list) ---
    risky_sellers_cursor = db.users.find(
        {
            "role": "seller",
            "$or": [
                {"seller_status": "frozen"},
                {"seller_profile.trust.score": {"$lt": 30}},
                {"seller_probation.active": True},
            ]
        },
        {
            "email": 1,
            "seller_status": 1,
            "seller_tier": 1,
            "seller_profile.trust": 1,
            "seller_probation": 1,
            "created_at": 1,
        }
    ).sort("seller_profile.trust.score", 1).limit(50)

    risky_sellers = []
    async for s in risky_sellers_cursor:
        risky_sellers.append({
            "seller_id": str(s["_id"]),
            "email": s.get("email"),
            "status": s.get("seller_status"),
            "tier": s.get("seller_tier"),
            "trust_score": s.get("seller_profile", {}).get("trust", {}).get("score"),
            "probation": s.get("seller_probation", {}).get("active", False),
            "created_at": s.get("created_at"),
        })

    return {
        "summary": {
            "total_sellers": total_sellers,
            "frozen_sellers": frozen_sellers,
            "probation_sellers": probation_sellers,
            "low_trust_sellers": low_trust_sellers,
        },
        "risky_sellers": risky_sellers,
        "generated_at": datetime.utcnow(),
    }

# =========================================================
# FINANCE SUMMARY
# =========================================================

@router.get("/admin/finance/summary")
async def finance_summary(
    admin=Depends(require_role("admin")),
    db=Depends(get_db),
):
    pending_cod = await db.orders.aggregate([
        {"$match": {"payment.method": "COD", "payment.status": "pending"}},
        {"$group": {"_id": None, "amount": {"$sum": "$pricing.subtotal"}}}
    ]).to_list(1)

    unsettled = await db.orders.aggregate([
        {"$match": {"status": "delivered", "payment.status": "pending"}},
        {"$group": {"_id": None, "amount": {"$sum": "$pricing.seller_payout"}}}
    ]).to_list(1)

    reserve = await db.wallet_ledger.aggregate([
        {"$match": {"entry_type": "RESERVE_HOLD"}},
        {"$group": {"_id": None, "amount": {"$sum": "$credit"}}}
    ]).to_list(1)

    return {
        "pending_cod_amount": pending_cod[0]["amount"] if pending_cod else 0,
        "unsettled_payouts": unsettled[0]["amount"] if unsettled else 0,
        "reserve_locked": reserve[0]["amount"] if reserve else 0,
    }

# =========================================================
# ORDER SUMMARY
# =========================================================

@router.get("/admin/orders/summary")
async def order_summary(
    admin=Depends(require_role("admin")),
    db=Depends(get_db),
):
    total = await db.orders.count_documents({})
    delivered = await db.orders.count_documents({"status": "delivered"})
    rto = await db.orders.count_documents({"status": "rto"})
    refunds = await db.orders.count_documents({"return.refund_status": "completed"})

    return {
        "total_orders": total,
        "delivered_orders": delivered,
        "rto_orders": rto,
        "refunds_completed": refunds,
    }
