from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class ProductCreate(BaseModel):
    title: str
    description: Optional[str] = None

    mrp: float = Field(..., gt=0)
    selling_price: float = Field(..., gt=0)

    stock: int = Field(..., ge=0)


class ProductInDB(BaseModel):
    title: str
    description: Optional[str]

    mrp: float
    selling_price: float

    stock: int
    seller_id: str

    created_at: datetime
    updated_at: datetime
