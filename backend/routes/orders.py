from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime, timedelta
from fastapi import Request
import asyncio

from database import get_db
from utils.security import require_role
from utils.otp import generate_otp, hash_otp, verify_hash
from utils.wallet_service import add_ledger_entry
from utils.audit import log_audit
from utils.trust import apply_trust_event
from utils.wallet_service import process_return_refund
from utils.risk_guard import enforce_seller_risk
from utils.order_timeline import record_order_event
from utils.idempotency import (
    reserve_idempotency_key,
    complete_idempotency_key,
    fail_idempotency_key,
    clear_idempotency_key,
)
from utils.rate_limit import rate_limit
from utils.razorpay import (
    amount_to_paise,
    create_razorpay_order,
    verify_checkout_signature,
)
from config.env import RAZORPAY_KEY_ID
from pydantic import BaseModel
from utils.guards import parse_object_id


router = APIRouter(
    prefix="/api/orders",
    tags=["Orders"]
)

from config.constants import (
    MAX_COD_ORDER_VALUE,
    MAX_DAILY_COD_ORDERS,
    PLATFORM_FEE_PER_ORDER,
)


DELIVERY_OTP_EXPIRY_MINUTES = 30
COD_MIN_SECURITY_BALANCE = 199300
COD_DAILY_ORDER_LIMIT = 20
COD_RTO_PENALTY = 150
RETURN_WINDOW_DAYS = 7
SELLER_ACTION_HOURS = 48
ALLOWED_PAYMENT_METHODS = {"COD", "RAZORPAY"}


def normalize_payment_method(payment_method: str) -> str:
    method = (payment_method or "").strip().upper()
    if method not in ALLOWED_PAYMENT_METHODS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid payment method. Allowed: {', '.join(sorted(ALLOWED_PAYMENT_METHODS))}",
        )
    return method

class ReturnRequest(BaseModel):
    reason: str


class RazorpayVerifyPayload(BaseModel):
    order_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    idempotency_key: str


# ======================================================
# CREATE ORDER (BUYER)
# ======================================================

@router.post("/create")
async def create_order(
    request: Request,
    product_id: str = Query(...),
    quantity: int = Query(..., gt=0),
    payment_method: str = Query(...),
    address_id: str | None = Query(None),
    offer_id: str | None = Query(None),
    idempotency_key: str = Query(...),
    buyer=Depends(require_role("buyer")),
    db=Depends(get_db),
):
    now = datetime.utcnow()
    payment_method = normalize_payment_method(payment_method)
    product = None
    stock_reserved = False
    order_inserted = False

    buyer_risk = buyer.get("buyer_risk", {})
    penalty = 2 if buyer_risk.get("high_risk") else 1

    await rate_limit(
        db=db,
        key=f"create_order:{buyer['_id']}",
        max_requests=5,
        window_seconds=60,
        penalty_multiplier=penalty,
    )

    existing_response = await reserve_idempotency_key(
        db=db,
        key=idempotency_key,
        scope="create_order",
    )
    if existing_response:
        return existing_response

    try:
        product_oid = parse_object_id(product_id, "product_id")
        offer_oid = parse_object_id(offer_id, "offer_id") if offer_id else None

        product = await db.products.find_one({"_id": product_oid})
        if not product:
            raise HTTPException(404, "Product not found")

        base_price = product.get("selling_price")
        if base_price is None:
            raise HTTPException(400, "Product price not configured")

        seller = await db.users.find_one({"_id": product["seller_id"]})
        if not seller or seller.get("seller_status") != "verified":
            raise HTTPException(403, "Seller not verified")

        if seller.get("is_frozen") or seller.get("seller_status") == "frozen":
            raise HTTPException(403, "Seller account frozen")

        estimated_order_value = base_price * quantity
        enforce_seller_risk(
            seller=seller,
            payment_method=payment_method,
            order_value=estimated_order_value,
        )

        probation = seller.get("seller_probation") or {}
        is_probation_active = bool(probation.get("active"))
        restrictions = probation.get("restrictions", {}) if is_probation_active else {}

        if is_probation_active:
            if payment_method == "COD" and not restrictions.get("cod_enabled", False):
                raise HTTPException(403, "Seller under probation. COD disabled")

            max_daily_orders = restrictions.get("max_daily_orders")
            if max_daily_orders is not None:
                orders_today = seller.get("orders_today", 0)
                if orders_today >= max_daily_orders:
                    raise HTTPException(403, "Seller daily order limit reached (probation)")

            max_order_value = restrictions.get("max_order_value")
            if max_order_value is not None and estimated_order_value > max_order_value:
                raise HTTPException(403, "Order value exceeds seller probation limit")

        final_price = base_price
        applied_offer = None

        if offer_oid:
            offer = await db.seller_offers.find_one({
                "_id": offer_oid,
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

        if product.get("stock", 0) < quantity:
            raise HTTPException(400, "Insufficient stock")

        buyer_addresses = buyer.get("addresses", [])
        address = None
        if address_id:
            address = next((a for a in buyer_addresses if str(a["_id"]) == address_id), None)
        else:
            address = next((a for a in buyer_addresses if a.get("is_default")), None)
            if not address and buyer_addresses:
                address = buyer_addresses[0]

        if not address:
            raise HTTPException(400, "No address found. Please add an address first.")

        area = next(
            (a for a in seller.get("serviceable_areas", []) if a["pincode"] == address["pincode"]),
            None,
        )
        if not area or not area.get("delivery_enabled"):
            raise HTTPException(403, "Delivery not available to this pincode")

        if payment_method == "COD" and not seller.get("cod_settings", {}).get("enabled", False):
            raise HTTPException(403, "Seller has not enabled COD")

        subtotal = final_price * quantity
        commission_percent = seller.get(
            "commission_percent",
            5.0 if seller.get("seller_status") == "verified" else 8.0,
        )
        commission_amount = round(subtotal * commission_percent / 100, 2)
        platform_fee = float(PLATFORM_FEE_PER_ORDER)
        seller_payout = round(subtotal - commission_amount - platform_fee, 2)
        if seller_payout <= 0:
            raise HTTPException(400, "Order value too low for platform fee and commission policy")

        if payment_method == "COD":
            if subtotal > MAX_COD_ORDER_VALUE:
                raise HTTPException(403, "COD order value exceeds platform limit")
            if seller.get("cod_orders_today", 0) >= MAX_DAILY_COD_ORDERS:
                raise HTTPException(403, "Seller COD daily limit reached")

        result = await db.products.update_one(
            {"_id": product["_id"], "stock": {"$gte": quantity}},
            {"$inc": {"stock": -quantity, "reserved_stock": quantity}},
        )
        if result.modified_count == 0:
            raise HTTPException(400, "Stock reservation failed")
        stock_reserved = True

        amount_paise = amount_to_paise(subtotal)
        razorpay_order = None
        if payment_method == "RAZORPAY":
            razorpay_order = await asyncio.to_thread(
                create_razorpay_order,
                amount_paise=amount_paise,
                receipt=f"bc_{idempotency_key}"[:40],
                notes={
                    "buyer_id": str(buyer["_id"]),
                    "seller_id": str(seller["_id"]),
                    "product_id": str(product["_id"]),
                },
            )

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
                "platform_fee": platform_fee,
                "seller_payout": seller_payout,
                "offer": applied_offer,
            },
            "payment": {
                "method": payment_method,
                "status": "pending" if payment_method == "RAZORPAY" else "cod_pending",
                "gateway": "razorpay" if payment_method == "RAZORPAY" else None,
                "gateway_order_id": razorpay_order.get("id") if razorpay_order else None,
                "gateway_payment_id": None,
                "gateway_signature": None,
                "amount_paise": amount_paise if payment_method == "RAZORPAY" else None,
                "currency": "INR" if payment_method == "RAZORPAY" else None,
                "paid_at": None,
            },
            "delivery_address": address,
            "seller_snapshot": {
                "seller_id": str(seller["_id"]),
                "brand_name": seller.get("seller_profile", {}).get("brand_name"),
                "brand_logo": seller.get("seller_profile", {}).get("logo_url"),
                "trust_score": seller.get("seller_profile", {}).get("trust", {}).get("score", 0),
                "slug": seller.get("seller_profile", {}).get("slug"),
            },
            "status": "created",
            "delivered_at": None,
            "settled_at": None,
            "settlement": {
                "status": "pending",
                "settled_at": None,
                "release_type": "T+2" if seller.get("seller_status") == "verified" else "T+3/T+4",
            },
            "return": {"status": None, "reason": None},
            "created_at": now,
            "updated_at": now,
        }

        await db.orders.insert_one(order)
        order_inserted = True

        await record_order_event(
            db,
            order_id=order["_id"],
            event="ORDER_CREATED",
            actor_role="buyer",
            actor_id=buyer["_id"],
            metadata={"payment_method": payment_method, "subtotal": subtotal},
        )

        if applied_offer:
            await db.seller_offers.update_one(
                {"_id": applied_offer["offer_id"]},
                {"$inc": {"used_count": 1}},
            )

        response = {
            "message": "Order created successfully",
            "order_id": str(order["_id"]),
            "order_amount": subtotal,
            "platform_fee": platform_fee,
            "payment_method": payment_method,
            "offer_applied": bool(applied_offer),
        }

        if payment_method == "RAZORPAY":
            response["payment"] = {
                "gateway": "razorpay",
                "key_id": RAZORPAY_KEY_ID,
                "razorpay_order_id": razorpay_order.get("id"),
                "amount_paise": razorpay_order.get("amount", amount_paise),
                "currency": razorpay_order.get("currency", "INR"),
                "status": "pending",
            }

        await complete_idempotency_key(
            db=db,
            key=idempotency_key,
            scope="create_order",
            response=response,
        )
        return response
    except HTTPException:
        if stock_reserved and not order_inserted and product:
            await db.products.update_one(
                {"_id": product["_id"]},
                {"$inc": {"stock": quantity, "reserved_stock": -quantity}},
            )
        await clear_idempotency_key(db=db, key=idempotency_key, scope="create_order")
        raise
    except Exception as e:
        if stock_reserved and not order_inserted and product:
            await db.products.update_one(
                {"_id": product["_id"]},
                {"$inc": {"stock": quantity, "reserved_stock": -quantity}},
            )
        await fail_idempotency_key(
            db=db,
            key=idempotency_key,
            scope="create_order",
            error=str(e),
        )
        raise


@router.post("/payment/razorpay/verify")
async def verify_razorpay_payment(
    data: RazorpayVerifyPayload,
    buyer=Depends(require_role("buyer")),
    db=Depends(get_db),
):
    existing = await reserve_idempotency_key(
        db=db,
        key=data.idempotency_key,
        scope="razorpay_verify",
    )
    if existing:
        return existing
    try:
        try:
            order_oid = parse_object_id(data.order_id, "order_id")
        except Exception:
            raise HTTPException(400, "Invalid order_id")

        order = await db.orders.find_one({"_id": order_oid, "buyer_id": buyer["_id"]})
        if not order:
            raise HTTPException(404, "Order not found")

        payment = order.get("payment", {})
        if payment.get("method") != "RAZORPAY":
            raise HTTPException(400, "Order payment method is not Razorpay")

        if payment.get("status") == "paid":
            response = {"message": "Payment already verified", "order_id": data.order_id}
            await complete_idempotency_key(
                db=db,
                key=data.idempotency_key,
                scope="razorpay_verify",
                response=response,
            )
            return response

        if payment.get("status") != "pending":
            raise HTTPException(400, "Order is not in payable state")

        if payment.get("gateway_order_id") != data.razorpay_order_id:
            raise HTTPException(400, "Razorpay order id mismatch")

        if not verify_checkout_signature(
            razorpay_order_id=data.razorpay_order_id,
            razorpay_payment_id=data.razorpay_payment_id,
            razorpay_signature=data.razorpay_signature,
        ):
            raise HTTPException(401, "Invalid Razorpay signature")

        now = datetime.utcnow()
        await db.orders.update_one(
            {"_id": order_oid, "payment.status": "pending"},
            {
                "$set": {
                    "payment.status": "paid",
                    "payment.gateway_payment_id": data.razorpay_payment_id,
                    "payment.gateway_signature": data.razorpay_signature,
                    "payment.paid_at": now,
                    "updated_at": now,
                }
            },
        )

        await record_order_event(
            db=db,
            order_id=order_oid,
            event="PAYMENT_VERIFIED",
            actor_role="buyer",
            actor_id=buyer["_id"],
            metadata={
                "gateway": "razorpay",
                "razorpay_order_id": data.razorpay_order_id,
                "razorpay_payment_id": data.razorpay_payment_id,
            },
        )

        response = {
            "message": "Razorpay payment verified",
            "order_id": data.order_id,
            "payment_status": "paid",
        }
        await complete_idempotency_key(
            db=db,
            key=data.idempotency_key,
            scope="razorpay_verify",
            response=response,
        )
        return response
    except HTTPException:
        await clear_idempotency_key(
            db=db,
            key=data.idempotency_key,
            scope="razorpay_verify",
        )
        raise
    except Exception as e:
        await fail_idempotency_key(
            db=db,
            key=data.idempotency_key,
            scope="razorpay_verify",
            error=str(e),
        )
        raise

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
        "_id": parse_object_id(order_id, "order_id"),
        "seller_id": seller["_id"]
    })

    if not order:
        raise HTTPException(404, "Order not found")

    if order["status"] != "created":
        raise HTTPException(400, "Order cannot be shipped in current state")

    # 1ï¸âƒ£ Update order status
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

    # 2ï¸âƒ£ ORDER TIMELINE EVENT (18B.2)
    await record_order_event(
        db=db,
        order_id=order["_id"],
        event="ORDER_SHIPPED",
        actor_role="seller",
        actor_id=seller["_id"],
    )

    return {"message": "Order marked as shipped"}

# ======================================================
# SYSTEM â†’ GENERATE DELIVERY OTP
# ======================================================

@router.post("/system/delivery-reported/{order_id}")
async def generate_delivery_otp_system(
    order_id: str,
    admin=Depends(require_role("admin")),
):
    db = get_db()
    now = datetime.utcnow()

    order = await db.orders.find_one({"_id": parse_object_id(order_id, "order_id")})
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
        "_id": parse_object_id(order_id, "order_id"),
        "buyer_id": buyer["_id"]
    })
    if not order:
        raise HTTPException(404, "Order not found")

    if order.get("delivered_at"):
        raise HTTPException(400, "Order already delivered")

    payment = order.get("payment", {})
    if payment.get("method") == "RAZORPAY" and payment.get("status") != "paid":
        raise HTTPException(400, "Online payment not completed")

    generated_at = order.get("delivery_otp_generated_at")
    if not generated_at:
        raise HTTPException(400, "Delivery OTP not generated")

    if now > generated_at + timedelta(minutes=DELIVERY_OTP_EXPIRY_MINUTES):
        raise HTTPException(400, "OTP expired")

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
                "payment.status": "cod_pending" if payment.get("method") == "COD" else "paid",
                "settlement.status": "pending",
                "settlement.settled_at": None,
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

COD_RTO_PENALTY = 150          # flat â‚¹ penalty
COD_RTO_MAX_ALLOWED = 2       # after this, COD disabled
RTO_COMMISSION_LOCK = True

@router.post("/system/cod-rto/{order_id}")
async def cod_rto(
    order_id: str,
    reason: str,
    admin=Depends(require_role("admin")),
    db=Depends(get_db),
):
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
    order = await db.orders.find_one({"_id": parse_object_id(order_id, "order_id")})
    if not order:
        raise HTTPException(404, "Order not found")

    seller = await db.users.find_one({"_id": order["seller_id"]})
    seller_risk = (seller or {}).get("seller_profile", {}).get("risk", {})
    penalty = 2 if seller_risk.get("high_rto") else 1

    await rate_limit(
        db=db,
        key=f"cod_rto:{order_id}",
        max_requests=1,
        window_seconds=300,
        penalty_multiplier=penalty,
    )

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
        "_id": parse_object_id(order_id, "order_id"),
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
        "_id": parse_object_id(order_id, "order_id"),
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

        # Trust (positive â€“ seller cooperated)
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

        # Trust (negative â€“ seller refused return)
        await apply_trust_event(
            db=db,
            seller_id=seller["_id"],
            event="RETURN_REJECTED"
        )

        return {"message": "Return rejected"}

# =========================================================
# RETURN PICKUP â€” SCHEDULE
# =========================================================

@router.post("/system/schedule-pickup/{order_id}")
async def schedule_return_pickup(
    order_id: str,
    admin=Depends(require_role("admin")),
):
    db = get_db()
    now = datetime.utcnow()

    order = await db.orders.find_one({"_id": parse_object_id(order_id, "order_id")})
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
# RETURN PICKUP â€” COMPLETED
# =========================================================

@router.post("/system/pickup-complete/{order_id}")
async def pickup_completed(
    order_id: str,
    admin=Depends(require_role("admin")),
):
    db = get_db()
    now = datetime.utcnow()

    order = await db.orders.find_one({"_id": parse_object_id(order_id, "order_id")})
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
    admin=Depends(require_role("admin")),
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
    order = await db.orders.find_one({"_id": parse_object_id(order_id, "order_id")})
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
        "_id": parse_object_id(order_id, "order_id"),
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

    order = await db.orders.find_one({
        "_id": parse_object_id(order_id, "order_id"),
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

    order = await db.orders.find_one({
        "_id": parse_object_id(order_id, "order_id"),
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

