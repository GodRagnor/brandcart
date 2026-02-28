import asyncio
from datetime import datetime
from database import get_db
from utils.wallet_service import process_return_refund, release_reserve

CHECK_INTERVAL = 60 * 15  # every 15 minutes

async def auto_process_returns():
    db = get_db()
    now = datetime.utcnow()

    cursor = db.orders.find({
        "return.status": "approved",
        "return.refund_status": {"$ne": "completed"},
    })

    async for order in cursor:
        seller_id = order["seller_id"]
        order_id = order["_id"]
        refund_amount = order["pricing"].get("seller_payout", order["pricing"]["subtotal"])
        reserve_amount = order["pricing"].get("reserve_amount", 0)

        # 1️⃣ Refund buyer impact (ledger)
        await process_return_refund(
            db=db,
            seller_id=seller_id,
            order_id=order_id,
            refund_amount=refund_amount,
        )

        # 2️⃣ Release reserve
        if reserve_amount > 0:
            await release_reserve(
                db=db,
                seller_id=seller_id,
                order_id=order_id,
                reserve_amount=reserve_amount,
            )

        # 3️⃣ Mark refund processed
        await db.orders.update_one(
            {"_id": order_id},
            {
                "$set": {
                    "return.refund_processed": True,
                    "return.refund_status": "completed",
                    "return.refunded_at": now,
                    "updated_at": now,
                }
            }
        )

async def return_worker():
    while True:
        await auto_process_returns()
        await asyncio.sleep(CHECK_INTERVAL)
