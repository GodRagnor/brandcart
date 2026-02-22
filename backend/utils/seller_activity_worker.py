from datetime import datetime, timedelta
import asyncio
from database import get_db

CHECK_INTERVAL_SECONDS = 60 * 60  # run every 1 hour
WARNING_DAYS = 10
FREEZE_DAYS = 15


async def seller_inactivity_worker():
    db = get_db()

    while True:
        now = datetime.utcnow()

        warning_cutoff = now - timedelta(days=WARNING_DAYS)
        freeze_cutoff = now - timedelta(days=FREEZE_DAYS)

        # 1️⃣ SEND WARNING
        await db.users.update_many(
            {
                "role": "seller",
                "is_frozen": False,
                "last_active_at": {"$lte": warning_cutoff},
                "inactivity_warning_sent": {"$ne": True},
            },
            {
                "$set": {
                    "inactivity_warning_sent": True,
                    "warning_sent_at": now,
                }
            }
        )

        # 2️⃣ FREEZE SELLERS
        await db.users.update_many(
            {
                "role": "seller",
                "is_frozen": False,
                "last_active_at": {"$lte": freeze_cutoff},
            },
            {
                "$set": {
                    "is_frozen": True,
                    "freeze_reason": "INACTIVITY_15_DAYS",
                    "frozen_at": now,
                }
            }
        )

        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
