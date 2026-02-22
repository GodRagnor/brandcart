from datetime import datetime, timedelta
from database import get_db
from config.constants import LOW_TRUST_THRESHOLD, HIGH_RTO_THRESHOLD

LOW_TRUST_THRESHOLD = 30
HIGH_RTO_THRESHOLD = 3
LOOKBACK_DAYS = 30

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

    # 1️⃣ Low trust sellers
    low_trust = await db.users.find(
        {
            "role": "seller",
            "seller_profile.trust.score": {"$lt": LOW_TRUST_THRESHOLD},
        },
        {"_id": 1, "seller_profile.trust.score": 1}
    ).to_list(None)

    # 2️⃣ Frozen sellers
    frozen_count = await db.users.count_documents({
        "role": "seller",
        "seller_status": "frozen"
    })

    # 3️⃣ High RTO sellers (last 30 days)
    high_rto = await db.orders.aggregate([
        {
            "$match": {
                "status": "rto",
                "updated_at": {"$gte": since}
            }
        },
        {
            "$group": {
                "_id": "$seller_id",
                "rto_count": {"$sum": 1}
            }
        },
        {
            "$match": {
                "rto_count": {"$gte": HIGH_RTO_THRESHOLD}
            }
        }
    ]).to_list(None)

    # 4️⃣ COD heavy sellers (awareness only)
    cod_heavy = await db.orders.aggregate([
        {
            "$match": {
                "payment.method": "COD",
                "created_at": {"$gte": since}
            }
        },
        {
            "$group": {
                "_id": "$seller_id",
                "cod_orders": {"$sum": 1}
            }
        },
        {
            "$match": {
                "cod_orders": {"$gte": 50}
            }
        }
    ]).to_list(None)

    # 📊 PRINT / LOG (replace with Slack / Email later)
    print("===== DAILY RISK DIGEST =====")
    print("Low trust sellers:", len(low_trust))
    print("Frozen sellers:", frozen_count)
    print("High RTO sellers:", len(high_rto))
    print("COD heavy sellers:", len(cod_heavy))
    print("=============================")
