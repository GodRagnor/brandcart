from datetime import datetime
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24  # 24 hours
IN_PROGRESS_STALE_SECONDS = 60 * 10     # 10 minutes


async def reserve_idempotency_key(
    *,
    db,
    key: str,
    scope: str,
):
    """
    Reserve an idempotency key.
    If key already exists and is completed, return stored response.
    If key is stale in reserved state, expire it and allow retry.
    """
    existing = await db.idempotency_keys.find_one({
        "key": key,
        "scope": scope,
    })

    if existing:
        if existing.get("status") == "completed":
            return existing.get("response")

        created_at = existing.get("created_at")
        age_seconds = (
            (datetime.utcnow() - created_at).total_seconds()
            if created_at else 0
        )
        if age_seconds <= IN_PROGRESS_STALE_SECONDS and existing.get("status") in {"reserved", "processing"}:
            return {
                "message": "Request already in progress",
                "status": "processing",
            }

        await db.idempotency_keys.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "status": "expired",
                    "expired_at": datetime.utcnow(),
                }
            },
        )

    try:
        await db.idempotency_keys.insert_one({
            "key": key,
            "scope": scope,
            "status": "reserved",
            "response": None,
            "created_at": datetime.utcnow(),
        })
    except DuplicateKeyError:
        # Concurrent request won the race; return canonical response/state.
        concurrent = await db.idempotency_keys.find_one({"key": key, "scope": scope})
        if concurrent and concurrent.get("status") == "completed":
            return concurrent.get("response")
        return {
            "message": "Request already in progress",
            "status": "processing",
        }
    return None


async def complete_idempotency_key(
    *,
    db,
    key: str,
    scope: str,
    response: dict,
):
    """
    Mark idempotency key as completed and store response.
    """
    await db.idempotency_keys.find_one_and_update(
        {
            "key": key,
            "scope": scope,
        },
        {
            "$set": {
                "status": "completed",
                "response": response,
                "completed_at": datetime.utcnow(),
            }
        },
        return_document=ReturnDocument.AFTER,
    )


async def fail_idempotency_key(
    *,
    db,
    key: str,
    scope: str,
    error: str,
):
    """
    Mark idempotency key as failed so retries can be attempted explicitly.
    """
    await db.idempotency_keys.find_one_and_update(
        {"key": key, "scope": scope},
        {
            "$set": {
                "status": "failed",
                "error": error,
                "failed_at": datetime.utcnow(),
            }
        },
        return_document=ReturnDocument.AFTER,
    )


async def clear_idempotency_key(
    *,
    db,
    key: str,
    scope: str,
):
    await db.idempotency_keys.delete_one({"key": key, "scope": scope})
