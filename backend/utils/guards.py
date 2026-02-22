from fastapi import HTTPException
from bson import ObjectId

# -------------------------------
# ObjectId Guard
# -------------------------------

def parse_object_id(value: str, name: str = "id") -> ObjectId:
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid {name}")


# -------------------------------
# Seller State Guard
# -------------------------------

def assert_valid_seller_state(user: dict):
    status = user.get("seller_status")
    verified_at = user.get("seller_verified_at")

    if status == "verified" and not verified_at:
        raise HTTPException(
            status_code=500,
            detail="Corrupt seller state: verified without timestamp"
        )
