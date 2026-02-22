from bson import ObjectId
from datetime import datetime


def serialize_object_id(value):
    return str(value) if isinstance(value, ObjectId) else value


def serialize_order(order: dict) -> dict:
    return {
        "id": str(order["_id"]),
        "buyer_id": serialize_object_id(order["buyer_id"]),
        "seller_id": serialize_object_id(order["seller_id"]),
        "product_id": serialize_object_id(order["product_id"]),

        "quantity": order["quantity"],

        "pricing": order["pricing"],

        "payment": order["payment"],

        "status": order["status"],

        "created_at": order["created_at"].isoformat()
        if isinstance(order.get("created_at"), datetime)
        else None,

        "updated_at": order["updated_at"].isoformat()
        if isinstance(order.get("updated_at"), datetime)
        else None,

        "delivered_at": order.get("delivered_at").isoformat()
        if isinstance(order.get("delivered_at"), datetime)
        else None,
    }
