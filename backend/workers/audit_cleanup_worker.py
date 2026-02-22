import asyncio
from datetime import datetime, timedelta
from database import get_db

CHECK_INTERVAL_SECONDS = 60 * 60  # hourly
RETENTION_DAYS = 90


async def audit_cleanup_worker():
    db = get_db()

    while True:
        cutoff = datetime.utcnow() - timedelta(days=RETENTION_DAYS)

        await db.audit_logs.delete_many({
            "created_at": {"$lt": cutoff}
        })

        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
