import asyncio
from datetime import datetime, timedelta
from database import get_db
from utils.order_timeline import record_order_event

CHECK_INTERVAL_SECONDS = 60 * 5  # every 5 minutes
ONLINE_PAYMENT_TIMEOUT_MINUTES = 15


async def order_expiry_worker():
    db = get_db()

    while True:
        now = datetime.utcnow()
        cutoff = now - timedelta(minutes=ONLINE_PAYMENT_TIMEOUT_MINUTES)

        cursor = db.orders.find({
            "payment.method": "ONLINE",
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
                            "cancel_reason": "ONLINE_PAYMENT_TIMEOUT",
                        }
                    }
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

            except Exception as e:
                print("ORDER_EXPIRY_ERROR:", str(e))

        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
