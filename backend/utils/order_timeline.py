from datetime import datetime
from bson import ObjectId

async def record_order_event(
    db,
    *,
    order_id,
    event: str,
    actor_role: str,
    actor_id=None,
    metadata: dict | None = None,
):
    """
    Single source of truth for order timeline events.
    """

    doc = {
        "order_id": ObjectId(order_id),
        "event": event,
        "actor_role": actor_role,
        "actor_id": ObjectId(actor_id) if actor_id else None,
        "metadata": metadata or {},
        "created_at": datetime.utcnow(),
    }

    await db.order_timeline.insert_one(doc)
