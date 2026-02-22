import asyncio
from datetime import datetime, timedelta

from database import get_db
from utils.wallet_service import process_order_settlement
from utils.trust import SELLER_TIER_CONFIG
from utils.order_timeline import record_order_event

CHECK_INTERVAL_SECONDS = 60 * 30  # every 30 minutes


async def cod_settlement_worker():
    db = get_db()

    while True:
        now = datetime.utcnow()

        cursor = db.orders.find({
            "status": "delivered",
            "payment.method": "COD",
            "payment.status": "pending",
        })

        async for order in cursor:
            try:
                # ---- Safety: skip if already settled (idempotency)
                if order.get("payment", {}).get("status") == "settled":
                    continue

                seller_id = order["seller_id"]
                seller = await db.users.find_one({"_id": seller_id})

                if not seller:
                    continue

                # ---- HARD BLOCK: frozen sellers never get settlement
                if seller.get("is_frozen"):
                    continue

                tier = seller.get("seller_tier", "standard")
                tier_config = SELLER_TIER_CONFIG.get(
                    tier,
                    SELLER_TIER_CONFIG["standard"]
                )

                settlement_hours = tier_config["settlement_hours"]
                commission_percent = tier_config["commission_percent"]
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
                    order_amount=order["amount"],
                    commission_percent=commission_percent,
                    reserve_percent=reserve_percent,
                )

                # ---- Mark order settled
                update_res = await db.orders.update_one(
                    {"_id": order["_id"], "payment.status": "pending"},
                    {
                        "$set": {
                            "payment.status": "settled",
                            "status": "settled",
                            "settled_at": now,
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
                    except Exception as timeline_err:
                        # Timeline must NEVER break settlement
                        print(
                            f"[TIMELINE_ERROR] order={order['_id']} err={timeline_err}"
                        )

            except Exception as e:
                # Never crash the worker for one bad order
                print(
                    f"[COD_SETTLEMENT_ERROR] order={order.get('_id')} err={str(e)}"
                )

        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
