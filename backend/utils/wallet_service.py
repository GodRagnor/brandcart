from datetime import datetime
from bson import ObjectId
from database import get_db
from config.constants import SELLER_RESERVE_CONFIG

# ==============================
# Ledger entry types (ENUM-LIKE)
# ==============================

ENTRY_SALE_CREDIT = "SALE_CREDIT"
ENTRY_COMMISSION_DEBIT = "COMMISSION_DEBIT"
ENTRY_PLATFORM_FEE_DEBIT = "PLATFORM_FEE_DEBIT"
ENTRY_RESERVE_HOLD = "RESERVE_HOLD"
ENTRY_RESERVE_RELEASE = "RESERVE_RELEASE"
ENTRY_REFUND_DEBIT = "REFUND_DEBIT"
ENTRY_EMERGENCY_PAYOUT_HOLD = "EMERGENCY_PAYOUT_HOLD"
ENTRY_EMERGENCY_PAYOUT_RELEASE = "EMERGENCY_PAYOUT_RELEASE"
ENTRY_WEEKLY_PAYOUT_HOLD = "WEEKLY_PAYOUT_HOLD"
ENTRY_WEEKLY_PAYOUT_RELEASE = "WEEKLY_PAYOUT_RELEASE"
ENTRY_COD_RTO_PENALTY = "COD_RTO_PENALTY"
ENTRY_COMMISSION_LOCK = "COMMISSION_LOCK"

PAYOUT_RELEASE_ENTRY_TYPE_BY_REQUEST_TYPE = {
    "emergency": ENTRY_EMERGENCY_PAYOUT_RELEASE,
    "weekly_settlement": ENTRY_WEEKLY_PAYOUT_RELEASE,
}


# ==============================
# Core: Append-only ledger write
# ==============================

async def add_ledger_entry(
    db,
    seller_id: ObjectId,
    entry_type: str,
    credit: float = 0,
    debit: float = 0,
    order_id: ObjectId | None = None,
    reason_code: str | None = None,
    reference_id: ObjectId | None = None,
    note: str | None = None,
    created_at: datetime | None = None,
):
    if credit < 0 or debit < 0:
        raise ValueError("Credit/Debit cannot be negative")

    entry = {
        "seller_id": seller_id,
        "order_id": order_id,
        "entry_type": entry_type,
        "credit": credit,
        "debit": debit,
        "reason_code": reason_code,
        "reference_id": reference_id,
        "note": note,
        "created_at": created_at or datetime.utcnow(),
    }

    await db.wallet_ledger.insert_one(entry)


# ==============================
# Wallet balance (derived only)
# ==============================

def compute_wallet_balance(summary: dict) -> float:
    # SALE_CREDIT is already net of commission, platform fee and reserve hold.
    # Reserve becomes withdrawable only after RESERVE_RELEASE is recorded.
    contributing_entry_types = {
        ENTRY_SALE_CREDIT,
        ENTRY_RESERVE_RELEASE,
        ENTRY_REFUND_DEBIT,
        ENTRY_EMERGENCY_PAYOUT_HOLD,
        ENTRY_EMERGENCY_PAYOUT_RELEASE,
        ENTRY_WEEKLY_PAYOUT_HOLD,
        ENTRY_WEEKLY_PAYOUT_RELEASE,
        ENTRY_COD_RTO_PENALTY,
        ENTRY_COMMISSION_LOCK,
    }
    return round(sum(float(summary.get(entry_type, 0) or 0) for entry_type in contributing_entry_types), 2)


async def get_wallet_balance(db, seller_id: ObjectId) -> float:
    summary = await get_wallet_summary(db, seller_id)
    return compute_wallet_balance(summary)


# ==============================
# Reserve balance (critical)
# ==============================

async def get_reserve_balance(db, seller_id: ObjectId) -> int:
    pipeline = [
        {"$match": {"seller_id": seller_id}},
        {"$group": {
            "_id": "$entry_type",
            "amount": {"$sum": {"$subtract": ["$credit", "$debit"]}},
        }},
    ]

    rows = await db.wallet_ledger.aggregate(pipeline).to_list(None)
    summary = {r["_id"]: r["amount"] for r in rows}

    reserve = float(summary.get(ENTRY_RESERVE_HOLD, 0) or 0) - float(summary.get(ENTRY_RESERVE_RELEASE, 0) or 0)
    return round(max(reserve, 0), 2)


async def get_wallet_summary(db, seller_id: ObjectId) -> dict:
    pipeline = [
        {"$match": {"seller_id": seller_id}},
        {"$group": {"_id": "$entry_type", "amount": {"$sum": {"$subtract": ["$credit", "$debit"]}}}},
    ]

    rows = await db.wallet_ledger.aggregate(pipeline).to_list(None)
    return {row["_id"]: round(float(row["amount"] or 0), 2) for row in rows}


# ==============================
# Settlement (COD / prepaid)
# ==============================

async def process_order_settlement(
    db,
    seller_id: ObjectId,
    order_id: ObjectId,
    order_amount: float,
    commission_percent: float,
    platform_fee: float = 0,
):
    seller = await db.users.find_one({"_id": seller_id})
    if not seller:
        raise Exception("Seller not found")
    
    if seller.get("is_frozen"):
        raise Exception("Settlement blocked: seller is frozen")

    tier = seller.get("seller_tier", "standard")
    reserve_percent = SELLER_RESERVE_CONFIG.get(tier, 10)

    commission = round(order_amount * commission_percent / 100, 2)
    reserve = round(order_amount * reserve_percent / 100, 2)
    platform_fee = round(float(platform_fee or 0), 2)
    seller_credit = round(order_amount - commission - reserve - platform_fee, 2)

    # Commission debit
    await add_ledger_entry(
        db,
        seller_id,
        ENTRY_COMMISSION_DEBIT,
        debit=commission,
        order_id=order_id,
        reason_code="COMMISSION_DEDUCTED",
    )

    # Fixed platform fee debit
    if platform_fee > 0:
        await add_ledger_entry(
            db,
            seller_id,
            ENTRY_PLATFORM_FEE_DEBIT,
            debit=platform_fee,
            order_id=order_id,
            reason_code="PLATFORM_FEE_DEDUCTED",
        )

    # Seller sale credit
    await add_ledger_entry(
        db,
        seller_id,
        ENTRY_SALE_CREDIT,
        credit=seller_credit,
        order_id=order_id,
        reason_code="ORDER_SETTLED",
    )

    # Reserve hold
    if reserve > 0:
        await add_ledger_entry(
            db,
            seller_id,
            ENTRY_RESERVE_HOLD,
            credit=reserve,
            order_id=order_id,
            reason_code="RESERVE_HELD",
        )


# ==============================
# Refund (reserve only, no clawback)
# ==============================

async def process_return_refund(db, seller_id, order_id, refund_amount):
    await add_ledger_entry(
        db=db,
        seller_id=seller_id,
        entry_type=ENTRY_REFUND_DEBIT,
        debit=refund_amount,
        order_id=order_id,
        reason_code="RETURN_APPROVED_REFUND",
    )

# ==============================
# Reserve release (no return case)
# ==============================

async def release_reserve(db, seller_id, order_id, reserve_amount):
    await add_ledger_entry(
        db=db,
        seller_id=seller_id,
        entry_type=ENTRY_RESERVE_RELEASE,
        credit=reserve_amount,
        order_id=order_id,
        reason_code="RETURN_RESERVE_RELEASED",
    )


async def release_payout_hold(
    db,
    *,
    payout: dict,
    reason_code: str,
    released_by: str | None = None,
    note: str | None = None,
) -> bool:
    release_entry_type = PAYOUT_RELEASE_ENTRY_TYPE_BY_REQUEST_TYPE.get(payout.get("type"))
    if not release_entry_type:
        raise ValueError(f"Unsupported payout type for hold release: {payout.get('type')}")

    existing_release = await db.wallet_ledger.find_one({
        "reference_id": payout["_id"],
        "entry_type": release_entry_type,
    })
    if existing_release:
        return False

    now = datetime.utcnow()
    await add_ledger_entry(
        db=db,
        seller_id=payout["seller_id"],
        entry_type=release_entry_type,
        credit=float(payout.get("total_debit", payout.get("amount", 0)) or 0),
        reason_code=reason_code,
        reference_id=payout["_id"],
        note=note,
        created_at=now,
    )
    await db.payout_requests.update_one(
        {"_id": payout["_id"]},
        {"$set": {
            "hold_released_at": now,
            "hold_released_by": released_by,
            "hold_release_reason_code": reason_code,
        }},
    )
    return True
