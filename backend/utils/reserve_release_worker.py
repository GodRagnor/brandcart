import asyncio
import logging
from datetime import datetime, timedelta
from database import get_db
from utils.wallet_service import release_reserve

CHECK_INTERVAL_SECONDS = 60 * 60  # every 1 hour
RESERVE_HOLD_DAYS = 7
logger = logging.getLogger(__name__)


async def reserve_release_worker():
    db = get_db()

    while True:
        now = datetime.utcnow()
        cutoff_time = now - timedelta(days=RESERVE_HOLD_DAYS)

        cursor = db.orders.find({
            "status": "delivered",
            "delivered_at": {"$lte": cutoff_time},
            "reserve_released": {"$ne": True},
            "return.status": {"$ne": "approved"},
        })

        async for order in cursor:
            try:
                seller_id = order["seller_id"]
                order_id = order["_id"]
                reserve_amount = order.get("pricing", {}).get("reserve_amount", 0)

                if reserve_amount <= 0:
                    continue

                await release_reserve(
                    db=db,
                    seller_id=seller_id,
                    order_id=order_id,
                    reserve_amount=reserve_amount,
                )

                await db.orders.update_one(
                    {"_id": order_id},
                    {
                        "$set": {
                            "reserve_released": True,
                            "reserve_released_at": now,
                        }
                    }
                )

            except Exception:
                # Never crash worker for one bad order
                logger.exception("RESERVE_RELEASE_ERROR order=%s", order.get("_id"))

        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
