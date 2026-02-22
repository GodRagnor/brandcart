from fastapi import APIRouter
from database import get_db

router = APIRouter(prefix="/brands", tags=["Brands"])

@router.get("/top")
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
            "seller_profile.trust": 1,
        }
    ).sort("seller_profile.trust.score", -1).limit(limit)

    brands = []

    async for s in cursor:
        profile = s.get("seller_profile", {})
        logo = profile.get("logo_url")

        # 🔒 Next/Image strict safety
        if logo and not logo.startswith(("http://", "https://", "/")):
            logo = None

        brands.append({
            "id": str(s["_id"]),
            "brand_name": profile.get("brand_name"),
            "slug": profile.get("slug"),
            "logo_url": logo,
            "trust_score": profile.get("trust", {}).get("score", 0),
        })

    return brands
