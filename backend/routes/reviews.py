from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from datetime import datetime

from database import get_db
from utils.security import require_role
from utils.guards import parse_object_id

router = APIRouter(
    prefix="/api/reviews",
    tags=["Reviews"]
)

# -------------------------------------------------
# SCHEMA
# -------------------------------------------------

class CreateReview(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: str | None = None


# -------------------------------------------------
# CREATE REVIEW (BUYER ONLY)
# -------------------------------------------------

@router.post("/{order_id}")
async def create_review(
    order_id: str,
    data: CreateReview,
    buyer=Depends(require_role("buyer"))
):
    db = get_db()

    # 1️⃣ Validate order ownership + delivered status
    order = await db.orders.find_one({
        "_id": parse_object_id(order_id, "order_id"),
        "buyer_id": buyer["_id"],
        "status": "delivered"
    })

    if not order:
        raise HTTPException(
            status_code=400,
            detail="Order not eligible for review"
        )

    # 2️⃣ Prevent duplicate review
    existing = await db.reviews.find_one({
        "order_id": parse_object_id(order_id, "order_id")
    })

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Review already submitted for this order"
        )

    # 3️⃣ Insert review
    review = {
        "order_id": order["_id"],
        "product_id": order["product_id"],
        "seller_id": order["seller_id"],
        "buyer_id": buyer["_id"],

        "rating": data.rating,
        "comment": data.comment,

        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),

        "is_visible": True,
        "admin_note": None
    }

    await db.reviews.insert_one(review)

    # 4️⃣ Recalculate product rating (aggregation)
    pipeline = [
        {
            "$match": {
                "product_id": order["product_id"],
                "is_visible": True
            }
        },
        {
            "$group": {
                "_id": "$product_id",
                "avg": {"$avg": "$rating"},
                "count": {"$sum": 1}
            }
        }
    ]

    agg = await db.reviews.aggregate(pipeline).to_list(1)

    if agg:
        await db.products.update_one(
            {"_id": order["product_id"]},
            {
                "$set": {
                    "rating.avg": round(agg[0]["avg"], 1),
                    "rating.count": agg[0]["count"]
                }
            }
        )

    return {
        "message": "Review submitted successfully",
        "rating": data.rating
    }


# -------------------------------------------------
# PUBLIC: GET PRODUCT REVIEWS
# -------------------------------------------------

@router.get("/product/{product_id}")
async def get_product_reviews(product_id: str):
    db = get_db()

    reviews = []

    cursor = db.reviews.find(
        {
            "product_id": parse_object_id(product_id, "product_id"),
            "is_visible": True
        },
        {
            "rating": 1,
            "comment": 1,
            "created_at": 1
        }
    ).sort("created_at", -1)

    async for r in cursor:
        reviews.append({
            "rating": r["rating"],
            "comment": r.get("comment"),
            "created_at": r["created_at"]
        })

    return {
        "count": len(reviews),
        "reviews": reviews
    }
