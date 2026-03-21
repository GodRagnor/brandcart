from datetime import datetime
from typing import Optional

from bson import ObjectId


def _stringify_id(value):
    if isinstance(value, ObjectId):
        return str(value)
    return str(value) if value else None


def _positive_amount(value):
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return None
    return amount if amount > 0 else None


def resolve_offer_reference_price(*, mrp=None, selling_price=None):
    mrp_amount = _positive_amount(mrp)
    selling_amount = _positive_amount(selling_price)

    if mrp_amount is not None and selling_amount is not None:
        return max(mrp_amount, selling_amount)
    return mrp_amount if mrp_amount is not None else selling_amount


def get_product_variants(product: Optional[dict]) -> list[dict]:
    if not isinstance(product, dict):
        return []
    return [row for row in (product.get("variants") or []) if isinstance(row, dict)]


def build_variant_name(variant: Optional[dict]) -> str:
    if not isinstance(variant, dict):
        return "Variant"
    label = str(variant.get("label") or "").strip()
    value = str(variant.get("value") or "").strip()
    if label and value:
        return f"{label}: {value}"
    return value or label or "Variant"


def serialize_product_variant(
    variant: Optional[dict],
    *,
    include_inventory: bool = False,
):
    if not isinstance(variant, dict):
        return None

    stock = int(variant.get("stock", 0) or 0)
    reserved_stock = int(variant.get("reserved_stock", 0) or 0)
    payload = {
        "id": _stringify_id(variant.get("_id")),
        "label": variant.get("label"),
        "value": variant.get("value"),
        "name": build_variant_name(variant),
        "sku": variant.get("sku"),
        "mrp": variant.get("mrp"),
        "selling_price": variant.get("selling_price"),
        "image": variant.get("image"),
    }
    if include_inventory:
        payload.update({
            "stock": stock,
            "reserved_stock": reserved_stock,
            "available_stock": max(0, stock - reserved_stock),
        })
    return payload


def find_product_variant(product: Optional[dict], variant_id) -> Optional[dict]:
    lookup_id = _stringify_id(variant_id)
    if not lookup_id:
        return None
    for variant in get_product_variants(product):
        if _stringify_id(variant.get("_id")) == lookup_id:
            return variant
    return None


def get_default_product_variant(product: Optional[dict]) -> Optional[dict]:
    variants = get_product_variants(product)
    if not variants:
        return None

    preferred = find_product_variant(product, (product or {}).get("default_variant_id"))
    if preferred:
        return preferred

    def _sort_key(variant: dict):
        try:
            price = float(variant.get("selling_price", 0) or 0)
        except (TypeError, ValueError):
            price = float("inf")
        return (
            price if price > 0 else float("inf"),
            str(variant.get("label") or "").lower(),
            str(variant.get("value") or "").lower(),
        )

    return sorted(variants, key=_sort_key)[0]


def derive_variant_backed_product_fields(variants: list[dict]) -> dict:
    rows = [row for row in (variants or []) if isinstance(row, dict)]
    default_variant = get_default_product_variant({
        "variants": rows,
    })
    total_stock = sum(max(0, int(row.get("stock", 0) or 0)) for row in rows)
    total_reserved = sum(max(0, int(row.get("reserved_stock", 0) or 0)) for row in rows)
    return {
        "default_variant_id": default_variant.get("_id") if default_variant else None,
        "stock": total_stock,
        "reserved_stock": total_reserved,
        "mrp": default_variant.get("mrp") if default_variant else None,
        "selling_price": default_variant.get("selling_price") if default_variant else None,
    }


def serialize_active_offer(
    offer: Optional[dict],
    *,
    base_price=None,
    festival_name: Optional[str] = None,
):
    if not isinstance(offer, dict):
        return None

    offer_price = float(offer.get("offer_price", 0) or 0)
    base_amount = _positive_amount(base_price)
    savings_amount = None
    savings_percent = None

    if base_amount is not None and base_amount > 0:
        savings_amount = max(0.0, base_amount - offer_price)
        savings_percent = int(round((savings_amount / base_amount) * 100)) if savings_amount > 0 else 0

    return {
        "id": _stringify_id(offer.get("_id")),
        "offer_price": offer_price,
        "start_at": offer.get("start_at"),
        "end_at": offer.get("end_at"),
        "festival_id": _stringify_id(offer.get("festival_id")),
        "festival_name": festival_name or offer.get("festival_name"),
        "status": offer.get("status"),
        "savings_amount": savings_amount,
        "savings_percent": savings_percent,
    }


async def get_active_offer_map(db, product_ids, *, now=None):
    unique_ids = []
    seen_ids = set()
    for product_id in product_ids or []:
        if not isinstance(product_id, ObjectId) or product_id in seen_ids:
            continue
        seen_ids.add(product_id)
        unique_ids.append(product_id)

    if not unique_ids:
        return {}

    active_now = now or datetime.utcnow()
    cursor = db.seller_offers.find({
        "product_id": {"$in": unique_ids},
        "status": "active",
        "start_at": {"$lte": active_now},
        "end_at": {"$gte": active_now},
    }).sort([
        ("offer_price", 1),
        ("end_at", 1),
        ("updated_at", -1),
    ])

    offers_by_product = {}
    async for offer in cursor:
        product_id = offer.get("product_id")
        if product_id not in offers_by_product:
            offers_by_product[product_id] = offer

    return offers_by_product


async def reserve_product_inventory(
    db,
    *,
    product: dict,
    quantity: int,
    variant: Optional[dict] = None,
) -> bool:
    query = {
        "_id": product["_id"],
        "stock": {"$gte": quantity},
    }
    update_inc = {
        "stock": -quantity,
        "reserved_stock": quantity,
    }

    if isinstance(variant, dict) and variant.get("_id"):
        query["variants"] = {"$elemMatch": {
            "_id": variant["_id"],
            "stock": {"$gte": quantity},
        }}
        update_inc["variants.$.stock"] = -quantity
        update_inc["variants.$.reserved_stock"] = quantity

    result = await db.products.update_one(query, {"$inc": update_inc})
    return result.modified_count == 1


async def release_product_inventory(
    db,
    *,
    product_id,
    quantity: int,
    variant_id=None,
    restock: bool = False,
) -> bool:
    query = {
        "_id": product_id,
        "reserved_stock": {"$gte": quantity},
    }
    update_inc = {
        "reserved_stock": -quantity,
    }
    if restock:
        update_inc["stock"] = quantity

    variant_oid = None
    if variant_id:
        try:
            variant_oid = ObjectId(str(variant_id))
        except Exception:
            variant_oid = None

    if variant_oid:
        query["variants"] = {"$elemMatch": {
            "_id": variant_oid,
            "reserved_stock": {"$gte": quantity},
        }}
        update_inc["variants.$.reserved_stock"] = -quantity
        if restock:
            update_inc["variants.$.stock"] = quantity

    result = await db.products.update_one(query, {"$inc": update_inc})
    return result.modified_count == 1


def build_product_card(
    product: dict,
    seller: dict,
    *,
    active_offer: Optional[dict] = None,
    festival_name: Optional[str] = None,
):
    product_images = product.get("images") or product.get("image_urls") or []
    default_variant = get_default_product_variant(product)
    resolved_selling_price = (default_variant or {}).get("selling_price", product.get("selling_price"))
    resolved_mrp = (default_variant or {}).get("mrp", product.get("mrp"))
    reference_price = resolve_offer_reference_price(
        mrp=resolved_mrp,
        selling_price=resolved_selling_price,
    )
    serialized_offer = serialize_active_offer(
        active_offer,
        base_price=reference_price,
        festival_name=festival_name,
    )

    return {
        "id": str(product["_id"]),
        "title": product.get("title"),
        "selling_price": resolved_selling_price,
        "display_price": serialized_offer.get("offer_price") if serialized_offer else resolved_selling_price,
        "mrp": resolved_mrp,
        "images": product_images,
        "category": product.get("category"),
        "sub_category": product.get("sub_category"),
        "variant_count": len(get_product_variants(product)),
        "default_variant": serialize_product_variant(default_variant, include_inventory=True),
        "seller": {
            "id": str(seller["_id"]),
            "brand_name": seller.get("seller_profile", {}).get("brand_name"),
            "slug": seller.get("seller_profile", {}).get("slug"),
            "logo_url": seller.get("seller_profile", {}).get("logo_url"),
            "trust_score": seller.get("seller_profile", {})
                              .get("trust", {})
                              .get("score", 0),
        },
        "stock": product.get("stock", 0),
        "active_offer": serialized_offer,
    }
