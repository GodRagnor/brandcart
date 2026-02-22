from datetime import datetime

async def log_audit(
    db,
    actor_id: str,
    actor_role: str,
    action: str,
    metadata: dict | None = None
):
    await db.audit_logs.insert_one({
        "actor_id": actor_id,
        "actor_role": actor_role,
        "action": action,
        "metadata": metadata or {},
        "created_at": datetime.utcnow()
    })
