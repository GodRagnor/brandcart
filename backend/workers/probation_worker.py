import asyncio
from datetime import datetime
from database import get_db

CHECK_INTERVAL = 60 * 60  # every hour

async def probation_worker():
    db = get_db()

    while True:
        now = datetime.utcnow()

        cursor = db.users.find({
            "seller_probation.active": True,
            "seller_probation.ends_at": {"$lte": now},
        })

        async for seller in cursor:
            await db.users.update_one(
                {"_id": seller["_id"]},
                {
                    "$set": {
                        "seller_probation.active": False,
                        "updated_at": now,
                    }
                }
            )

        await asyncio.sleep(CHECK_INTERVAL)
