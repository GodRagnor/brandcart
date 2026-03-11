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


async def resolve_location_from_pincode(db, pincode):
    if not pincode:
        return None

    user = await db.users.find_one(
        {"addresses.pincode": pincode},
        {"addresses": 1},
    )
    if not user:
        return None

    for address in user.get("addresses", []):
        if str(address.get("pincode") or "").strip() != pincode:
            continue

        state = (address.get("state") or "").strip()
        city = (address.get("city") or "").strip()
        if not state:
            continue

        return {
            "state": state,
            "city": city or None,
        }

    return None


def match_serviceable_region(seller, location):
    if not location:
        return None

    state = (location.get("state") or "").strip().lower()
    city = (location.get("city") or "").strip().lower()
    if not state:
        return None

    for region in seller.get("serviceable_regions", []):
        region_state = (region.get("state") or "").strip().lower()
        region_city = (region.get("city") or "").strip().lower()
        if region_state == state and (not region_city or region_city == city):
            return region

    return None


def get_public_delivery_status(seller, pincode, location=None):
    seller_cod_enabled = bool(
        seller.get("cod_settings", {}).get("enabled", False)
        or seller.get("cod_enabled", False)
    )

    if bool(seller.get("serviceability_all_india", False)):
        return {
            "deliverable": True,
            "cod_available": seller_cod_enabled,
            "estimated_days": None,
            "reason": "Delivery available across India",
            "requires_address_confirmation": False,
        }

    area = next(
        (
            item for item in seller.get("serviceable_areas", [])
            if str(item.get("pincode") or "") == pincode and item.get("delivery_enabled")
        ),
        None,
    )
    if area:
        return {
            "deliverable": True,
            "cod_available": bool(area.get("cod_enabled")) and seller_cod_enabled,
            "estimated_days": area.get("estimated_days"),
            "reason": "Delivery available",
            "requires_address_confirmation": False,
        }

    region = match_serviceable_region(seller, location)
    if region:
        if not region.get("delivery_enabled", True):
            return {
                "deliverable": False,
                "cod_available": False,
                "estimated_days": None,
                "reason": "Delivery not available",
                "requires_address_confirmation": False,
            }

        return {
            "deliverable": True,
            "cod_available": bool(region.get("cod_enabled")) and seller_cod_enabled,
            "estimated_days": None,
            "reason": "Delivery available",
            "requires_address_confirmation": False,
        }

    if seller.get("serviceable_regions"):
        return {
            "deliverable": False,
            "cod_available": False,
            "estimated_days": None,
            "reason": "Exact delivery will be confirmed after you choose your address",
            "requires_address_confirmation": True,
        }

    return {
        "deliverable": False,
        "cod_available": False,
        "estimated_days": None,
        "reason": "Delivery not available",
        "requires_address_confirmation": False,
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
    location = await resolve_location_from_pincode(db, pincode)

    products = []

    async for p in cursor:
        seller = await get_verified_seller(db, p["seller_id"])
        if not seller:
            continue

        available_stock = p.get("stock", 0) - p.get("reserved_stock", 0)
        if available_stock <= 0:
            continue

        delivery = get_public_delivery_status(seller, pincode, location)
        if not delivery.get("deliverable"):
            continue

        card = build_product_card(p, seller)
        card["available_stock"] = available_stock
        card["delivery"] = {
            "cod_available": delivery.get("cod_available", False),
            "online_available": True,
            "requires_address_confirmation": bool(delivery.get("requires_address_confirmation", False)),
        }
        if delivery.get("estimated_days") is not None:
            card["delivery"]["estimated_days"] = delivery.get("estimated_days")

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


@router.get("/product/{product_id}/delivery")
async def check_product_delivery(product_id: str, pincode: str = Query(..., min_length=6, max_length=6)):
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
        return {
            "product_id": product_id,
            "pincode": pincode,
            "deliverable": False,
            "cod_available": False,
            "reason": "Seller unavailable",
            "requires_address_confirmation": False,
        }

    available_stock = max(0, int(product.get("stock", 0)) - int(product.get("reserved_stock", 0)))
    if available_stock <= 0:
        return {
            "product_id": product_id,
            "pincode": pincode,
            "deliverable": False,
            "cod_available": False,
            "reason": "Out of stock",
            "requires_address_confirmation": False,
        }

    location = await resolve_location_from_pincode(db, pincode)
    delivery = get_public_delivery_status(seller, pincode, location)

    return {
        "product_id": product_id,
        "pincode": pincode,
        **delivery,
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
