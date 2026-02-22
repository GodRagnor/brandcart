from fastapi import HTTPException
from datetime import datetime
from config.constants import (
    MAX_COD_ORDER_VALUE,
    MAX_DAILY_COD_ORDERS,
)

def enforce_seller_risk(
    *,
    seller: dict,
    payment_method: str,
    order_value: float,
):
    """
    Centralized seller risk enforcement.
    This MUST be called before order creation.
    """

    # -------------------------------------------------
    # 1. Seller frozen (hard stop)
    # -------------------------------------------------
    if seller.get("is_frozen"):
        raise HTTPException(
            status_code=403,
            detail="Seller account is frozen"
        )

    # -------------------------------------------------
    # 2. Seller probation enforcement
    # -------------------------------------------------
    probation = seller.get("seller_probation")
    if probation and probation.get("active"):
        restrictions = probation.get("restrictions", {})

        # COD disabled
        if payment_method == "COD" and not restrictions.get("cod_enabled", False):
            raise HTTPException(
                status_code=403,
                detail="Seller under probation. COD disabled."
            )

        # Daily order cap
        max_daily = restrictions.get("max_daily_orders")
        if max_daily is not None:
            if seller.get("orders_today", 0) >= max_daily:
                raise HTTPException(
                    status_code=403,
                    detail="Seller daily order limit reached (probation)"
                )

        # Order value cap
        max_value = restrictions.get("max_order_value")
        if max_value is not None and order_value > max_value:
            raise HTTPException(
                status_code=403,
                detail="Order value exceeds seller probation limit"
            )

    # -------------------------------------------------
    # 3. Global COD safety rules
    # -------------------------------------------------
    if payment_method == "COD":
        if order_value > MAX_COD_ORDER_VALUE:
            raise HTTPException(
                status_code=403,
                detail="COD order value exceeds platform limit"
            )

        if seller.get("cod_orders_today", 0) >= MAX_DAILY_COD_ORDERS:
            raise HTTPException(
                status_code=403,
                detail="Daily COD order limit reached"
            )

    return True
