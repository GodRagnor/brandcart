from fastapi import APIRouter, Request, HTTPException
from datetime import datetime
import hmac
import hashlib
import json
import os

from bson import ObjectId
from database import get_db
from utils.order_timeline import record_order_event
from utils.razorpay import verify_webhook_signature
from utils.payouts import verify_razorpayx_webhook_signature
from utils.idempotency import (
    reserve_idempotency_key,
    complete_idempotency_key,
)

router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])

DELIVERY_SECRET = os.getenv("DELIVERY_WEBHOOK_SECRET")


# =========================================================
# SIGNATURE VERIFICATION
# =========================================================

def verify_signature(raw_body: bytes, received_signature: str):
    if not DELIVERY_SECRET:
        raise HTTPException(500, "Webhook secret not configured")

    computed = hmac.new(
        DELIVERY_SECRET.encode(),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(computed, received_signature):
        raise HTTPException(401, "Invalid webhook signature")


# =========================================================
# DELIVERY WEBHOOK (IDEMPOTENT, SAFE)
# =========================================================

@router.post("/delivery")
async def delivery_webhook(request: Request):
    """
    Courier delivery webhook.

    Guarantees:
    - Signature verified
    - Fully idempotent
    - Timeline only (no money movement)
    - Safe for retries
    """

    signature = request.headers.get("X-Delivery-Signature")
    if not signature:
        raise HTTPException(401, "Missing signature")

    raw_body = await request.body()
    verify_signature(raw_body, signature)

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception:
        raise HTTPException(400, "Invalid JSON payload")

    waybill = payload.get("waybill")
    status = payload.get("status")
    delivered_at = payload.get("delivered_at")

    if not waybill or not status:
        return {"ok": True, "ignored": True}

    db = get_db()

    # -----------------------------------------------------
    # IDEMPOTENCY GUARD (CRITICAL)
    # -----------------------------------------------------
    idempotency_key = f"delivery:{waybill}:{status}"

    existing = await reserve_idempotency_key(
        db=db,
        key=idempotency_key,
        scope="delivery_webhook",
    )

    if existing:
        return existing

    # -----------------------------------------------------
    # FIND ORDER
    # -----------------------------------------------------
    order = await db.orders.find_one({
        "tracking.tracking_id": waybill
    })

    if not order:
        response = {"ok": True, "order": "not_found"}
        await complete_idempotency_key(
            db=db,
            key=idempotency_key,
            scope="delivery_webhook",
            response=response,
        )
        return response

    # -----------------------------------------------------
    # RECORD TIMELINE EVENT (SOURCE OF TRUTH)
    # -----------------------------------------------------
    await record_order_event(
        db=db,
        order_id=order["_id"],
        event="COURIER_STATUS_UPDATE",
        actor_role="system",
        actor_id=None,
        metadata={
            "waybill": waybill,
            "courier_status": status,
            "delivered_at": delivered_at,
        }
    )

    # -----------------------------------------------------
    # OPTIONAL STATE UPDATE (NON-FINAL)
    # -----------------------------------------------------
    if status == "DELIVERED":
        await db.orders.update_one(
            {"_id": order["_id"]},
            {
                "$set": {
                    "status": "delivery_reported",
                    "delivery_reported_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                }
            }
        )

    response = {"ok": True}

    await complete_idempotency_key(
        db=db,
        key=idempotency_key,
        scope="delivery_webhook",
        response=response,
    )

    return response


@router.post("/razorpay")
async def razorpay_webhook(request: Request):
    signature = request.headers.get("X-Razorpay-Signature")
    if not signature:
        raise HTTPException(401, "Missing Razorpay signature")

    raw_body = await request.body()
    if not verify_webhook_signature(raw_body=raw_body, received_signature=signature):
        raise HTTPException(401, "Invalid Razorpay signature")

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception:
        raise HTTPException(400, "Invalid JSON payload")

    event = payload.get("event")
    payment_entity = (
        payload.get("payload", {})
        .get("payment", {})
        .get("entity", {})
    )

    razorpay_payment_id = payment_entity.get("id")
    razorpay_order_id = payment_entity.get("order_id")
    payment_status = payment_entity.get("status")

    if not razorpay_payment_id or not razorpay_order_id:
        return {"ok": True, "ignored": True}

    db = get_db()
    idempotency_key = f"razorpay:{event}:{razorpay_payment_id}"

    existing = await reserve_idempotency_key(
        db=db,
        key=idempotency_key,
        scope="razorpay_webhook",
    )
    if existing:
        return existing

    if event != "payment.captured" or payment_status != "captured":
        response = {"ok": True, "ignored": True, "event": event}
        await complete_idempotency_key(
            db=db,
            key=idempotency_key,
            scope="razorpay_webhook",
            response=response,
        )
        return response

    order = await db.orders.find_one({
        "payment.method": "RAZORPAY",
        "payment.gateway_order_id": razorpay_order_id,
    })

    if not order:
        response = {"ok": True, "order": "not_found"}
        await complete_idempotency_key(
            db=db,
            key=idempotency_key,
            scope="razorpay_webhook",
            response=response,
        )
        return response

    if order.get("payment", {}).get("status") == "paid":
        response = {"ok": True, "order": "already_paid"}
        await complete_idempotency_key(
            db=db,
            key=idempotency_key,
            scope="razorpay_webhook",
            response=response,
        )
        return response

    now = datetime.utcnow()
    update_res = await db.orders.update_one(
        {"_id": order["_id"], "payment.status": "pending"},
        {
            "$set": {
                "payment.status": "paid",
                "payment.gateway_payment_id": razorpay_payment_id,
                "payment.paid_at": now,
                "updated_at": now,
            }
        },
    )

    if update_res.modified_count == 1:
        await record_order_event(
            db=db,
            order_id=order["_id"],
            event="PAYMENT_CAPTURED_WEBHOOK",
            actor_role="system",
            actor_id=None,
            metadata={
                "gateway": "razorpay",
                "razorpay_order_id": razorpay_order_id,
                "razorpay_payment_id": razorpay_payment_id,
            },
        )

    response = {"ok": True, "updated": update_res.modified_count == 1}
    await complete_idempotency_key(
        db=db,
        key=idempotency_key,
        scope="razorpay_webhook",
        response=response,
    )
    return response


@router.post("/razorpayx/payouts")
async def razorpayx_payout_webhook(request: Request):
    signature = request.headers.get("X-Razorpay-Signature")
    if not signature:
        raise HTTPException(401, "Missing RazorpayX signature")

    raw_body = await request.body()
    if not verify_razorpayx_webhook_signature(raw_body=raw_body, received_signature=signature):
        raise HTTPException(401, "Invalid RazorpayX signature")

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception:
        raise HTTPException(400, "Invalid JSON payload")

    event = payload.get("event")
    payout_entity = (
        payload.get("payload", {})
        .get("payout", {})
        .get("entity", {})
    )

    provider_payout_id = payout_entity.get("id")
    provider_status = payout_entity.get("status")
    reference_id = payout_entity.get("reference_id")
    failure_reason = payout_entity.get("status_details", {}).get("description") or payout_entity.get("narration")

    if not provider_payout_id:
        return {"ok": True, "ignored": True}

    db = get_db()
    idempotency_key = f"razorpayx_payout:{event}:{provider_payout_id}"
    existing = await reserve_idempotency_key(
        db=db,
        key=idempotency_key,
        scope="razorpayx_payout_webhook",
    )
    if existing:
        return existing

    payout_request = await db.payout_requests.find_one({
        "$or": [
            {"provider_payout_id": provider_payout_id},
            {"_id": ObjectId(reference_id)} if ObjectId.is_valid(reference_id or "") else {"_id": None},
        ]
    })

    if not payout_request:
        response = {"ok": True, "request": "not_found"}
        await complete_idempotency_key(
            db=db,
            key=idempotency_key,
            scope="razorpayx_payout_webhook",
            response=response,
        )
        return response

    update_fields = {
        "provider": "razorpayx",
        "provider_payout_id": provider_payout_id,
        "provider_payout_status": provider_status,
        "provider_event": event,
        "provider_webhook_at": datetime.utcnow(),
    }

    normalized_status = (provider_status or "").lower()
    if normalized_status in {"processed"}:
        update_fields["status"] = "approved"
        update_fields["transfer_processed_at"] = datetime.utcnow()
    elif normalized_status in {"rejected", "failed", "reversed", "cancelled"}:
        update_fields["status"] = "failed"
        update_fields["failure_reason"] = failure_reason or "Provider marked payout failed"
        update_fields["failed_at"] = datetime.utcnow()
    elif normalized_status in {"queued", "pending", "processing"}:
        update_fields["status"] = "processing"

    await db.payout_requests.update_one(
        {"_id": payout_request["_id"]},
        {"$set": update_fields},
    )

    response = {
        "ok": True,
        "request_id": str(payout_request["_id"]),
        "provider_status": provider_status,
    }
    await complete_idempotency_key(
        db=db,
        key=idempotency_key,
        scope="razorpayx_payout_webhook",
        response=response,
    )
    return response
