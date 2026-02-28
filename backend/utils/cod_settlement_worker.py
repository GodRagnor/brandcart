import asyncio
import logging
from datetime import datetime, timedelta

from database import get_db
from utils.wallet_service import process_order_settlement
from utils.trust import SELLER_TIER_CONFIG
from utils.order_timeline import record_order_event

CHECK_INTERVAL_SECONDS = 60 * 30  # every 30 minutes
logger = logging.getLogger(__name__)


async def cod_settlement_worker():
    db = get_db()

    while True:
        now = datetime.utcnow()

        cursor = db.orders.find({
            "status": "delivered",
            "$or": [
                {"payment.method": "COD", "payment.status": "cod_pending"},
                {"payment.method": "RAZORPAY", "payment.status": "paid"},
            ],
            "settlement.status": {"$ne": "settled"},
        })

        async for order in cursor:
            try:
                # ---- Safety: skip if already settled (idempotency)
                if order.get("settlement", {}).get("status") == "settled":
                    continue

                seller_id = order["seller_id"]
                seller = await db.users.find_one({"_id": seller_id})

                if not seller:
                    continue

                # ---- HARD BLOCK: frozen sellers never get settlement
                if seller.get("is_frozen") or seller.get("seller_status") == "frozen":
                    continue

                tier = seller.get("seller_tier", "standard")
                tier_config = SELLER_TIER_CONFIG.get(
                    tier,
                    SELLER_TIER_CONFIG["standard"]
                )

                settlement_hours = tier_config["settlement_hours"]
                reserve_percent = tier_config.get("reserve_percent", 0)

                delivered_at = order.get("delivered_at")
                if not delivered_at:
                    continue

                # ---- Settlement window not passed yet
                if now < delivered_at + timedelta(hours=settlement_hours):
                    continue

                # ---- Ledger-based settlement (single source of truth)
                await process_order_settlement(
                    db=db,
                    seller_id=seller_id,
                    order_id=order["_id"],
                    order_amount=order["pricing"]["subtotal"],
                    commission_percent=order["pricing"]["commission_percent"],
                    platform_fee=order["pricing"].get("platform_fee", 0),
                )

                reserve_amount = round(
                    order["pricing"]["subtotal"] * reserve_percent / 100,
                    2,
                )

                # ---- Mark order settled
                update_res = await db.orders.update_one(
                    {"_id": order["_id"], "settlement.status": {"$ne": "settled"}},
                    {
                        "$set": {
                            "payment.status": "settled",
                            "settlement.status": "settled",
                            "settlement.settled_at": now,
                            "settled_at": now,
                            "pricing.reserve_amount": reserve_amount,
                        }
                    }
                )

                # ---- Only log timeline if DB update actually happened
                if update_res.modified_count == 1:
                    try:
                        await record_order_event(
                            db=db,
                            order_id=order["_id"],
                            event="COD_SETTLED",
                            actor_role="system",
                            actor_id=None,
                            metadata={
                                "settlement_amount": order["pricing"]["seller_payout"],
                                "seller_tier": tier,
                            },
                        )
                    except Exception:
                        # Timeline must NEVER break settlement
                        logger.exception("TIMELINE_ERROR order=%s", order.get("_id"))

            except Exception:
                # Never crash the worker for one bad order
                logger.exception("COD_SETTLEMENT_ERROR order=%s", order.get("_id"))

        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
