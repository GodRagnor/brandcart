from datetime import datetime
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import get_db
from utils.security import require_role

router = APIRouter(prefix="/api/cart", tags=["Cart"])


class CartAddItem(BaseModel):
    product_id: str
    quantity: int = Field(..., gt=0)


class CartUpdateItem(BaseModel):
    quantity: int = Field(..., gt=0)


@router.get("")
async def get_cart(
    buyer=Depends(require_role("buyer")),
    db=Depends(get_db),
):
    cart = buyer.get("cart", [])
    items = []
    subtotal = 0

    for item in cart:
        product = await db.products.find_one({"_id": item["product_id"]})
        if not product:
            continue

        qty = int(item.get("quantity", 1))
        unit_price = float(product.get("selling_price", 0))
        line_total = round(unit_price * qty, 2)
        subtotal += line_total

        items.append({
            "product_id": str(product["_id"]),
            "title": product.get("title"),
            "images": product.get("images") or product.get("image_urls") or [],
            "quantity": qty,
            "unit_price": unit_price,
            "line_total": line_total,
            "stock": product.get("stock", 0),
        })

    return {
        "count": len(items),
        "items": items,
        "subtotal": round(subtotal, 2),
    }


@router.post("/add")
async def add_to_cart(
    data: CartAddItem,
    buyer=Depends(require_role("buyer")),
    db=Depends(get_db),
):
    try:
        product_id = ObjectId(data.product_id)
    except Exception:
        raise HTTPException(400, "Invalid product_id")

    product = await db.products.find_one({"_id": product_id, "active": True})
    if not product:
        raise HTTPException(404, "Product not found")

    if data.quantity > product.get("stock", 0):
        raise HTTPException(400, "Quantity exceeds available stock")

    cart = buyer.get("cart", [])
    updated = False
    for item in cart:
        if item.get("product_id") == product_id:
            item["quantity"] = data.quantity
            item["updated_at"] = datetime.utcnow()
            updated = True
            break

    if not updated:
        cart.append({
            "product_id": product_id,
            "quantity": data.quantity,
            "added_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        })

    await db.users.update_one(
        {"_id": buyer["_id"]},
        {"$set": {"cart": cart, "updated_at": datetime.utcnow()}},
    )

    return {"message": "Cart updated"}


@router.patch("/item/{product_id}")
async def update_cart_item(
    product_id: str,
    data: CartUpdateItem,
    buyer=Depends(require_role("buyer")),
    db=Depends(get_db),
):
    try:
        pid = ObjectId(product_id)
    except Exception:
        raise HTTPException(400, "Invalid product_id")

    product = await db.products.find_one({"_id": pid, "active": True})
    if not product:
        raise HTTPException(404, "Product not found")

    if data.quantity > product.get("stock", 0):
        raise HTTPException(400, "Quantity exceeds available stock")

    cart = buyer.get("cart", [])
    found = False
    for item in cart:
        if item.get("product_id") == pid:
            item["quantity"] = data.quantity
            item["updated_at"] = datetime.utcnow()
            found = True
            break

    if not found:
        raise HTTPException(404, "Item not found in cart")

    await db.users.update_one(
        {"_id": buyer["_id"]},
        {"$set": {"cart": cart, "updated_at": datetime.utcnow()}},
    )

    return {"message": "Cart item updated"}


@router.delete("/item/{product_id}")
async def remove_cart_item(
    product_id: str,
    buyer=Depends(require_role("buyer")),
    db=Depends(get_db),
):
    try:
        pid = ObjectId(product_id)
    except Exception:
        raise HTTPException(400, "Invalid product_id")

    res = await db.users.update_one(
        {"_id": buyer["_id"]},
        {"$pull": {"cart": {"product_id": pid}}},
    )
    if res.modified_count == 0:
        raise HTTPException(404, "Item not found in cart")

    return {"message": "Item removed"}


@router.delete("")
async def clear_cart(
    buyer=Depends(require_role("buyer")),
    db=Depends(get_db),
):
    await db.users.update_one(
        {"_id": buyer["_id"]},
        {"$set": {"cart": [], "updated_at": datetime.utcnow()}},
    )
    return {"message": "Cart cleared"}
