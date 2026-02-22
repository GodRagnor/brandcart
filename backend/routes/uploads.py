from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from database import get_db
from utils.cloudinary import upload_image
from utils.security import require_role

router = APIRouter(prefix="/uploads", tags=["Uploads"])


@router.post("/brand-logo")
async def upload_brand_logo(
    file: UploadFile = File(...),
    seller=Depends(require_role("seller")),
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "Only image files allowed")

    result = upload_image(file.file, folder="brands")

    logo_url = result.get("secure_url")
    if not logo_url:
        raise HTTPException(500, "Upload failed")

    db = get_db()
    await db.users.update_one(
        {"_id": seller["_id"]},
        {"$set": {"seller_profile.logo_url": logo_url}},
    )

    return {"logo_url": logo_url}
