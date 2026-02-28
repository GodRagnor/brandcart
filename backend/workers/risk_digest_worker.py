import logging
from datetime import datetime, timedelta

from database import get_db
from config.constants import LOW_TRUST_THRESHOLD

HIGH_RTO_THRESHOLD = 3
LOOKBACK_DAYS = 30
logger = logging.getLogger(__name__)


async def daily_risk_digest():
    """
    DAILY RISK DIGEST (READ-ONLY)
    -----------------------------
    - Low trust sellers
    - High RTO sellers
    - Frozen sellers
    - COD heavy sellers
    """

    db = get_db()
    since = datetime.utcnow() - timedelta(days=LOOKBACK_DAYS)

    low_trust = await db.users.find(
        {
            "role": "seller",
            "seller_profile.trust.score": {"$lt": LOW_TRUST_THRESHOLD},
        },
        {"_id": 1, "seller_profile.trust.score": 1},
    ).to_list(None)

    frozen_count = await db.users.count_documents({
        "role": "seller",
        "seller_status": "frozen",
    })

    high_rto = await db.orders.aggregate([
        {
            "$match": {
                "status": "rto",
                "updated_at": {"$gte": since},
            }
        },
        {
            "$group": {
                "_id": "$seller_id",
                "rto_count": {"$sum": 1},
            }
        },
        {
            "$match": {
                "rto_count": {"$gte": HIGH_RTO_THRESHOLD},
            }
        },
    ]).to_list(None)

    cod_heavy = await db.orders.aggregate([
        {
            "$match": {
                "payment.method": "COD",
                "created_at": {"$gte": since},
            }
        },
        {
            "$group": {
                "_id": "$seller_id",
                "cod_orders": {"$sum": 1},
            }
        },
        {
            "$match": {
                "cod_orders": {"$gte": 50},
            }
        },
    ]).to_list(None)

    logger.info(
        "DAILY_RISK_DIGEST low_trust=%s frozen=%s high_rto=%s cod_heavy=%s",
        len(low_trust),
        frozen_count,
        len(high_rto),
        len(cod_heavy),
    )
