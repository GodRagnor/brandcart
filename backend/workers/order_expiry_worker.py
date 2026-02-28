import asyncio
import logging
from datetime import datetime, timedelta
from database import get_db
from utils.order_timeline import record_order_event

CHECK_INTERVAL_SECONDS = 60 * 5  # every 5 minutes
RAZORPAY_PAYMENT_TIMEOUT_MINUTES = 15
logger = logging.getLogger(__name__)


async def order_expiry_worker():
    db = get_db()

    while True:
        now = datetime.utcnow()
        cutoff = now - timedelta(minutes=RAZORPAY_PAYMENT_TIMEOUT_MINUTES)

        cursor = db.orders.find({
            "payment.method": "RAZORPAY",
            "payment.status": "pending",
            "created_at": {"$lte": cutoff},
            "status": "created",
        })

        async for order in cursor:
            try:
                # Cancel order
                await db.orders.update_one(
                    {"_id": order["_id"]},
                    {
                        "$set": {
                            "status": "cancelled",
                            "updated_at": now,
                            "cancel_reason": "RAZORPAY_PAYMENT_TIMEOUT",
                        }
                    }
                )

                # Release reserved stock if order expired before payment
                await db.products.update_one(
                    {
                        "_id": order["product_id"],
                        "reserved_stock": {"$gte": order.get("quantity", 0)},
                    },
                    {"$inc": {"stock": order.get("quantity", 0), "reserved_stock": -order.get("quantity", 0)}},
                )

                # Timeline event
                await record_order_event(
                    db=db,
                    order_id=order["_id"],
                    event="ORDER_PAYMENT_TIMEOUT",
                    actor_role="system",
                    actor_id=None,
                    metadata=None,
                )

            except Exception:
                logger.exception("ORDER_EXPIRY_ERROR")

        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
