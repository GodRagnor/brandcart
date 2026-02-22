from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from bson import ObjectId

from database import get_db
from utils.security import require_role

router = APIRouter(
    prefix="/api/addresses",
    tags=["Buyer Addresses"]
)

# ======================================================
# SCHEMAS
# ======================================================

class AddressCreate(BaseModel):
    name: str
    phone: str
    line1: str
    city: str
    state: str
    pincode: str = Field(..., min_length=6, max_length=6)
    is_default: bool = False


class AddressUpdate(BaseModel):
    name: Optional[str]
    phone: Optional[str]
    line1: Optional[str]
    city: Optional[str]
    state: Optional[str]
    pincode: Optional[str] = Field(None, min_length=6, max_length=6)
    is_default: Optional[bool]


# ======================================================
# ADD ADDRESS
# ======================================================

@router.post("")
async def add_address(
    data: AddressCreate,
    buyer=Depends(require_role("buyer"))
):
    db = get_db()

    address = {
        "_id": ObjectId(),
        **data.dict(),
        "created_at": datetime.utcnow()
    }

    # If new address is default → unset others
    if data.is_default:
        await db.users.update_one(
            {"_id": buyer["_id"]},
            {"$set": {"addresses.$[].is_default": False}}
        )

    await db.users.update_one(
        {"_id": buyer["_id"]},
        {"$push": {"addresses": address}}
    )

    return {
        "message": "Address added",
        "address_id": str(address["_id"])
    }


# ======================================================
# LIST ADDRESSES
# ======================================================

@router.get("")
async def list_addresses(
    buyer=Depends(require_role("buyer"))
):
    addresses = buyer.get("addresses", [])
    for a in addresses:
        a["_id"] = str(a["_id"])
    return addresses


# ======================================================
# UPDATE ADDRESS
# ======================================================

@router.patch("/{address_id}")
async def update_address(
    address_id: str,
    data: AddressUpdate,
    buyer=Depends(require_role("buyer"))
):
    db = get_db()

    if data.is_default:
        await db.users.update_one(
            {"_id": buyer["_id"]},
            {"$set": {"addresses.$[].is_default": False}}
        )

    result = await db.users.update_one(
        {
            "_id": buyer["_id"],
            "addresses._id": ObjectId(address_id)
        },
        {
            "$set": {
                **{f"addresses.$.{k}": v for k, v in data.dict(exclude_none=True).items()},
                "updated_at": datetime.utcnow()
            }
        }
    )

    if result.modified_count == 0:
        raise HTTPException(404, "Address not found")

    return {"message": "Address updated"}


# ======================================================
# DELETE ADDRESS
# ======================================================

@router.delete("/{address_id}")
async def delete_address(
    address_id: str,
    buyer=Depends(require_role("buyer"))
):
    db = get_db()

    result = await db.users.update_one(
        {"_id": buyer["_id"]},
        {"$pull": {"addresses": {"_id": ObjectId(address_id)}}}
    )

    if result.modified_count == 0:
        raise HTTPException(404, "Address not found")

    return {"message": "Address deleted"}
