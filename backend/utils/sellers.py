from database import get_db

async def get_verified_seller(db, seller_id):
    return await db.users.find_one({
        "_id": seller_id,
        "role": "seller",
        "seller_status": "verified",
        "is_frozen": False
    })
