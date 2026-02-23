# backend/routes/uploads.py

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status

from database import get_db
from utils.cloudinary import upload_image
from utils.security import require_role

router = APIRouter(prefix="/uploads", tags=["Uploads"])


# =========================
# UPLOAD BRAND LOGO
# =========================
@router.post("/brand-logo")
async def upload_brand_logo(
    file: UploadFile = File(...),
    seller=Depends(require_role("seller")),
    db=Depends(get_db),
):
    # validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only image files are allowed",
        )

    # upload to cloudinary
    result = upload_image(
        file.file,
        folder=f"brandcart/brands/{seller['_id']}",
    )

    logo_url = result.get("secure_url")
    if not logo_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Brand logo upload failed",
        )

    # update seller profile
    await db.users.update_one(
        {"_id": seller["_id"]},
        {"$set": {"seller_profile.logo_url": logo_url}},
    )

    return {
        "message": "Brand logo uploaded",
        "logo_url": logo_url,
    }


# =========================
# UPLOAD PRODUCT IMAGE
# =========================
@router.post("/product-image")
async def upload_product_image(
    file: UploadFile = File(...),
    seller=Depends(require_role("seller")),
):
    # validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only image files are allowed",
        )

    # upload to cloudinary
    result = upload_image(
        file.file,
        folder=f"brandcart/products/{seller['_id']}",
    )

    image_url = result.get("secure_url")
    if not image_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Product image upload failed",
        )

    # DO NOT save anything in DB here
    # frontend will collect URLs and send them to product create API
    return {
        "message": "Product image uploaded",
        "image_url": image_url,
    }