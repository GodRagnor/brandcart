from datetime import datetime
from pymongo import ReturnDocument

IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24  # 24 hours


async def reserve_idempotency_key(
    *,
    db,
    key: str,
    scope: str,
):
    """
    Reserve an idempotency key.
    If key already exists, return stored response (if completed).
    """

    existing = await db.idempotency_keys.find_one({
        "key": key,
        "scope": scope,
    })

    if existing:
        # If already completed, return response
        if existing.get("status") == "completed":
            return existing.get("response")

        # In progress → block duplicate
        return {
            "message": "Request already in progress",
            "status": "processing"
        }

    await db.idempotency_keys.insert_one({
        "key": key,
        "scope": scope,
        "status": "reserved",
        "response": None,
        "created_at": datetime.utcnow(),
    })

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
