from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from database import get_db
from utils.products import (
    build_variant_name,
    find_product_variant,
    get_active_offer_map,
    get_default_product_variant,
    resolve_offer_reference_price,
)
from utils.security import require_roles

router = APIRouter(prefix="/api/cart", tags=["Cart"])


class CartItemInput(BaseModel):
    product_id: str
    quantity: int = Field(..., gt=0)
    variant_id: Optional[str] = None
    offer_id: Optional[str] = None


class CartUpdateItem(BaseModel):
    quantity: int = Field(..., gt=0)
    variant_id: Optional[str] = None


class CartSyncRequest(BaseModel):
    items: list[CartItemInput] = Field(default_factory=list, max_items=100)


def _parse_object_id(value) -> Optional[ObjectId]:
    try:
        return ObjectId(str(value))
    except Exception:
        return None


def _normalize_variant_lookup(value):
    if isinstance(value, ObjectId):
        return value
    text = str(value or "").strip()
    if not text:
        return None
    return _parse_object_id(text) or text


def _cart_entry_key(product_id, variant_id=None) -> str:
    product_key = str(product_id)
    variant_key = str(variant_id) if variant_id else ""
    return f"{product_key}:{variant_key}" if variant_key else product_key


def _collect_cart_rows(raw_rows) -> list[dict]:
    merged = {}
    order = []
    now = datetime.utcnow()

    for row in raw_rows or []:
        if not isinstance(row, dict):
            continue

        product_id = _parse_object_id(row.get("product_id"))
        if not product_id:
            continue

        try:
            quantity = int(row.get("quantity", 0) or 0)
        except (TypeError, ValueError):
            quantity = 0
        if quantity <= 0:
            continue

        variant_lookup = _normalize_variant_lookup(row.get("variant_id"))
        key = _cart_entry_key(product_id, variant_lookup)
        if key not in merged:
            merged[key] = {
                "product_id": product_id,
                "variant_id": variant_lookup,
                "quantity": quantity,
                "added_at": row.get("added_at") or now,
                "updated_at": row.get("updated_at") or now,
            }
            order.append(key)
            continue

        merged[key]["quantity"] += quantity
        merged[key]["updated_at"] = now

    return [merged[key] for key in order]


async def _build_cart_snapshot(db, raw_rows) -> tuple[dict, list[dict]]:
    cart_rows = _collect_cart_rows(raw_rows)
    product_ids = [row["product_id"] for row in cart_rows]
    if not product_ids:
        return {"count": 0, "items": [], "subtotal": 0.0}, []

    products = await db.products.find({"_id": {"$in": product_ids}}).to_list(len(product_ids))
    products_by_id = {
        row["_id"]: row
        for row in products
        if isinstance(row, dict) and row.get("_id") and row.get("active", True)
    }
    active_offers = await get_active_offer_map(db, list(products_by_id.keys()))

    items = []
    canonical_rows = []
    subtotal = 0.0
    now = datetime.utcnow()

    for row in cart_rows:
        product = products_by_id.get(row["product_id"])
        if not product:
            continue

        selected_variant = None
        stored_variant = row.get("variant_id")
        if product.get("variants"):
            selected_variant = (
                find_product_variant(product, stored_variant)
                if stored_variant
                else get_default_product_variant(product)
            )
            if not selected_variant:
                continue
        elif stored_variant:
            selected_variant = None

        available_stock = int((selected_variant or {}).get("stock", product.get("stock", 0)) or 0)
        if available_stock <= 0:
            continue

        quantity = min(int(row.get("quantity", 1) or 1), available_stock)
        selling_price = float((selected_variant or {}).get("selling_price", product.get("selling_price", 0)) or 0)
        if selling_price <= 0:
            continue

        mrp = (selected_variant or {}).get("mrp", product.get("mrp"))
        active_offer = active_offers.get(product["_id"])
        offer_price = float((active_offer or {}).get("offer_price", 0) or 0)
        has_live_offer = bool(active_offer and offer_price > 0 and offer_price < selling_price)
        effective_price = offer_price if has_live_offer else selling_price
        compare_price = resolve_offer_reference_price(mrp=mrp, selling_price=selling_price) if has_live_offer else None
        if compare_price is not None and float(compare_price) <= effective_price:
            compare_price = None

        product_images = product.get("images") or product.get("image_urls") or []
        image = (selected_variant or {}).get("image") or (product_images[0] if product_images else None)
        variant_id = str(selected_variant.get("_id")) if isinstance(selected_variant, dict) and selected_variant.get("_id") else ""
        item = {
            "id": str(product["_id"]),
            "product_id": str(product["_id"]),
            "cart_key": _cart_entry_key(product["_id"], variant_id or None),
            "title": product.get("title"),
            "image": image,
            "images": product_images,
            "price": round(effective_price, 2),
            "base_price": round(float(compare_price), 2) if compare_price is not None else None,
            "offer_id": str(active_offer["_id"]) if has_live_offer and active_offer.get("_id") else "",
            "variant_id": variant_id,
            "variant_label": build_variant_name(selected_variant) if selected_variant else "",
            "qty": quantity,
            "stock": int(product.get("stock", 0) or 0),
            "available_stock": available_stock,
            "line_total": round(effective_price * quantity, 2),
        }
        items.append(item)
        subtotal += item["line_total"]

        canonical_row = {
            "product_id": product["_id"],
            "quantity": quantity,
            "added_at": row.get("added_at") or now,
            "updated_at": now,
        }
        if variant_id:
            canonical_row["variant_id"] = ObjectId(variant_id)
        canonical_rows.append(canonical_row)

    return {
        "count": len(items),
        "items": items,
        "subtotal": round(subtotal, 2),
    }, canonical_rows


async def _persist_cart(db, *, user_id, raw_rows) -> dict:
    response, canonical_rows = await _build_cart_snapshot(db, raw_rows)
    await db.users.update_one(
        {"_id": user_id},
        {"$set": {"cart": canonical_rows, "updated_at": datetime.utcnow()}},
    )
    return response


def _raw_cart_row_from_payload(item: CartItemInput | dict) -> dict:
    source = item.dict() if isinstance(item, BaseModel) else dict(item)
    row = {
        "product_id": source.get("product_id"),
        "quantity": source.get("quantity"),
        "added_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    if source.get("variant_id"):
        row["variant_id"] = source.get("variant_id")
    return row


@router.get("")
async def get_cart(
    user=Depends(require_roles("buyer", "seller")),
    db=Depends(get_db),
):
    response, _ = await _build_cart_snapshot(db, user.get("cart", []))
    return response


@router.post("/sync")
async def sync_cart(
    data: CartSyncRequest,
    user=Depends(require_roles("buyer", "seller")),
    db=Depends(get_db),
):
    return await _persist_cart(
        db,
        user_id=user["_id"],
        raw_rows=[_raw_cart_row_from_payload(item) for item in data.items],
    )


@router.post("/add")
async def add_to_cart(
    data: CartItemInput,
    user=Depends(require_roles("buyer", "seller")),
    db=Depends(get_db),
):
    product_id = _parse_object_id(data.product_id)
    if not product_id:
        raise HTTPException(400, "Invalid product_id")

    variant_lookup = _normalize_variant_lookup(data.variant_id)
    entry_key = _cart_entry_key(product_id, variant_lookup)
    cart_rows = _collect_cart_rows(user.get("cart", []))
    updated = False

    for row in cart_rows:
        if _cart_entry_key(row.get("product_id"), row.get("variant_id")) == entry_key:
            row["quantity"] = int(data.quantity)
            row["updated_at"] = datetime.utcnow()
            updated = True
            break

    if not updated:
        cart_rows.append(_raw_cart_row_from_payload(data))

    response = await _persist_cart(db, user_id=user["_id"], raw_rows=cart_rows)
    return {"message": "Cart updated", **response}


@router.patch("/item/{product_id}")
async def update_cart_item(
    product_id: str,
    data: CartUpdateItem,
    variant_id: str | None = Query(None),
    user=Depends(require_roles("buyer", "seller")),
    db=Depends(get_db),
):
    product_oid = _parse_object_id(product_id)
    if not product_oid:
        raise HTTPException(400, "Invalid product_id")

    target_variant = _normalize_variant_lookup(variant_id or data.variant_id)
    entry_key = _cart_entry_key(product_oid, target_variant)
    cart_rows = _collect_cart_rows(user.get("cart", []))

    for row in cart_rows:
        if _cart_entry_key(row.get("product_id"), row.get("variant_id")) == entry_key:
            row["quantity"] = int(data.quantity)
            row["updated_at"] = datetime.utcnow()
            response = await _persist_cart(db, user_id=user["_id"], raw_rows=cart_rows)
            return {"message": "Cart item updated", **response}

    raise HTTPException(404, "Item not found in cart")


@router.delete("/item/{product_id}")
async def remove_cart_item(
    product_id: str,
    variant_id: str | None = Query(None),
    user=Depends(require_roles("buyer", "seller")),
    db=Depends(get_db),
):
    product_oid = _parse_object_id(product_id)
    if not product_oid:
        raise HTTPException(400, "Invalid product_id")

    target_variant = _normalize_variant_lookup(variant_id)
    entry_key = _cart_entry_key(product_oid, target_variant)
    cart_rows = _collect_cart_rows(user.get("cart", []))
    filtered_rows = [
        row for row in cart_rows
        if _cart_entry_key(row.get("product_id"), row.get("variant_id")) != entry_key
    ]
    if len(filtered_rows) == len(cart_rows):
        raise HTTPException(404, "Item not found in cart")

    response = await _persist_cart(db, user_id=user["_id"], raw_rows=filtered_rows)
    return {"message": "Item removed", **response}


@router.delete("")
async def clear_cart(
    user=Depends(require_roles("buyer", "seller")),
    db=Depends(get_db),
):
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"cart": [], "updated_at": datetime.utcnow()}},
    )
    return {"message": "Cart cleared", "count": 0, "items": [], "subtotal": 0.0}
