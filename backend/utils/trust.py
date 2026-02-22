from datetime import datetime, timedelta
from typing import Dict, Any, Optional

from utils.audit import log_audit

# ============================================================
# TRUST ENGINE — Brandcart (Authoritative Policy Layer)
# ============================================================
# Controls:
# - Trust score
# - Badges
# - Tier auto-upgrade
# - Settlement hours
# - Commission %
# - Reserve %
# - Auto-freeze on abuse
# ============================================================


# ============================================================
# STEP 15A — TRUST DELTA MAP (SINGLE SOURCE OF TRUTH)
# ============================================================

def trust_delta_for_event(event: str) -> int:
    """
    Maps system events to trust score deltas.
    THIS is the only place trust deltas are defined.
    """
    mapping = {
        # Order lifecycle
        "ORDER_DELIVERED": 2,
        "ORDER_CANCELLED_BY_SELLER": -5,
        "ORDER_CANCELLED_BY_BUYER": 0,
        "ORDER_REFUNDED": -3,

        # Reviews
        "REVIEW_5_STAR": 3,
        "REVIEW_4_STAR": 2,
        "REVIEW_3_STAR": 0,
        "REVIEW_2_STAR": -2,
        "REVIEW_1_STAR": -4,

        # Returns
        "RETURN_APPROVED": -4,
        "RETURN_REJECTED": 1,
        "SELLER_FAULT_RETURN": -8,

        # RTO
        "COD_RTO": -6,
    }

    return mapping.get(event, 0)


# ============================================================
# STEP 15B — SELLER TIER CONFIG (POLICY ENGINE)
# ============================================================

SELLER_TIER_CONFIG = {
    "standard": {
        "settlement_hours": 72,
        "commission_percent": 8.0,
        "reserve_percent": 10,
    },
    "verified_fast": {
        "settlement_hours": 48,
        "commission_percent": 6.0,
        "reserve_percent": 5,
    },
    "premium": {
        "settlement_hours": 24,
        "commission_percent": 5.0,
        "reserve_percent": 3,
    },
}


# ============================================================
# STEP 15C — TIER DETERMINATION (PURE FUNCTION)
# ============================================================

def determine_seller_tier(trust: Dict[str, Any]) -> str:
    score = trust.get("score", 0)
    total_orders = trust.get("total_orders", 0)
    cancellation_rate = trust.get("cancellation_rate", 1)

    if (
        score >= 80
        and total_orders >= 50
        and cancellation_rate <= 0.05
    ):
        return "premium"

    if (
        score >= 60
        and total_orders >= 10
        and cancellation_rate <= 0.08
    ):
        return "verified_fast"

    return "standard"


# ============================================================
# STEP 15D — FULL TRUST RECOMPUTATION (SAFE REPAIR ENGINE)
# ============================================================

async def compute_seller_trust(db, seller: dict) -> Dict[str, Any]:
    seller_id = seller["_id"]

    # -------------------------
    # ORDER STATS
    # -------------------------
    total_orders = await db.orders.count_documents({
        "seller_id": seller_id
    })

    delivered_orders = await db.orders.count_documents({
        "seller_id": seller_id,
        "status": "delivered"
    })

    cancelled_orders = await db.orders.count_documents({
        "seller_id": seller_id,
        "status": "cancelled"
    })

    cancellation_rate = (
        cancelled_orders / total_orders
        if total_orders > 0 else 0
    )

    # -------------------------
    # TRUST SCORE
    # -------------------------
    score = 0
    badges = []

    if seller.get("seller_status") == "verified":
        score += 20
        badges.append("VERIFIED_SELLER")

    if total_orders >= 10 and cancellation_rate <= 0.05:
        score += 20
        badges.append("LOW_CANCELLATION")

    if total_orders >= 10:
        delivery_ratio = delivered_orders / max(total_orders, 1)
        if delivery_ratio >= 0.9:
            score += 20
            badges.append("FAST_DELIVERY")

    score += min(30, delivered_orders // 10)
    score = max(0, min(score, 100))

    trust_snapshot = {
        "score": score,
        "badges": badges,
        "total_orders": total_orders,
        "delivered_orders": delivered_orders,
        "cancelled_orders": cancelled_orders,
        "cancellation_rate": round(cancellation_rate, 3),
    }

    new_tier = determine_seller_tier(trust_snapshot)

    await db.users.update_one(
        {"_id": seller_id},
        {
            "$set": {
                "seller_profile.trust": {
                    "score": score,
                    "badges": badges,
                    "last_computed_at": datetime.utcnow(),
                },
                "seller_tier": new_tier,
                "settlement_hours": SELLER_TIER_CONFIG[new_tier]["settlement_hours"],
                "commission_percent": SELLER_TIER_CONFIG[new_tier]["commission_percent"],
                "updated_at": datetime.utcnow(),
            }
        }
    )

    trust_snapshot["tier"] = new_tier
    return trust_snapshot


# ============================================================
# STEP 15E — APPLY TRUST EVENT (REAL-TIME)
# ============================================================

async def apply_trust_event(
    db,
    *,
    seller_id,
    event: str,
    extra_updates: Optional[Dict[str, Any]] = None
):
    delta = trust_delta_for_event(event)

    update = {
        "$inc": {
            "seller_profile.trust.score": delta
        },
        "$set": {
            "seller_profile.trust.last_updated": datetime.utcnow()
        }
    }

    if extra_updates:
        update["$set"].update(extra_updates)

    await db.users.update_one(
        {"_id": seller_id},
        update
    )

    seller = await db.users.find_one({"_id": seller_id})
    trust_data = await compute_seller_trust(db, seller)

    await log_audit(
        db=db,
        actor_id="system",
        actor_role="system",
        action="TRUST_EVENT_APPLIED",
        metadata={
            "seller_id": str(seller_id),
            "event": event,
            "delta": delta,
            "new_tier": trust_data["tier"],
        }
    )


# ============================================================
# STEP 15F — AUTO FREEZE (SELLER ABUSE PROTECTION)
# ============================================================

TRUST_FREEZE_SCORE = 30
SELLER_FAULT_RETURN_LIMIT = 3
RETURN_LOOKBACK_DAYS = 30

async def enforce_trust_freeze(db, seller_id):
    now = datetime.utcnow()
    since = now - timedelta(days=RETURN_LOOKBACK_DAYS)

    seller_fault_returns = await db.orders.count_documents({
        "seller_id": seller_id,
        "return.status": "approved",
        "return.resolution": "refund",
        "return.approved_by": "system",
        "updated_at": {"$gte": since},
    })

    seller = await db.users.find_one({"_id": seller_id})
    trust_score = seller.get("seller_profile", {}).get("trust", {}).get("score", 0)

    if (
        trust_score <= TRUST_FREEZE_SCORE
        and seller_fault_returns >= SELLER_FAULT_RETURN_LIMIT
        and seller.get("seller_status") == "verified"
    ):
        await db.users.update_one(
            {"_id": seller_id},
            {
                "$set": {
                    "seller_status": "frozen",
                    "seller_frozen_reason": "EXCESSIVE_SELLER_FAULT_RETURNS",
                    "seller_frozen_at": now,
                    "updated_at": now,
                }
            }
        )

        await log_audit(
            db=db,
            actor_id="system",
            actor_role="system",
            action="SELLER_AUTO_FROZEN",
            metadata={
                "seller_id": str(seller_id),
                "trust_score": trust_score,
                "seller_fault_returns": seller_fault_returns,
            }
        )
