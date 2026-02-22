from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, HttpUrl
from typing import List, Optional
from datetime import datetime
from bson import ObjectId
import re

from database import get_db
from utils.security import require_role
from utils.sellers import get_verified_seller
from utils.products import build_product_card

router = APIRouter(prefix="/products", tags=["Products"])

# =========================
# SCHEMAS
# =========================

class ProductCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: str
    sub_category: Optional[str] = None
    tags: List[str] = []
    mrp: int
    selling_price: int
    stock: int
    images: List[HttpUrl] = Field(min_items=1, max_items=5)


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
    cursor = (
        db.products
        .find(query)
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )

    products = []

    async for p in cursor:
        products.append({
            "id": str(p["_id"]),
            "title": p.get("title"),
            "selling_price": p.get("selling_price"),
            "mrp": p.get("mrp"),
            "images": p.get("images", []),
            "category": p.get("category"),
            "sub_category": p.get("sub_category"),
        })

    return products

# =========================
# HOME PAGE SECTIONS (STATIC ROUTES — MUST BE FIRST)
# =========================

@router.get("/flash-deals")
async def flash_deals(limit: int = 20  ):
    db = get_db()
    from datetime import datetime
    now = datetime.utcnow()

    cursor = db.products.find({
        "active": True,
        "flash_sale_active": True,
        "flash_sale_ends_at": {"$gt": now}
    }).limit(limit)

    deals = []
    async for p in cursor:
        seller = await get_verified_seller(db, p["seller_id"])
        if not seller:
            continue
        card = build_product_card(p, seller)
        card["flash_ends_at"] = p.get("flash_sale_ends_at")
        deals.append(card)

    return deals

@router.get("/top-discounts")
async def top_discounts(limit: int = 20):
    db = get_db()

    cursor = db.products.find({
        "active": True,
        "mrp": {"$gt": 0}
    })

    items = []
    async for p in cursor:
        if p["selling_price"] >= p["mrp"]:
            continue

        seller = await get_verified_seller(db, p["seller_id"])
        if not seller:
            continue

        discount = p["mrp"] - p["selling_price"]
        card = build_product_card(p, seller)
        card["discount"] = discount
        items.append(card)

    items.sort(key=lambda x: x["discount"], reverse=True)
    return items[:limit]

@router.get("/trending")
async def trending_products(limit: int = 20):
    db = get_db()

    cursor = db.products.find(
        {"active": True}
    ).sort("sold_count", -1).limit(limit)

    products = []
    async for p in cursor:
        seller = await get_verified_seller(db, p["seller_id"])
        if not seller:
            continue
        products.append(build_product_card(p, seller))

    return products

@router.get("/recommended")
async def recommended_products(limit: int = 20):
    db = get_db()

    cursor = db.products.find(
        {"active": True}
    ).sort("rating", -1).limit(limit)

    products = []
    async for p in cursor:
        seller = await get_verified_seller(db, p["seller_id"])
        if not seller:
            continue
        products.append(build_product_card(p, seller))

    return products

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

    products = []
    async for p in db.products.find(query):
        products.append({
            "id": str(p["_id"]),
            "title": p["title"],
            "selling_price": p["selling_price"],
            "mrp": p.get("mrp"),
            "images": p.get("images", []),
            "category": p.get("category"),
            "sub_category": p.get("sub_category"),
        })

    return products


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

    return {
        "id": str(product["_id"]),
        "title": product["title"],
        "description": product.get("description"),
        "selling_price": product["selling_price"],
        "mrp": product.get("mrp"),
        "images": product.get("images", []),
        "category": product.get("category"),
        "sub_category": product.get("sub_category"),
        "stock": product.get("stock", 0),
    }


# =========================
# SELLER CREATE PRODUCT
# =========================

@router.post("/create")
async def create_product(
    data: ProductCreate,
    seller=Depends(require_role("seller")),
):
    if seller.get("is_frozen"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seller account is frozen",
        )

    if data.selling_price > data.mrp:
        raise HTTPException(
            status_code=400,
            detail="Selling price cannot exceed MRP",
        )

    db = get_db()

    product_doc = {
        "title": data.title,
        "description": data.description,
        "category": data.category.lower(),
        "sub_category": data.sub_category.lower() if data.sub_category else None,
        "tags": [t.lower() for t in data.tags],
        "mrp": data.mrp,
        "selling_price": data.selling_price,
        "stock": data.stock,
        "reserved_stock": 0,
        "images": data.images,
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
