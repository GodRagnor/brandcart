from fastapi import APIRouter, Request, HTTPException
from datetime import datetime
import hmac
import hashlib
import json
import os

from bson import ObjectId
from database import get_db
from utils.order_timeline import record_order_event
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
