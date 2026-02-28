from fastapi import APIRouter, Query, HTTPException
from bson import ObjectId
from datetime import datetime
from database import get_db

router = APIRouter(
    prefix="/api/public",
    tags=["Public"]
)

# ============================================================
# HELPERS
# ============================================================

async def get_verified_seller(db, seller_id):
    # Handle both ObjectId and string seller_id
    query = {
        "role": "seller",
        "seller_status": "verified",
        "is_frozen": False
    }
    
    # Try to convert to ObjectId, if fails use as string
    try:
        query["_id"] = ObjectId(seller_id)
    except:
        query["_id"] = seller_id

    return await db.users.find_one(query)


def build_product_card(product, seller):
    profile = seller.get("seller_profile", {})
    trust = profile.get("trust", {})

    product_images = product.get("images") or product.get("image_urls") or []

    return {
        "id": str(product["_id"]),
        "title": product.get("title"),
        "price": product.get("selling_price"),
        "mrp": product.get("mrp"),
        "image": product_images[0] if product_images else None,
        "rating": product.get("rating", 0),
        "review_count": product.get("review_count", 0),
        "seller": {
            "brand_name": profile.get("brand_name"),
            "slug": profile.get("slug"),
            "trust_score": trust.get("score", 0),
            "badges": trust.get("badges", [])
        }
    }

# ============================================================
# HOME PAGE SECTIONS
# ============================================================

@router.get("/categories")
async def get_categories():
    db = get_db()
    cursor = db.categories.find({"active": True}).sort("order", 1)

    return [
        {
            "name": c["name"],
            "slug": c["slug"],
            "icon": c.get("icon")
        }
        async for c in cursor
    ]


@router.get("/banners")
async def get_banners():
    db = get_db()
    cursor = db.banners.find({"active": True}).sort("priority", 1)

    return [
        {
            "title": b.get("title"),
            "image": b.get("image"),
            "cta": b.get("cta"),
            "link": b.get("link")
        }
        async for b in cursor
    ]


@router.get("/products/trending")
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


@router.get("/products/recommended")
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


@router.get("/products/top-discounts")
async def top_discounts(limit: int = 20):
    db = get_db()
    cursor = db.products.find(
        {
            "active": True,
            "mrp": {"$gt": 0}
        }
    )

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


@router.get("/products/flash-deals")
async def flash_deals(limit: int = 20):
    db = get_db()
    now = datetime.utcnow()

    cursor = db.products.find(
        {
            "active": True,
            "flash_sale_active": True,
            "flash_sale_ends_at": {"$gt": now}
        }
    ).limit(limit)

    deals = []

    async for p in cursor:
        seller = await get_verified_seller(db, p["seller_id"])
        if not seller:
            continue

        card = build_product_card(p, seller)
        card["flash_ends_at"] = p["flash_sale_ends_at"]
        deals.append(card)

    return deals

@router.get("/brands/top")
async def top_brands(limit: int = 12):
    db = get_db()
    cursor = db.users.find(
        {
            "role": "seller",
            "seller_status": "verified",
            "is_frozen": False
        },
        {
            "seller_profile.brand_name": 1,
            "seller_profile.slug": 1,
            "seller_profile.logo_url": 1,
            "seller_profile.trust": 1
        }
    ).sort("seller_profile.trust.score", -1).limit(limit)

    result = []

    async for s in cursor:
        logo = s["seller_profile"].get("logo_url")

        # sanitize logo url for frontend (Next/Image strict)
        if logo and not logo.startswith(("http://", "https://", "/")):
            logo = None

        result.append({
            "brand_name": s["seller_profile"]["brand_name"],
            "slug": s["seller_profile"]["slug"],
            "logo_url": logo,
            "trust_score": s["seller_profile"].get("trust", {}).get("score", 0),
        })

    return result

# ============================================================
# PRODUCT LISTING (PINCODE AWARE)
# ============================================================

@router.get("/products")
async def list_products_by_pincode(
    pincode: str = Query(..., min_length=6, max_length=6)
):
    db = get_db()
    cursor = db.products.find({"active": True})

    products = []

    async for p in cursor:
        seller = await db.users.find_one(
            {"_id": p["seller_id"]},
            {"serviceable_areas": 1, "is_frozen": 1}
        )

        if not seller or seller.get("is_frozen"):
            continue

        area = next(
            (
                a for a in seller.get("serviceable_areas", [])
                if a["pincode"] == pincode and a.get("delivery_enabled")
            ),
            None
        )

        if not area:
            continue

        available_stock = p.get("stock", 0) - p.get("reserved_stock", 0)
        if available_stock <= 0:
            continue

        seller_profile = await get_verified_seller(db, p["seller_id"])
        if not seller_profile:
            continue

        card = build_product_card(p, seller_profile)
        card["available_stock"] = available_stock
        card["delivery"] = {
            "cod_available": area.get("cod_enabled", False),
            "online_available": True
        }

        products.append(card)

    return {
        "pincode": pincode,
        "count": len(products),
        "products": products
    }

# ============================================================
# PRODUCT DETAIL (PDP)
# ============================================================

@router.get("/product/{product_id}")
async def public_product(product_id: str):
    db = get_db()

    try:
        product_oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(400, "Invalid product ID")

    product = await db.products.find_one({"_id": product_oid})
    if not product:
        raise HTTPException(404, "Product not found")

    seller = await get_verified_seller(db, product["seller_id"])
    if not seller:
        raise HTTPException(404, "Seller unavailable")

    profile = seller.get("seller_profile", {})
    trust = profile.get("trust", {})

    return {
        "product": {
            "id": str(product["_id"]),
            "title": product.get("title"),
            "description": product.get("description"),
            "price": product.get("selling_price"),
            "mrp": product.get("mrp"),
            "images": product.get("images") or product.get("image_urls", []),
            "rating": product.get("rating", 0),
            "review_count": product.get("review_count", 0)
        },
        "seller": {
            "brand_name": profile.get("brand_name"),
            "slug": profile.get("slug"),
            "trust_score": trust.get("score", 0),
            "badges": trust.get("badges", [])
        }
    }

# ============================================================
# PUBLIC SELLER PROFILE
# ============================================================

@router.get("/seller/{slug}")
async def public_seller(slug: str):
    db = get_db()

    seller = await db.users.find_one(
        {
            "role": "seller",
            "seller_status": "verified",
            "is_frozen": False,
            "seller_profile.slug": slug
        }
    )

    if not seller:
        raise HTTPException(404, "Seller not found")

    profile = seller["seller_profile"]
    trust = profile.get("trust", {})

    total_products = await db.products.count_documents(
        {"seller_id": seller["_id"]}
    )

    return {
        "seller": {
            "brand_name": profile.get("brand_name"),
            "description": profile.get("description"),
            "logo": profile.get("logo_url"),
            "trust_score": trust.get("score", 0),
            "badges": trust.get("badges", [])
        },
        "stats": {
            "total_products": total_products
        }
    }

# ============================================================
# FESTIVAL / OFFERS
# ============================================================

@router.get("/festival/{slug}")
async def festival_products(slug: str):
    db = get_db()

    festival = await db.festivals.find_one(
        {"slug": slug, "status": "live"}
    )

    if not festival:
        raise HTTPException(404, "Festival not found")

    offers = db.seller_offers.find(
        {
            "festival_id": festival["_id"],
            "status": "active"
        }
    )

    products = []

    async for offer in offers:
        seller = await get_verified_seller(db, offer["seller_id"])
        if not seller:
            continue

        cursor = db.products.find(
            {"_id": {"$in": offer["product_ids"]}}
        )

        async for p in cursor:
            base = p["selling_price"]
            if offer["discount_type"] == "PERCENT":
                final = max(0, base - (base * offer["discount_value"] / 100))
            else:
                final = max(0, base - offer["discount_value"])

            card = build_product_card(p, seller)
            card["festival_price"] = final
            card["discount_applied"] = True

            products.append(card)

    return {
        "festival": festival["name"],
        "products": products
    }
