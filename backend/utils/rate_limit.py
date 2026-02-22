from datetime import datetime, timedelta
from fastapi import HTTPException

async def rate_limit(
    db,
    key: str,
    max_requests: int,
    window_seconds: int,
    *,
    penalty_multiplier: int = 1,
):
    now = datetime.utcnow()
    window_start = now - timedelta(seconds=window_seconds)

    record = await db.rate_limits.find_one({
        "key": key,
        "created_at": {"$gte": window_start},
    })

    effective_limit = max_requests // penalty_multiplier
    effective_limit = max(1, effective_limit)

    if record and record["count"] >= effective_limit:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later.",
        )

    await db.rate_limits.update_one(
        {"key": key},
        {
            "$inc": {"count": 1},
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
