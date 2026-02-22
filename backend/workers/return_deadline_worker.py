import asyncio
from datetime import datetime
from database import get_db
from utils.order_timeline import record_order_event

CHECK_INTERVAL_SECONDS = 60 * 10  # every 10 min


async def return_deadline_worker():
    db = get_db()

    while True:
        now = datetime.utcnow()

        cursor = db.orders.find({
            "return.status": "requested",
            "return.seller_action_deadline": {"$lte": now},
        })

        async for order in cursor:
            try:
                await db.orders.update_one(
                    {"_id": order["_id"]},
                    {
                        "$set": {
                            "return.status": "rejected",
                            "return.seller_action": "auto_rejected",
                            "return.seller_action_at": now,
                            "updated_at": now,
                        }
                    }
                )

                await record_order_event(
                    db=db,
                    order_id=order["_id"],
                    event="RETURN_AUTO_REJECTED",
                    actor_role="system",
                    actor_id=None,
                    metadata=None,
                )

            except Exception as e:
                print("RETURN_DEADLINE_ERROR:", str(e))

        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
