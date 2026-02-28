import base64
import hashlib
import hmac
import json
from urllib import request, error

from fastapi import HTTPException

from config.env import RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET

RAZORPAY_API_BASE = "https://api.razorpay.com/v1"
RAZORPAY_CURRENCY = "INR"


def _require_razorpay_config() -> tuple[str, str]:
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=500, detail="Razorpay keys are not configured")
    return RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET


def _basic_auth_header(key_id: str, key_secret: str) -> str:
    token = f"{key_id}:{key_secret}".encode("utf-8")
    return "Basic " + base64.b64encode(token).decode("utf-8")


def amount_to_paise(amount_inr: float) -> int:
    return int(round(float(amount_inr) * 100))


def create_razorpay_order(*, amount_paise: int, receipt: str, notes: dict | None = None) -> dict:
    key_id, key_secret = _require_razorpay_config()

    payload = {
        "amount": amount_paise,
        "currency": RAZORPAY_CURRENCY,
        "receipt": receipt,
        "notes": notes or {},
    }

    req = request.Request(
        url=f"{RAZORPAY_API_BASE}/orders",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": _basic_auth_header(key_id, key_secret),
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except error.HTTPError as e:
        details = e.read().decode("utf-8", errors="ignore")
        raise HTTPException(status_code=502, detail=f"Razorpay order create failed: {details}")
    except Exception:
        raise HTTPException(status_code=502, detail="Razorpay order create failed")


def verify_checkout_signature(*, razorpay_order_id: str, razorpay_payment_id: str, razorpay_signature: str) -> bool:
    _, key_secret = _require_razorpay_config()
    message = f"{razorpay_order_id}|{razorpay_payment_id}".encode("utf-8")
    expected = hmac.new(key_secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, razorpay_signature)


def verify_webhook_signature(*, raw_body: bytes, received_signature: str) -> bool:
    if not RAZORPAY_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Razorpay webhook secret is not configured")
    expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received_signature)
