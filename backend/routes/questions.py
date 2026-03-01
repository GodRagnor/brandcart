from datetime import datetime
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import get_db
from utils.security import require_role

router = APIRouter(
    prefix="/api/questions",
    tags=["Questions"]
)


class CreateQuestion(BaseModel):
    question: str = Field(..., min_length=3, max_length=300)


@router.get("/product/{product_id}")
async def get_product_questions(product_id: str):
    db = get_db()
    try:
        product_oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product ID")

    product = await db.products.find_one({"_id": product_oid}, {"_id": 1})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    items = []
    cursor = db.product_questions.find(
        {"product_id": product_oid, "is_visible": True},
        {"question": 1, "answer": 1, "created_at": 1}
    ).sort("created_at", -1)

    async for row in cursor:
        items.append({
            "id": str(row["_id"]),
            "question": row.get("question"),
            "answer": row.get("answer"),
            "created_at": row.get("created_at"),
        })

    return {"count": len(items), "items": items}


@router.post("/product/{product_id}")
async def ask_product_question(
    product_id: str,
    data: CreateQuestion,
    buyer=Depends(require_role("buyer"))
):
    db = get_db()
    try:
        product_oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product ID")

    product = await db.products.find_one({"_id": product_oid})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    question = {
        "product_id": product_oid,
        "seller_id": product.get("seller_id"),
        "buyer_id": buyer["_id"],
        "question": data.question.strip(),
        "answer": None,
        "is_visible": True,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.product_questions.insert_one(question)

    return {
        "message": "Question submitted",
        "id": str(result.inserted_id),
    }
