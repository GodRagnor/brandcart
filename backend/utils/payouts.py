import base64
import hashlib
import hmac
import json
from urllib import request, error

from fastapi import HTTPException

from config.env import (
    PAYOUT_PROVIDER,
    RAZORPAYX_KEY_ID,
    RAZORPAYX_KEY_SECRET,
    RAZORPAYX_ACCOUNT_NUMBER,
    RAZORPAYX_WEBHOOK_SECRET,
)
from utils.crypto import decrypt_sensitive_value

RAZORPAYX_API_BASE = "https://api.razorpay.com/v1"


def _basic_auth_header(key_id: str, key_secret: str) -> str:
    token = f"{key_id}:{key_secret}".encode("utf-8")
    return "Basic " + base64.b64encode(token).decode("utf-8")


def _require_razorpayx_config() -> tuple[str, str, str]:
    if not RAZORPAYX_KEY_ID or not RAZORPAYX_KEY_SECRET or not RAZORPAYX_ACCOUNT_NUMBER:
        raise HTTPException(status_code=500, detail="RazorpayX payout config missing")
    return RAZORPAYX_KEY_ID, RAZORPAYX_KEY_SECRET, RAZORPAYX_ACCOUNT_NUMBER


def _post(url: str, payload: dict, auth_header: str) -> dict:
    req = request.Request(
        url=url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": auth_header,
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as e:
        details = e.read().decode("utf-8", errors="ignore")
        raise HTTPException(status_code=502, detail=f"Payout provider error: {details}")
    except Exception:
        raise HTTPException(status_code=502, detail="Payout provider request failed")


def _get(url: str, auth_header: str) -> dict:
    req = request.Request(
        url=url,
        headers={"Authorization": auth_header},
        method="GET",
    )
    try:
        with request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as e:
        details = e.read().decode("utf-8", errors="ignore")
        raise HTTPException(status_code=502, detail=f"Payout provider error: {details}")
    except Exception:
        raise HTTPException(status_code=502, detail="Payout provider request failed")


def execute_bank_payout(*, payout_request: dict, seller: dict) -> dict:
    """
    Executes emergency bank payout via configured provider.
    Returns provider metadata used for reconciliation.
    """
    provider = (PAYOUT_PROVIDER or "").lower()
    if provider != "razorpayx":
        raise HTTPException(status_code=500, detail="Unsupported payout provider")

    key_id, key_secret, account_number = _require_razorpayx_config()
    auth_header = _basic_auth_header(key_id, key_secret)

    bank = payout_request.get("bank_details", {})
    account_number = bank.get("bank_account_number")
    encrypted_account_number = bank.get("bank_account_encrypted")
    if encrypted_account_number:
        account_number = decrypt_sensitive_value(encrypted_account_number)
    if not account_number:
        raise HTTPException(status_code=400, detail="Seller bank account is missing for payout")

    amount_paise = int(round(float(payout_request["amount"]) * 100))
    if amount_paise <= 0:
        raise HTTPException(status_code=400, detail="Invalid payout amount")

    contact_payload = {
        "name": bank.get("account_holder_name") or seller.get("seller_profile", {}).get("brand_name") or "Seller",
        "type": "vendor",
        "reference_id": str(payout_request["_id"]),
        "email": seller.get("email") or "no-email@brandcart.local",
        "contact": seller.get("phone") or "9000000000",
        "notes": {
            "seller_id": str(seller["_id"]),
            "payout_request_id": str(payout_request["_id"]),
        },
    }
    contact = _post(f"{RAZORPAYX_API_BASE}/contacts", contact_payload, auth_header)
    contact_id = contact.get("id")
    if not contact_id:
        raise HTTPException(status_code=502, detail="Payout provider contact creation failed")

    fund_account_payload = {
        "contact_id": contact_id,
        "account_type": "bank_account",
        "bank_account": {
            "name": bank.get("account_holder_name"),
            "ifsc": bank.get("ifsc_code"),
            "account_number": account_number,
        },
    }
    fund_account = _post(f"{RAZORPAYX_API_BASE}/fund_accounts", fund_account_payload, auth_header)
    fund_account_id = fund_account.get("id")
    if not fund_account_id:
        raise HTTPException(status_code=502, detail="Payout provider fund account creation failed")

    payout_payload = {
        "account_number": account_number,
        "fund_account_id": fund_account_id,
        "amount": amount_paise,
        "currency": "INR",
        "mode": "IMPS",
        "purpose": "vendor_payment",
        "queue_if_low_balance": True,
        "reference_id": str(payout_request["_id"]),
        "narration": "Brandcart emergency payout",
        "notes": {
            "seller_id": str(seller["_id"]),
            "payout_request_id": str(payout_request["_id"]),
        },
    }
    payout = _post(f"{RAZORPAYX_API_BASE}/payouts", payout_payload, auth_header)
    payout_id = payout.get("id")
    payout_status = payout.get("status")
    if not payout_id:
        raise HTTPException(status_code=502, detail="Payout creation failed at provider")

    return {
        "provider": "razorpayx",
        "provider_contact_id": contact_id,
        "provider_fund_account_id": fund_account_id,
        "provider_payout_id": payout_id,
        "provider_payout_status": payout_status,
        "provider_raw": payout,
    }


def fetch_payout_status(*, provider_payout_id: str) -> dict:
    provider = (PAYOUT_PROVIDER or "").lower()
    if provider != "razorpayx":
        raise HTTPException(status_code=500, detail="Unsupported payout provider")
    key_id, key_secret, _ = _require_razorpayx_config()
    auth_header = _basic_auth_header(key_id, key_secret)
    payout = _get(f"{RAZORPAYX_API_BASE}/payouts/{provider_payout_id}", auth_header)
    return {
        "provider": "razorpayx",
        "provider_payout_id": payout.get("id"),
        "provider_payout_status": payout.get("status"),
        "provider_raw": payout,
    }


def verify_razorpayx_webhook_signature(*, raw_body: bytes, received_signature: str) -> bool:
    if not RAZORPAYX_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="RazorpayX webhook secret is not configured")
    expected = hmac.new(
        RAZORPAYX_WEBHOOK_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, received_signature)
