from fastapi import APIRouter, Depends, HTTPException, Query
from bson import ObjectId
from datetime import datetime, timedelta
from fastapi import Request

from database import get_db
from utils.security import require_role
from utils.otp import generate_otp, hash_otp, verify_hash
from utils.wallet_service import add_ledger_entry
from utils.audit import log_audit
from utils.trust import apply_trust_event
from utils.wallet_service import process_return_refund
from utils.risk_guard import enforce_seller_risk
from utils.order_timeline import record_order_event
from utils.order_timeline import record_order_event
from utils.idempotency import reserve_idempotency_key, complete_idempotency_key
from utils.rate_limiter import rate_limit
from pydantic import BaseModel


router = APIRouter(
    prefix="/api/orders",
    tags=["Orders"]
)

from config.constants import (
    MAX_COD_ORDER_VALUE,
    MAX_DAILY_COD_ORDERS,
)

from utils.idempotency import (
    reserve_idempotency_key,
    complete_idempotency_key,
)

DELIVERY_OTP_EXPIRY_MINUTES = 30
COD_MIN_SECURITY_BALANCE = 199300
COD_DAILY_ORDER_LIMIT = 20
COD_RTO_PENALTY = 150
RETURN_WINDOW_DAYS = 7
SELLER_ACTION_HOURS = 48

class ReturnRequest(BaseModel):
    reason: str


# ======================================================
# CREATE ORDER (BUYER)
# ======================================================

@router.post("/create")
async def create_order(
    request: Request,            # <-- KEEP request (safe, future-proof)
    product_id: str = Query(...),
    quantity: int = Query(..., gt=0),
    payment_method: str = Query(...),
    address_id: str = Query(...),
    offer_id: str | None = Query(None),
    idempotency_key: str = Query(...),
    buyer=Depends(require_role("buyer")),
    db=Depends(get_db),
):
    now = datetime.utcnow()

    # Buyer risk-aware rate limit
    buyer_risk = buyer.get("buyer_risk", {})
    penalty = 2 if buyer_risk.get("high_risk") else 1

    # ✅ RATE LIMIT (CUSTOM)
    await rate_limit(
        db=db,
        key=f"create_order:{buyer['_id']}",
        max_requests=5,
        window_seconds=60,
        penalty_multiplier=penalty,
    )

    # idempotency guard (already correct)
    existing_response = await reserve_idempotency_key(
        db=db,
        key=idempotency_key,
        scope="create_order",
    )
    if existing_response:
        return existing_response

    # 1️⃣ Fetch product
    product = await db.products.find_one({"_id": ObjectId(product_id)})
    if not product:
        raise HTTPException(404, "Product not found")

    base_price = product.get("selling_price")
    if base_price is None:
        raise HTTPException(400, "Product price not configured")

    # 2️⃣ Fetch seller
    seller = await db.users.find_one({"_id": product["seller_id"]})
    if not seller or seller.get("seller_status") != "verified":
        raise HTTPException(403, "Seller not verified")

    if seller.get("is_frozen"):
        raise HTTPException(403, "Seller account frozen")
    
    # ----------------------------------
# CENTRALIZED RISK ENFORCEMENT (STEP 17)
# ----------------------------------
    enforce_seller_risk(
       seller=seller,
       payment_method=payment_method,
       order_value=subtotal,
    )


# =====================================================
# PROBATION ENFORCEMENT (Step 15 style safety layer)
# =====================================================

    probation = seller.get("seller_probation")

    if probation and probation.get("active"):
        restrictions = probation.get("restrictions", {})

    if payment_method == "COD" and not restrictions.get("cod_enabled", False):
        raise HTTPException(
            status_code=403,
            detail="Seller under probation. COD disabled"
        )

    orders_today = seller.get("orders_today", 0)
    if orders_today >= restrictions.get("max_daily_orders", 0):
        raise HTTPException(
            status_code=403,
            detail="Seller daily order limit reached (probation)"
        )

    if subtotal > restrictions.get("max_order_value", 0):
        raise HTTPException(
            status_code=403,
            detail="Order value exceeds seller probation limit"
        )


    # 3️⃣ Resolve final price (SELLER-CONTROLLED OFFER)
    final_price = base_price
    applied_offer = None

    if offer_id:
        offer = await db.seller_offers.find_one({
            "_id": ObjectId(offer_id),
            "seller_id": seller["_id"],
            "product_id": product["_id"],
            "status": "active",
            "start_at": {"$lte": now},
            "end_at": {"$gte": now},
        })

        if not offer:
            raise HTTPException(400, "Invalid or expired offer")

        final_price = offer["offer_price"]
        applied_offer = {
            "offer_id": offer["_id"],
            "festival_id": offer.get("festival_id"),
            "offer_price": final_price,
        }

    # 4️⃣ Stock check
    if product.get("stock", 0) < quantity:
        raise HTTPException(400, "Insufficient stock")

    # 5️⃣ Address snapshot
    address = next(
        (a for a in buyer.get("addresses", []) if str(a["_id"]) == address_id),
        None
    )
    if not address:
        raise HTTPException(400, "Invalid address")

    # 6️⃣ Serviceability
    area = next(
        (a for a in seller.get("serviceable_areas", []) if a["pincode"] == address["pincode"]),
        None
    )
    if not area or not area.get("delivery_enabled"):
        raise HTTPException(403, "Delivery not available to this pincode")

    if payment_method == "COD":
        if not seller.get("cod_settings", {}).get("enabled", False):
            raise HTTPException(403, "Seller has not enabled COD")


    # 7️⃣ Pricing
    subtotal = final_price * quantity
    commission_percent = seller.get("commission_percent", 8.0)
    commission_amount = round(subtotal * commission_percent / 100, 2)
    seller_payout = round(subtotal - commission_amount, 2)

    if payment_method == "COD":
        if subtotal > MAX_COD_ORDER_VALUE:
            raise HTTPException(403, "COD order value exceeds platform limit")

    if seller.get("cod_orders_today", 0) >= MAX_DAILY_COD_ORDERS:
        raise HTTPException(403, "Seller COD daily limit reached")


    # 8️⃣ Reserve stock (SAFE)
    result = await db.products.update_one(
        {"_id": product["_id"], "stock": {"$gte": quantity}},
        {"$inc": {"stock": -quantity, "reserved_stock": quantity}},
    )
    if result.modified_count == 0:
        raise HTTPException(400, "Stock reservation failed")

    # 9️⃣ Create order
    order = {
        "buyer_id": buyer["_id"],
        "seller_id": seller["_id"],
        "product_id": product["_id"],
        "quantity": quantity,

        "pricing": {
            "unit_price": final_price,
            "subtotal": subtotal,
            "commission_percent": commission_percent,
            "commission_amount": commission_amount,
            "seller_payout": seller_payout,
            "offer": applied_offer,
        },

        "payment": {
            "method": payment_method,
            "status": "paid" if payment_method == "ONLINE" else "cod_pending",
        },

        "delivery_address": address,

        "status": "created",
        "delivered_at": None,
        "settled_at": None,

        "return": {
            "status": None,
            "reason": None,
        },

        "created_at": now,
        "updated_at": now,
    }

    await db.orders.insert_one(order)

    await record_order_event(
        db,
        order_id=order["_id"],
        event="ORDER_CREATED",
        actor_role="buyer",
        actor_id=buyer["_id"],
        metadata={
           "payment_method": payment_method,
           "subtotal": subtotal,
        }
    )   

    # 🔟 Increment offer usage (ONLY after order success)
    if applied_offer:
        await db.seller_offers.update_one(
            {"_id": applied_offer["offer_id"]},
            {"$inc": {"used_count": 1}}
        )

    response = {
    "message": "Order created successfully",
    "order_amount": subtotal,
    "payment_method": payment_method,
    "offer_applied": bool(applied_offer),
}

    await complete_idempotency_key(
        db=db,
        key=idempotency_key,
        scope="create_order",
        response=response,
    )

    return response

# ======================================================
# SELLER MARK ORDER AS SHIPPED
# ======================================================

@router.post("/seller/mark-shipped/{order_id}")
async def seller_mark_shipped(
    order_id: str,
    seller=Depends(require_role("seller")),
):
    db = get_db()
    now = datetime.utcnow()

    order = await db.orders.find_one({
        "_id": ObjectId(order_id),
        "seller_id": seller["_id"]
    })

    if not order:
        raise HTTPException(404, "Order not found")

    if order["status"] != "created":
        raise HTTPException(400, "Order cannot be shipped in current state")

    # 1️⃣ Update order status
    await db.orders.update_one(
        {"_id": order["_id"]},
        {
            "$set": {
                "status": "shipped",
                "updated_at": now
            },
            "$push": {
                "tracking": {
                    "status": "SHIPPED",
                    "message": "Seller marked order as shipped",
                    "at": now
                }
            }
        }
    )

    # 2️⃣ ORDER TIMELINE EVENT (18B.2)
    await record_order_event(
        db=db,
        order_id=order["_id"],
        event="ORDER_SHIPPED",
        actor_role="seller",
        actor_id=seller["_id"],
    )

    return {"message": "Order marked as shipped"}

# ======================================================
# SYSTEM → GENERATE DELIVERY OTP
# ======================================================

@router.post("/system/delivery-reported/{order_id}")
async def generate_delivery_otp_system(order_id: str):
    db = get_db()
    now = datetime.utcnow()

    order = await db.orders.find_one({"_id": ObjectId(order_id)})
    if not order:
        raise HTTPException(404, "Order not found")

    if order["status"] != "shipped":
        raise HTTPException(400, "Order not eligible for OTP")

    if order.get("delivery_otp_hash"):
        raise HTTPException(400, "OTP already generated")

    otp = generate_otp()
    await db.orders.update_one(
        {"_id": order["_id"]},
        {
            "$set": {
                "delivery_otp_hash": hash_otp(otp),
                "delivery_otp_generated_at": now,
                "status": "delivery_otp_pending",
                "updated_at": now
            }
        }
    )
    
    await record_order_event(
        db,
        order_id=order["_id"],
        event="DELIVERY_OTP_GENERATED",
        actor_role="system",
    )

    print("DELIVERY OTP:", otp)
    return {"otp_sent": True}

# ======================================================
# BUYER CONFIRM DELIVERY
# ======================================================

@router.post("/buyer/confirm-delivery/{order_id}")
async def confirm_delivery(
    order_id: str,
    otp: str,
    buyer=Depends(require_role("buyer")),
):
    db = get_db()
    now = datetime.utcnow()

    order = await db.orders.find_one({
        "_id": ObjectId(order_id),
        "buyer_id": buyer["_id"]
    })
    if not order:
        raise HTTPException(404, "Order not found")

    if order.get("delivered_at"):
        raise HTTPException(400, "Order already delivered")

    if not verify_hash(otp, order.get("delivery_otp_hash")):
        raise HTTPException(400, "Invalid OTP")

    product = await db.products.find_one({"_id": order["product_id"]})
    qty = order["quantity"]

    if product.get("reserved_stock", 0) < qty:
        raise HTTPException(409, "Reserved stock corrupted")

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
                "payment.status": "settled",
                "updated_at": now
            },
            "$unset": {
                "delivery_otp_hash": "",
                "delivery_otp_generated_at": ""
            }
        }
    )

    await record_order_event(
        db,
        order_id=order["_id"],
        event="ORDER_DELIVERED",
        actor_role="buyer",
        actor_id=buyer["_id"],
    )

    return {"message": "Delivery confirmed successfully"}

# ======================================================
# COD RTO HANDLING 
# ======================================================

COD_RTO_PENALTY = 150          # flat ₹ penalty
COD_RTO_MAX_ALLOWED = 2       # after this, COD disabled
RTO_COMMISSION_LOCK = True

@router.post("/system/cod-rto/{order_id}")
async def cod_rto(
    order_id: str,
    reason: str,
    system=Depends(require_role("system")),
    db=Depends(get_db),
):
    seller = await db.users.find_one({"_id": order["seller_id"]})
    seller_risk = seller.get("seller_profile", {}).get("risk", {})

    penalty = 2 if seller_risk.get("high_rto") else 1

    await rate_limit(
        db=db,
        key=f"cod_rto:{order_id}",
        max_requests=1,
        window_seconds=300,
        penalty_multiplier=penalty,
    )
    
# ---------------- IDENTITY ----------------  
    idempotency_key = f"cod_rto:{order_id}"

    existing = await reserve_idempotency_key(
        db=db,
        key=idempotency_key,
        scope="cod_rto",
    )

    if existing:
        return existing
    
    now = datetime.utcnow()

    # --------------------------------------------------
    # 1. FETCH ORDER
    # --------------------------------------------------
    order = await db.orders.find_one({"_id": ObjectId(order_id)})
    if not order:
        raise HTTPException(404, "Order not found")

    # Idempotency guard
    if order.get("status") == "rto":
        return {"ignored": True}

    # --------------------------------------------------
    # 2. VALIDATE COD STATE
    # --------------------------------------------------
    if order["payment"]["method"] != "COD":
        return {"ignored": True}

    if order["status"] not in ("created", "shipped", "out_for_delivery"):
        raise HTTPException(400, "Invalid RTO state")

    seller_id = order["seller_id"]
    buyer_id = order["buyer_id"]

    # --------------------------------------------------
    # 3. WALLET PENALTIES (APPEND-ONLY)
    # --------------------------------------------------
    await add_ledger_entry(
        db=db,
        seller_id=seller_id,
        entry_type="COD_RTO_PENALTY",
        debit=COD_RTO_PENALTY,
        order_id=order["_id"],
        reason_code="COD_RTO",
    )

    commission_amount = order["pricing"].get("commission_amount", 0)

    if RTO_COMMISSION_LOCK and commission_amount > 0:
        await add_ledger_entry(
            db=db,
            seller_id=seller_id,
            entry_type="COMMISSION_LOCK",
            debit=commission_amount,
            order_id=order["_id"],
            reason_code="COD_RTO_COMMISSION_LOCK",
        )

    # --------------------------------------------------
    # 4. RELEASE RESERVED STOCK (SAFE)
    # --------------------------------------------------
    await db.products.update_one(
        {"_id": order["product_id"]},
        {
            "$inc": {
                "reserved_stock": -order["quantity"],
                "stock": order["quantity"],
            }
        }
    )

    # --------------------------------------------------
    # 5. UPDATE ORDER
    # --------------------------------------------------
    await db.orders.update_one(
        {"_id": order["_id"]},
        {
            "$set": {
                "status": "rto",
                "rto": {
                    "reason": reason,
                    "penalty_applied": COD_RTO_PENALTY,
                    "rto_at": now,
                },
                "updated_at": now,
            }
        }
    )

    # --------------------------------------------------
    # 6. BUYER COD RISK UPDATE
    # --------------------------------------------------
    buyer = await db.users.find_one({"_id": buyer_id})
    cod_rto_count = buyer.get("buyer_risk", {}).get("cod_rto_count", 0) + 1

    buyer_updates = {
        "$inc": {"buyer_risk.cod_rto_count": 1},
        "$set": {"buyer_risk.last_cod_rto_at": now},
    }

    # Disable COD if threshold crossed
    if cod_rto_count >= COD_RTO_MAX_ALLOWED:
        buyer_updates["$set"]["buyer_risk.cod_disabled"] = True

    await db.users.update_one({"_id": buyer_id}, buyer_updates)

    # --------------------------------------------------
    # 7. TRUST PENALTY (SELLER)
    # --------------------------------------------------
    await apply_trust_event(
        db=db,
        seller_id=seller_id,
        event="COD_RTO",
    )

    # --------------------------------------------------
    # 8. AUDIT (MANDATORY)
    # --------------------------------------------------
    await log_audit(
        db=db,
        actor_id="system",
        actor_role="system",
        action="COD_RTO",
        metadata={
            "order_id": str(order["_id"]),
            "seller_id": str(seller_id),
            "buyer_id": str(buyer_id),
            "penalty": COD_RTO_PENALTY,
            "reason": reason,
        },
    )

    await record_order_event(
    db=db,
    order_id=order["_id"],
    event="ORDER_RTO",
    actor_role="system",
    actor_id=None,
    metadata={
        "penalty": COD_RTO_PENALTY
    }
)

    response = {"message": "COD RTO processed"}

    await complete_idempotency_key(
        db=db,
        key=idempotency_key,
       scope="cod_rto",
       response=response,
    )

    return response

# ======================================================
# RETURN REQUEST (BUYER) 
# ======================================================

@router.post("/{order_id}/return-request")
async def request_return(
    order_id: str,
    data: dict,  # { "reason": "damaged / wrong item / etc" }
    buyer=Depends(require_role("buyer")),
    db=Depends(get_db),
):
    now = datetime.utcnow()
    reason = data.get("reason")

    if not reason:
        raise HTTPException(400, "Return reason required")

    # --------------------------------------------------
    # 1. BUYER RISK / ABUSE CHECK (BEFORE ANY DB WRITE)
    # --------------------------------------------------
    risk = buyer.get("buyer_risk", {})
    orders = risk.get("orders_count", 0)
    returns = risk.get("return_count", 0)

    if risk.get("blocked"):
        raise HTTPException(
            403,
            "Buyer account restricted due to abuse"
        )

    if orders >= 5 and (returns / orders) > 0.4:
        raise HTTPException(
            403,
            "Return privileges restricted due to excessive returns"
        )

    # --------------------------------------------------
    # 2. FETCH ORDER (OWNERSHIP)
    # --------------------------------------------------
    order = await db.orders.find_one({
        "_id": ObjectId(order_id),
        "buyer_id": buyer["_id"]
    })

    if not order:
        raise HTTPException(404, "Order not found")

    # --------------------------------------------------
    # 3. ELIGIBILITY CHECKS
    # --------------------------------------------------
    if order.get("status") != "delivered":
        raise HTTPException(400, "Return allowed only after delivery")

    delivered_at = order.get("delivered_at")
    if not delivered_at:
        raise HTTPException(400, "Invalid delivery state")

    RETURN_WINDOW_DAYS = 7
    if now > delivered_at + timedelta(days=RETURN_WINDOW_DAYS):
        raise HTTPException(400, "Return window expired")

    if order.get("return", {}).get("status") is not None:
        raise HTTPException(400, "Return already requested")

    # --------------------------------------------------
    # 4. CREATE RETURN (SINGLE SOURCE OF TRUTH)
    # --------------------------------------------------
    SELLER_ACTION_HOURS = 48
    seller_deadline = now + timedelta(hours=SELLER_ACTION_HOURS)

    await db.orders.update_one(
        {"_id": order["_id"]},
        {
            "$set": {
                "return": {
                    "status": "requested",
                    "reason": reason,
                    "requested_at": now,

                    # seller decision
                    "seller_action_deadline": seller_deadline,
                    "seller_action": None,
                    "seller_action_reason": None,
                    "approved_by": None,

                    # pickup
                    "pickup_status": None,
                    "pickup_at": None,

                    # resolution
                    "resolution": None,       # refund | replace
                    "refund_amount": None,
                    "refund_status": None,
                },
                "updated_at": now
            }
        }
    )

    # --------------------------------------------------
    # 5. UPDATE BUYER RISK (AFTER SUCCESS ONLY)
    # --------------------------------------------------
    await db.users.update_one(
        {"_id": buyer["_id"]},
        {
            "$inc": {"buyer_risk.return_count": 1},
            "$set": {"buyer_risk.last_return_at": now}
        }
    )

    # --------------------------------------------------
    # 6. AUDIT (NON-NEGOTIABLE)
    # --------------------------------------------------
    await log_audit(
        db=db,
        actor_id=str(buyer["_id"]),
        actor_role="buyer",
        action="RETURN_REQUESTED",
        metadata={
            "order_id": str(order["_id"]),
            "seller_id": str(order["seller_id"]),
            "reason": reason
        }
    )
    
    await record_order_event(
        db,
        order_id=order["_id"],
        event="RETURN_REQUESTED",
        actor_role="buyer",
        actor_id=buyer["_id"],
        metadata={
            "reason": reason,
        }   
    )

    return {
        "message": "Return requested",
        "seller_action_deadline": seller_deadline
    }

# ======================================================
# SELLER RESPOND TO RETURN REQUEST
# ======================================================

@router.post("/seller/return-action/{order_id}")
async def seller_return_action(
    order_id: str,
    action: str,  # "accept" or "reject"
    seller=Depends(require_role("seller")),
):
    db = get_db()
    now = datetime.utcnow()

    if action not in ["accept", "reject"]:
        raise HTTPException(400, "Invalid action")

    order = await db.orders.find_one({
        "_id": ObjectId(order_id),
        "seller_id": seller["_id"]
    })

    if not order:
        raise HTTPException(404, "Order not found")

    ret = order.get("return")
    if not ret or ret.get("status") != "requested":
        raise HTTPException(400, "No active return request")

    # Prevent double action
    if ret.get("seller_action") is not None:
        raise HTTPException(400, "Return already handled")

    if action == "accept":
        # ----------------------------
        # ACCEPT RETURN
        # ----------------------------
        await db.orders.update_one(
            {"_id": order["_id"]},
            {
                "$set": {
                    "return.status": "approved",
                    "return.seller_action": "approved",
                    "return.approved_by": seller["_id"],
                    "return.approved_at": now,
                    "updated_at": now
                }
            }
        )

        # Timeline event
        await record_order_event(
            db=db,
            order_id=order["_id"],
            event="RETURN_APPROVED_BY_SELLER",
            actor_role="seller",
            actor_id=seller["_id"],
        )

        # Trust (positive – seller cooperated)
        await apply_trust_event(
            db=db,
            seller_id=seller["_id"],
            event="RETURN_APPROVED"
        )

        return {"message": "Return approved"}

    else:
        # ----------------------------
        # REJECT RETURN
        # ----------------------------
        await db.orders.update_one(
            {"_id": order["_id"]},
            {
                "$set": {
                    "return.status": "rejected",
                    "return.seller_action": "rejected",
                    "return.rejected_by": seller["_id"],
                    "return.rejected_at": now,
                    "updated_at": now
                }
            }
        )

        # Timeline event
        await record_order_event(
            db=db,
            order_id=order["_id"],
            event="RETURN_REJECTED_BY_SELLER",
            actor_role="seller",
            actor_id=seller["_id"],
        )

        # Trust (negative – seller refused return)
        await apply_trust_event(
            db=db,
            seller_id=seller["_id"],
            event="RETURN_REJECTED"
        )

        return {"message": "Return rejected"}

# =========================================================
# RETURN PICKUP — SCHEDULE
# =========================================================

@router.post("/system/schedule-pickup/{order_id}")
async def schedule_return_pickup(order_id: str):
    db = get_db()
    now = datetime.utcnow()

    order = await db.orders.find_one({"_id": ObjectId(order_id)})
    if not order:
        raise HTTPException(404, "Order not found")

    ret = order.get("return")
    if not ret or ret.get("status") != "approved":
        raise HTTPException(400, "Return not approved")

    if ret.get("pickup_status") == "scheduled":
        return {"message": "Pickup already scheduled"}

    await db.orders.update_one(
        {"_id": order["_id"]},
        {"$set": {
            "return.pickup_status": "scheduled",
            "return.pickup_at": now,
            "updated_at": now
        }}
    )

    await log_audit(
        db,
        actor_id="system",
        actor_role="system",
        action="RETURN_PICKUP_SCHEDULED",
        metadata={"order_id": order_id}
    )

    await record_order_event(
    db=db,
    order_id=order["_id"],
    event="RETURN_PICKUP_SCHEDULED",
    actor_role="system",
    actor_id=None,
)

    return {"message": "Pickup scheduled"}

# =========================================================
# RETURN PICKUP — COMPLETED
# =========================================================

@router.post("/system/pickup-complete/{order_id}")
async def pickup_completed(order_id: str):
    db = get_db()
    now = datetime.utcnow()

    order = await db.orders.find_one({"_id": ObjectId(order_id)})
    if not order:
        raise HTTPException(404, "Order not found")

    ret = order.get("return")
    if not ret or ret.get("pickup_status") != "scheduled":
        raise HTTPException(400, "Pickup not scheduled")

    await db.orders.update_one(
        {"_id": order["_id"]},
        {"$set": {
            "return.pickup_status": "picked_up",
            "return.pickup_completed_at": now,
            "updated_at": now
        }}
    )

    await record_order_event(
    db=db,
    order_id=order["_id"],
    event="RETURN_PICKUP_COMPLETED",
    actor_role="system",
    actor_id=None,
)

    return {"message": "Pickup completed"}

# ==========================================================
# SYSTEM REFUND
# ==========================================================

SELLER_FAULT_REASONS = {
    "damaged",
    "wrong_item",
    "missing_item",
    "defective",
}

@router.post("/system/refund/{order_id}")
async def system_refund(
    order_id: str,
    system=Depends(require_role("system")),
    db=Depends(get_db),
):
    await rate_limit(
        db=db,
        key=f"refund:{order_id}",
        max_requests=1,
        window_seconds=600,
    )

    idempotency_key = f"refund:{order_id}"

    existing = await reserve_idempotency_key(
        db=db,
        key=idempotency_key,
        scope="system_refund",
    )

    if existing:
        return existing
    
    now = datetime.utcnow()

    # ------------------------------------------------------
    # 1. Fetch order
    # ------------------------------------------------------
    order = await db.orders.find_one({"_id": ObjectId(order_id)})
    if not order:
        raise HTTPException(404, "Order not found")

    ret = order.get("return")
    if not ret or ret.get("status") != "approved":
        raise HTTPException(400, "Return not approved")

    # ------------------------------------------------------
    # 2. Idempotency (CRITICAL)
    # ------------------------------------------------------
    if ret.get("refund_status") == "completed":
        return {"message": "Refund already processed"}

    seller_id = order["seller_id"]
    refund_amount = order["pricing"]["seller_payout"]
    reason = ret.get("reason")

    # ------------------------------------------------------
    # 3. Wallet ledger refund (seller loses payout)
    # ------------------------------------------------------
    await process_return_refund(
        db=db,
        seller_id=seller_id,
        order_id=order["_id"],
        refund_amount=refund_amount,
    )

    # ------------------------------------------------------
    # 4. Update order state
    # ------------------------------------------------------
    await db.orders.update_one(
        {"_id": order["_id"]},
        {
            "$set": {
                "return.refund_status": "completed",
                "return.refund_amount": refund_amount,
                "return.refunded_at": now,
                "updated_at": now,
            }
        },
    )

    # ------------------------------------------------------
    # 5. Trust events (18C = 12B + 13C)
    # ------------------------------------------------------

    # Always applied: refund completed (neutral / positive)
    await apply_trust_event(
        db=db,
        seller_id=seller_id,
        event="RETURN_APPROVED",
    )

    # Conditional seller-fault penalty
    if reason in SELLER_FAULT_REASONS:
        await apply_trust_event(
            db=db,
            seller_id=seller_id,
            event="SELLER_FAULT_RETURN",
        )

    # ------------------------------------------------------
    # 6. Audit (non-negotiable)
    # ------------------------------------------------------
    await log_audit(
        db=db,
        actor_id="system",
        actor_role="system",
        action="SYSTEM_REFUND",
        metadata={
            "order_id": str(order["_id"]),
            "seller_id": str(seller_id),
            "refund_amount": refund_amount,
            "reason": reason,
            "seller_fault": reason in SELLER_FAULT_REASONS,
        },
    )

    # ------------------------------------------------------
    # 7. Timeline event
    # ------------------------------------------------------
    await record_order_event(
        db=db,
        order_id=order["_id"],
        event="REFUND_COMPLETED",
        actor_role="system",
        actor_id=None,
        metadata={
            "refund_amount": refund_amount,
            "reason": reason,
        },
    )
    
    response = {"message": "Refund processed successfully"}

    await complete_idempotency_key(
        db=db,
        key=idempotency_key,
       scope="system_refund",
       response=response,
    )

    return response

# ======================================================
# RETURN STATUS
# ======================================================

@router.get("/{order_id}/return-status")
async def buyer_return_status(
    order_id: str,
    buyer=Depends(require_role("buyer"))
):
    db = get_db()

    order = await db.orders.find_one({
        "_id": ObjectId(order_id),
        "buyer_id": buyer["_id"]
    })

    if not order:
        raise HTTPException(404, "Order not found")

    ret = order.get("return")
    if not ret:
        return {"return": None}

    return {
        "order_id": order_id,
        "return": {
            "status": ret.get("status"),
            "reason": ret.get("reason"),
            "requested_at": ret.get("requested_at"),
            "seller_action_deadline": ret.get("seller_action_deadline"),
            "pickup_status": ret.get("pickup_status"),
            "pickup_completed_at": ret.get("pickup_completed_at"),
            "refund_status": ret.get("refund_status"),
            "refund_amount": ret.get("refund_amount"),
            "refunded_at": ret.get("refunded_at")
        }
    }


# =========================================================
# ORDER TIMELINE (BUYER VIEW)
# =========================================================

@router.get("/{order_id}/timeline")
async def get_order_timeline_buyer(
    order_id: str,
    buyer=Depends(require_role("buyer")),
    db=Depends(get_db),
):
    from bson import ObjectId

    order = await db.orders.find_one({
        "_id": ObjectId(order_id),
        "buyer_id": buyer["_id"],
    })

    if not order:
        raise HTTPException(404, "Order not found")

    events = await db.order_timeline.find(
        {"order_id": order["_id"]},
        {"_id": 0}
    ).sort("created_at", 1).to_list(None)

    return {
        "order_id": order_id,
        "events": events
    }

# =========================================================
# ORDER TIMELINE (SELLER VIEW)
# =========================================================

@router.get("/seller/{order_id}/timeline")
async def get_order_timeline_seller(
    order_id: str,
    seller=Depends(require_role("seller")),
    db=Depends(get_db),
):
    from bson import ObjectId

    order = await db.orders.find_one({
        "_id": ObjectId(order_id),
        "seller_id": seller["_id"],
    })

    if not order:
        raise HTTPException(404, "Order not found")

    events = await db.order_timeline.find(
        {"order_id": order["_id"]},
        {"_id": 0}
    ).sort("created_at", 1).to_list(None)

    return {
        "order_id": order_id,
        "events": events
    }
