from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, HttpUrl
from typing import List, Optional
from datetime import datetime
from bson import ObjectId
import re

from database import get_db
from utils.security import require_role
from utils.products import (
    build_product_card,
    derive_variant_backed_product_fields,
    get_active_offer_map,
    get_default_product_variant,
    resolve_offer_reference_price,
    serialize_active_offer,
    serialize_product_variant,
)

router = APIRouter(prefix="/api/products", tags=["Products"])


def _product_images(product: dict) -> list:
    return product.get("images") or product.get("image_urls") or []


async def _load_verified_sellers(db, seller_ids) -> dict:
    unique_ids = []
    seen_ids = set()
    for seller_id in seller_ids or []:
        if not isinstance(seller_id, ObjectId) or seller_id in seen_ids:
            continue
        seen_ids.add(seller_id)
        unique_ids.append(seller_id)

    if not unique_ids:
        return {}

    sellers = await db.users.find(
        {
            "_id": {"$in": unique_ids},
            "role": "seller",
            "seller_status": "verified",
            "is_frozen": False,
        },
        {"seller_profile": 1},
    ).to_list(len(unique_ids))
    return {row["_id"]: row for row in sellers}


async def _build_cards_for_products(
    db,
    product_rows,
    *,
    now=None,
    festival_names_by_id: Optional[dict] = None,
):
    rows = [row for row in (product_rows or []) if isinstance(row, dict) and row.get("_id") and row.get("seller_id")]
    if not rows:
        return []

    active_now = now or datetime.utcnow()
    sellers_by_id = await _load_verified_sellers(db, [row.get("seller_id") for row in rows])
    offers_by_product = await get_active_offer_map(db, [row["_id"] for row in rows], now=active_now)

    cards = []
    for row in rows:
        seller = sellers_by_id.get(row.get("seller_id"))
        if not seller:
            continue
        active_offer = offers_by_product.get(row["_id"])
        festival_name = None
        if active_offer and festival_names_by_id:
            festival_name = festival_names_by_id.get(active_offer.get("festival_id"))
        cards.append(build_product_card(row, seller, active_offer=active_offer, festival_name=festival_name))
    return cards

# =========================
# SCHEMAS
# =========================

class ProductVariantInput(BaseModel):
    label: str = Field(..., min_length=1, max_length=40)
    value: str = Field(..., min_length=1, max_length=80)
    mrp: int = Field(..., gt=0)
    selling_price: int = Field(..., gt=0)
    stock: int = Field(..., ge=0)
    image: Optional[HttpUrl] = None
    sku: Optional[str] = Field(default=None, min_length=2, max_length=40)


class ProductCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: str
    sub_category: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    mrp: int
    selling_price: int 
    stock: int 
    images: List[HttpUrl] = Field(min_items=1, max_items=7)
    variants: List[ProductVariantInput] = Field(default_factory=list, max_items=20)


# =========================
# BUYER SEARCH (ADVANCED)
# =========================

@router.get("/search")
async def search_products(
    q: Optional[str] = Query(None, description="Search query"),
    category: Optional[str] = None,
    sub_category: Optional[str] = None,
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    page: int = 1,
    limit: int = 20,
):
    db = get_db()

    # ---- pagination ----
    page = max(page, 1)
    limit = min(max(limit, 1), 50)
    skip = (page - 1) * limit

    query: dict = {}

    # ---- text search ----
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"category": {"$regex": q, "$options": "i"}},
            {"sub_category": {"$regex": q, "$options": "i"}},
        ]

    # ---- filters ----
    if category:
        query["category"] = category

    if sub_category:
        query["sub_category"] = sub_category

    if min_price is not None or max_price is not None:
        query["selling_price"] = {}
        if min_price is not None:
            query["selling_price"]["$gte"] = min_price
        if max_price is not None:
            query["selling_price"]["$lte"] = max_price

    # ---- fetch paginated products ----
    rows = await (
        db.products
        .find(query)
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    ).to_list(limit)

    return await _build_cards_for_products(db, rows)

# =========================
# HOME PAGE SECTIONS (STATIC ROUTES — MUST BE FIRST)
# =========================

@router.get("/flash-deals")
async def flash_deals(limit: int = 20  ):
    db = get_db()
    now = datetime.utcnow()

    rows = await db.products.find({
        "active": True,
        "flash_sale_active": True,
        "flash_sale_ends_at": {"$gt": now}
    }).limit(limit).to_list(limit)

    deals = await _build_cards_for_products(db, rows, now=now)
    products_by_id = {str(row["_id"]): row for row in rows if row.get("_id")}
    for card in deals:
        product = products_by_id.get(card.get("id"))
        card["flash_ends_at"] = product.get("flash_sale_ends_at") if product else None

    return deals

@router.get("/top-discounts")
async def top_discounts(limit: int = 20):
    db = get_db()

    rows = await db.products.find({
        "active": True,
        "mrp": {"$gt": 0}
    }).to_list(500)

    cards = await _build_cards_for_products(db, rows)
    for card in cards:
        base_price = None
        try:
            base_price = float(card.get("selling_price") or 0)
            mrp = float(card.get("mrp") or 0)
        except (TypeError, ValueError):
            base_price = None
            mrp = None
        if base_price is None or mrp is None or base_price >= mrp:
            card["discount"] = 0
        else:
            card["discount"] = mrp - base_price

    cards = [item for item in cards if item.get("discount", 0) > 0]
    cards.sort(key=lambda x: x["discount"], reverse=True)
    return cards[:limit]

@router.get("/trending")
async def trending_products(limit: int = 20):
    db = get_db()

    rows = await db.products.find(
        {"active": True}
    ).sort("sold_count", -1).limit(limit).to_list(limit)

    return await _build_cards_for_products(db, rows)

@router.get("/recommended")
async def recommended_products(limit: int = 20):
    db = get_db()

    rows = await db.products.find(
        {"active": True}
    ).sort("rating", -1).limit(limit).to_list(limit)

    return await _build_cards_for_products(db, rows)


@router.get("/offer-highlights")
async def offer_highlights(limit: int = 6):
    db = get_db()
    now = datetime.utcnow()
    safe_limit = min(max(limit, 1), 12)

    offer_rows = await db.seller_offers.find({
        "status": "active",
        "start_at": {"$lte": now},
        "end_at": {"$gte": now},
    }).sort("updated_at", -1).to_list(max(safe_limit * 12, 36))

    product_ids = []
    seen_product_ids = set()
    festival_ids = []
    seen_festival_ids = set()

    for offer in offer_rows:
        product_id = offer.get("product_id")
        if isinstance(product_id, ObjectId) and product_id not in seen_product_ids:
            seen_product_ids.add(product_id)
            product_ids.append(product_id)
        festival_id = offer.get("festival_id")
        if isinstance(festival_id, ObjectId) and festival_id not in seen_festival_ids:
            seen_festival_ids.add(festival_id)
            festival_ids.append(festival_id)

    if not product_ids:
        return {"highlights": [], "summary": {"active_offers": 0}}

    products = await db.products.find({
        "_id": {"$in": product_ids},
        "active": True,
    }).to_list(len(product_ids))

    sellers_by_id = await _load_verified_sellers(db, [row.get("seller_id") for row in products])
    offers_by_product = await get_active_offer_map(db, product_ids, now=now)

    festival_names_by_id = {}
    if festival_ids:
        festivals = await db.festivals.find(
            {"_id": {"$in": festival_ids}},
            {"name": 1},
        ).to_list(len(festival_ids))
        festival_names_by_id = {row["_id"]: row.get("name") for row in festivals}

    highlights = []
    for product in products:
        seller = sellers_by_id.get(product.get("seller_id"))
        if not seller:
            continue
        active_offer = offers_by_product.get(product["_id"])
        if not active_offer:
            continue

        festival_name = festival_names_by_id.get(active_offer.get("festival_id"))
        card = build_product_card(product, seller, active_offer=active_offer, festival_name=festival_name)
        card["offer_banner_label"] = festival_name or "Live Offer"
        highlights.append(card)

    highlights.sort(
        key=lambda item: (
            -float(((item.get("active_offer") or {}).get("savings_amount") or 0)),
            float(((item.get("active_offer") or {}).get("offer_price") or 0)),
            str(((item.get("active_offer") or {}).get("end_at") or "")),
        )
    )

    return {
        "highlights": highlights[:safe_limit],
        "summary": {
            "active_offers": len(highlights),
        },
    }

# =========================
# LIST ALL PRODUCTS (BUYER)
# =========================

@router.get("")
async def list_products(search: str = Query("")):
    db = get_db()
    query = {}

    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"category": {"$regex": search, "$options": "i"}},
            {"sub_category": {"$regex": search, "$options": "i"}},
        ]

    rows = await db.products.find(query).to_list(500)
    return await _build_cards_for_products(db, rows)


# =========================
# PRODUCT DETAIL (DYNAMIC — MUST BE LAST)
# =========================

@router.get("/{product_id}")
async def product_detail(product_id: str):
    db = get_db()

    try:
        product = await db.products.find_one(
            {"_id": ObjectId(product_id)}
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product ID")

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    seller = await db.users.find_one(
        {
            "_id": product.get("seller_id"),
            "role": "seller",
            "seller_status": "verified",
            "is_frozen": False,
        },
        {"seller_profile": 1},
    )

    active_offer = None
    festival_name = None
    default_variant = get_default_product_variant(product)
    if seller:
        offers_by_product = await get_active_offer_map(db, [product["_id"]])
        active_offer = offers_by_product.get(product["_id"])
        festival_id = active_offer.get("festival_id") if active_offer else None
        if festival_id:
            festival = await db.festivals.find_one({"_id": festival_id}, {"name": 1})
            festival_name = festival.get("name") if festival else None

    return {
        "id": str(product["_id"]),
        "title": product["title"],
        "description": product.get("description"),
        "selling_price": (default_variant or {}).get("selling_price", product.get("selling_price")),
        "mrp": (default_variant or {}).get("mrp", product.get("mrp")),
        "images": _product_images(product),
        "category": product.get("category"),
        "sub_category": product.get("sub_category"),
        "stock": product.get("stock", 0),
        "variant_count": len(product.get("variants") or []),
        "default_variant": serialize_product_variant(default_variant, include_inventory=True),
        "variants": [serialize_product_variant(row, include_inventory=True) for row in (product.get("variants") or []) if isinstance(row, dict)],
        "seller": (
            {
                "id": str(seller["_id"]),
                "brand_name": seller.get("seller_profile", {}).get("brand_name"),
                "slug": seller.get("seller_profile", {}).get("slug"),
                "logo_url": seller.get("seller_profile", {}).get("logo_url"),
                "trust_score": seller.get("seller_profile", {}).get("trust", {}).get("score", 0),
            }
            if seller else None
        ),
        "active_offer": serialize_active_offer(
            active_offer,
            base_price=resolve_offer_reference_price(
                mrp=(default_variant or {}).get("mrp", product.get("mrp")),
                selling_price=(default_variant or {}).get("selling_price", product.get("selling_price")),
            ),
            festival_name=festival_name,
        ),
    }


# =========================
# SELLER CREATE PRODUCT
# =========================

@router.post("/create")
async def create_product(
    data: ProductCreate,
    seller=Depends(require_role("seller")),
    db=Depends(get_db),
):
    # seller safety
    if seller.get("seller_status") != "verified":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seller not verified",
        )

    if seller.get("is_frozen") or seller.get("seller_status") == "frozen":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seller account is frozen",
        )

    variant_docs = []
    for item in data.variants:
        if item.selling_price > item.mrp:
            raise HTTPException(
                status_code=400,
                detail=f"Variant {item.label}: {item.value} has selling price above MRP",
            )
        variant_docs.append({
            "_id": ObjectId(),
            "label": item.label.strip(),
            "value": item.value.strip(),
            "sku": item.sku.strip().upper() if item.sku else None,
            "mrp": item.mrp,
            "selling_price": item.selling_price,
            "stock": item.stock,
            "reserved_stock": 0,
            "image": str(item.image) if item.image else None,
        })

    derived_fields = derive_variant_backed_product_fields(variant_docs) if variant_docs else {}
    product_mrp = derived_fields.get("mrp", data.mrp)
    product_selling_price = derived_fields.get("selling_price", data.selling_price)
    product_stock = derived_fields.get("stock", data.stock)
    product_reserved_stock = derived_fields.get("reserved_stock", 0)

    # price validation
    if product_selling_price > product_mrp:
        raise HTTPException(
            status_code=400,
            detail="Selling price cannot exceed MRP",
        )

    product_doc = {
        "title": data.title.strip(),
        "description": data.description,
        "category": data.category.lower(),
        "sub_category": data.sub_category.lower() if data.sub_category else None,
        "tags": [t.lower() for t in data.tags],

        "mrp": product_mrp,
        "selling_price": product_selling_price,
        "stock": product_stock,
        "reserved_stock": product_reserved_stock,
        "default_variant_id": derived_fields.get("default_variant_id"),
        "variants": variant_docs,

        "images": [str(img) for img in data.images],

        "seller_id": seller["_id"],
        "active": True,

        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    result = await db.products.insert_one(product_doc)

    return {
        "message": "Product created",
        "product_id": str(result.inserted_id),
    }
