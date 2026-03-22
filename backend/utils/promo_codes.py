from bson import ObjectId
from datetime import datetime


ALLOWED_PROMO_KINDS = {"percent", "flat"}
ALLOWED_PROMO_PAYMENT_METHODS = {"COD", "RAZORPAY"}

PROMO_CODES = {
    "SAVE10": {
        "code": "SAVE10",
        "title": "Extra 10% Off",
        "description": "Get 10% off each eligible checkout item above Rs499.",
        "kind": "percent",
        "value": 10.0,
        "max_discount": 250.0,
        "min_subtotal": 499.0,
        "payment_methods": ["COD", "RAZORPAY"],
    },
    "FESTIVE200": {
        "code": "FESTIVE200",
        "title": "Flat Rs200 Off",
        "description": "Save Rs200 on each eligible checkout item above Rs1499.",
        "kind": "flat",
        "value": 200.0,
        "max_discount": 200.0,
        "min_subtotal": 1499.0,
        "payment_methods": ["COD", "RAZORPAY"],
    },
    "UPI75": {
        "code": "UPI75",
        "title": "Online Pay Bonus",
        "description": "Save Rs75 on each eligible item above Rs799 when you pay online.",
        "kind": "flat",
        "value": 75.0,
        "max_discount": 75.0,
        "min_subtotal": 799.0,
        "payment_methods": ["RAZORPAY"],
    },
}


PAYMENT_METHOD_LABELS = {
    "COD": "Cash on Delivery",
    "RAZORPAY": "UPI / Card / Wallet / NetBanking",
}


def normalize_promo_code(value: str | None) -> str:
    return "".join(
        char for char in str(value or "").strip().upper()
        if char.isalnum()
    )[:24]


def normalize_promo_payment_methods(methods) -> list[str]:
    normalized = []
    for method in methods or []:
        value = str(method or "").strip().upper()
        if value and value in ALLOWED_PROMO_PAYMENT_METHODS and value not in normalized:
            normalized.append(value)
    return normalized


def is_reserved_static_promo_code(code: str | None) -> bool:
    return normalize_promo_code(code) in PROMO_CODES


def _coerce_object_id(value):
    if isinstance(value, ObjectId):
        return value
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return ObjectId(text)
    except Exception:
        return None


def _stringify_object_id(value):
    if isinstance(value, ObjectId):
        return str(value)
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _is_promo_active(promo: dict, *, now: datetime | None = None) -> bool:
    current = now or datetime.utcnow()
    start_at = promo.get("start_at")
    end_at = promo.get("end_at")

    if start_at and current < start_at:
        return False
    if end_at and current > end_at:
        return False
    return True


def serialize_promo_definition(promo: dict) -> dict:
    methods = normalize_promo_payment_methods(promo.get("payment_methods") or [])
    source = str(promo.get("source") or "static").strip().lower() or "static"
    promo_id = promo.get("_id") or promo.get("id")
    seller_id = promo.get("seller_id")
    product_id = promo.get("product_id")

    return {
        "id": _stringify_object_id(promo_id),
        "source": source,
        "code": normalize_promo_code(promo.get("code")),
        "title": str(promo.get("title") or "").strip(),
        "description": str(promo.get("description") or "").strip(),
        "kind": str(promo.get("kind") or "flat").strip().lower(),
        "value": float(promo.get("value") or 0),
        "max_discount": float(promo.get("max_discount") or 0),
        "min_subtotal": float(promo.get("min_subtotal") or 0),
        "payment_methods": methods,
        "payment_method_labels": [PAYMENT_METHOD_LABELS.get(method, method) for method in methods],
        "seller_id": _stringify_object_id(seller_id),
        "product_id": _stringify_object_id(product_id),
        "applies_per_item": True,
        "applies_to_all_products": source == "seller" and not product_id,
    }


def _build_result(
    *,
    requested_code: str,
    promo: dict | None,
    is_applied: bool,
    discount_amount: float,
    payable_total: float,
    error_code: str = "",
    reason: str = "",
):
    return {
        "requested_code": requested_code,
        "promo": promo,
        "is_applied": is_applied,
        "discount_amount": round(float(discount_amount or 0), 2),
        "payable_total": round(float(payable_total or 0), 2),
        "error_code": error_code,
        "reason": reason,
    }


def _evaluate_serialized_promo(
    *,
    promo: dict,
    requested_code: str,
    subtotal: float,
    payment_method: str,
):
    normalized_method = str(payment_method or "").strip().upper()
    normalized_subtotal = round(float(subtotal or 0), 2)
    allowed_methods = normalize_promo_payment_methods(promo.get("payment_methods") or [])

    if allowed_methods and normalized_method not in allowed_methods:
        labels = ", ".join(PAYMENT_METHOD_LABELS.get(method, method) for method in allowed_methods)
        return _build_result(
            requested_code=requested_code,
            promo=promo,
            is_applied=False,
            discount_amount=0.0,
            payable_total=normalized_subtotal,
            error_code="payment_method_not_eligible",
            reason=f"{requested_code} only works with {labels}.",
        )

    minimum_subtotal = float(promo.get("min_subtotal") or 0)
    if normalized_subtotal < minimum_subtotal:
        return _build_result(
            requested_code=requested_code,
            promo=promo,
            is_applied=False,
            discount_amount=0.0,
            payable_total=normalized_subtotal,
            error_code="minimum_not_met",
            reason=f"{requested_code} applies on eligible items above Rs{int(minimum_subtotal)}.",
        )

    if promo.get("kind") == "percent":
        discount_amount = normalized_subtotal * (float(promo.get("value") or 0) / 100.0)
    else:
        discount_amount = float(promo.get("value") or 0)

    max_discount = float(promo.get("max_discount") or 0)
    if max_discount > 0:
        discount_amount = min(discount_amount, max_discount)

    discount_amount = round(min(discount_amount, max(normalized_subtotal - 1.0, 0.0)), 2)
    payable_total = round(max(normalized_subtotal - discount_amount, 0.0), 2)

    if discount_amount <= 0:
        return _build_result(
            requested_code=requested_code,
            promo=promo,
            is_applied=False,
            discount_amount=0.0,
            payable_total=normalized_subtotal,
            error_code="discount_unavailable",
            reason="Promo discount is unavailable for this item right now.",
        )

    return _build_result(
        requested_code=requested_code,
        promo=promo,
        is_applied=True,
        discount_amount=discount_amount,
        payable_total=payable_total,
    )


async def _find_seller_promo_by_code(db, *, code: str) -> dict | None:
    if not db:
        return None
    return await db.seller_promo_codes.find_one({"code": code})


async def get_active_promo_catalog(
    *,
    db=None,
    seller_id=None,
    product_id=None,
    payment_method: str | None = None,
    subtotal: float | None = None,
    now: datetime | None = None,
) -> list[dict]:
    current = now or datetime.utcnow()
    normalized_method = str(payment_method or "").strip().upper()
    normalized_subtotal = None if subtotal is None else round(float(subtotal or 0), 2)
    promos = []

    for code in sorted(PROMO_CODES):
        promo = PROMO_CODES[code]
        if not _is_promo_active(promo, now=current):
            continue
        serialized = serialize_promo_definition({**promo, "source": "static"})
        if normalized_method and serialized["payment_methods"] and normalized_method not in serialized["payment_methods"]:
            continue
        if normalized_subtotal is not None and normalized_subtotal < float(serialized.get("min_subtotal") or 0):
            continue
        promos.append(serialized)

    seller_object_id = _coerce_object_id(seller_id)
    product_object_id = _coerce_object_id(product_id)
    if db and seller_object_id:
        query = {
            "seller_id": seller_object_id,
            "status": "active",
            "start_at": {"$lte": current},
            "end_at": {"$gte": current},
            "$or": [
                {"product_id": {"$exists": False}},
                {"product_id": None},
            ],
        }
        if product_object_id:
            query["$or"].append({"product_id": product_object_id})
        if normalized_method:
            query["payment_methods"] = normalized_method

        rows = await db.seller_promo_codes.find(query).sort([("created_at", -1)]).to_list(100)
        for row in rows:
            serialized = serialize_promo_definition({**row, "source": "seller"})
            if normalized_subtotal is not None and normalized_subtotal < float(serialized.get("min_subtotal") or 0):
                continue
            promos.append(serialized)

    promos.sort(key=lambda promo: (promo.get("source") != "seller", promo.get("code") or ""))
    return promos


async def evaluate_promo_code(
    *,
    db=None,
    code: str | None,
    subtotal: float,
    payment_method: str,
    seller_id=None,
    product_id=None,
    now: datetime | None = None,
) -> dict:
    normalized_code = normalize_promo_code(code)
    normalized_subtotal = round(float(subtotal or 0), 2)
    current = now or datetime.utcnow()
    seller_id_str = _stringify_object_id(seller_id)
    product_id_str = _stringify_object_id(product_id)

    if not normalized_code:
        return _build_result(
            requested_code="",
            promo=None,
            is_applied=False,
            discount_amount=0.0,
            payable_total=normalized_subtotal,
        )

    static_promo = PROMO_CODES.get(normalized_code)
    if static_promo and _is_promo_active(static_promo, now=current):
        serialized = serialize_promo_definition({**static_promo, "source": "static"})
        return _evaluate_serialized_promo(
            promo=serialized,
            requested_code=normalized_code,
            subtotal=normalized_subtotal,
            payment_method=payment_method,
        )

    promo_row = await _find_seller_promo_by_code(db, code=normalized_code)
    if not promo_row:
        return _build_result(
            requested_code=normalized_code,
            promo=None,
            is_applied=False,
            discount_amount=0.0,
            payable_total=normalized_subtotal,
            error_code="invalid_code",
            reason="Promo code not found or inactive.",
        )

    if str(promo_row.get("status") or "").strip().lower() != "active" or not _is_promo_active(promo_row, now=current):
        return _build_result(
            requested_code=normalized_code,
            promo=None,
            is_applied=False,
            discount_amount=0.0,
            payable_total=normalized_subtotal,
            error_code="invalid_code",
            reason="Promo code not found or inactive.",
        )

    serialized = serialize_promo_definition({**promo_row, "source": "seller"})
    promo_seller_id = serialized.get("seller_id")
    promo_product_id = serialized.get("product_id")

    if seller_id_str and promo_seller_id and promo_seller_id != seller_id_str:
        return _build_result(
            requested_code=normalized_code,
            promo=serialized,
            is_applied=False,
            discount_amount=0.0,
            payable_total=normalized_subtotal,
            error_code="seller_not_eligible",
            reason=f"{normalized_code} is not valid for this seller.",
        )

    if promo_product_id and product_id_str and promo_product_id != product_id_str:
        return _build_result(
            requested_code=normalized_code,
            promo=serialized,
            is_applied=False,
            discount_amount=0.0,
            payable_total=normalized_subtotal,
            error_code="product_not_eligible",
            reason=f"{normalized_code} is not valid for this product.",
        )

    if promo_product_id and not product_id_str:
        return _build_result(
            requested_code=normalized_code,
            promo=serialized,
            is_applied=False,
            discount_amount=0.0,
            payable_total=normalized_subtotal,
            error_code="product_not_eligible",
            reason=f"{normalized_code} is not valid for this product.",
        )

    return _evaluate_serialized_promo(
        promo=serialized,
        requested_code=normalized_code,
        subtotal=normalized_subtotal,
        payment_method=payment_method,
    )
