from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from database import get_db
from utils.security import require_roles

router = APIRouter(prefix="/api/wishlist", tags=["Wishlist"])


class WishlistSyncRequest(BaseModel):
    product_ids: list[str] = Field(default_factory=list, max_items=200)


def _parse_object_id(value) -> Optional[ObjectId]:
    try:
        return ObjectId(str(value))
    except Exception:
        return None


async def _build_wishlist_snapshot(db, product_ids) -> tuple[dict, list[ObjectId]]:
    ordered_ids = []
    seen_ids = set()
    for value in product_ids or []:
        product_id = _parse_object_id(value)
        if not product_id or product_id in seen_ids:
            continue
        seen_ids.add(product_id)
        ordered_ids.append(product_id)

    if not ordered_ids:
        return {"count": 0, "product_ids": []}, []

    active_products = await db.products.find(
        {"_id": {"$in": ordered_ids}, "active": True},
        {"_id": 1},
    ).to_list(len(ordered_ids))
    active_ids = {row["_id"] for row in active_products if row.get("_id")}
    canonical_ids = [product_id for product_id in ordered_ids if product_id in active_ids]

    return {
        "count": len(canonical_ids),
        "product_ids": [str(product_id) for product_id in canonical_ids],
    }, canonical_ids


@router.get("")
async def get_wishlist(
    user=Depends(require_roles("buyer", "seller")),
    db=Depends(get_db),
):
    response, _ = await _build_wishlist_snapshot(db, user.get("wishlist", []))
    return response


@router.post("/sync")
async def sync_wishlist(
    data: WishlistSyncRequest,
    user=Depends(require_roles("buyer", "seller")),
    db=Depends(get_db),
):
    response, canonical_ids = await _build_wishlist_snapshot(db, data.product_ids)
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"wishlist": canonical_ids, "updated_at": datetime.utcnow()}},
    )
    return response
