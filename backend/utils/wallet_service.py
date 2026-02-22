from datetime import datetime
from bson import ObjectId
from database import get_db
from config.constants import SELLER_RESERVE_CONFIG

# ==============================
# Ledger entry types (ENUM-LIKE)
# ==============================

ENTRY_SALE_CREDIT = "SALE_CREDIT"
ENTRY_COMMISSION_DEBIT = "COMMISSION_DEBIT"
ENTRY_RESERVE_HOLD = "RESERVE_HOLD"
ENTRY_RESERVE_RELEASE = "RESERVE_RELEASE"
ENTRY_REFUND_DEBIT = "REFUND_DEBIT"


# ==============================
# Core: Append-only ledger write
# ==============================

async def add_ledger_entry(
    db,
    seller_id: ObjectId,
    entry_type: str,
    credit: int = 0,
    debit: int = 0,
    order_id: ObjectId | None = None,
    reason_code: str | None = None,
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
        "created_at": datetime.utcnow(),
    }

    await db.wallet_ledger.insert_one(entry)


# ==============================
# Wallet balance (derived only)
# ==============================

async def get_wallet_balance(db, seller_id: ObjectId) -> int:
    pipeline = [
        {"$match": {"seller_id": seller_id}},
        {"$group": {
            "_id": None,
            "credit": {"$sum": "$credit"},
            "debit": {"$sum": "$debit"},
        }},
    ]

    result = await db.wallet_ledger.aggregate(pipeline).to_list(1)
    if not result:
        return 0

    return result[0]["credit"] - result[0]["debit"]


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

    reserve = summary.get(ENTRY_RESERVE_HOLD, 0) - summary.get(ENTRY_RESERVE_RELEASE, 0)
    return max(reserve, 0)


# ==============================
# Settlement (COD / prepaid)
# ==============================

async def process_order_settlement(
    db,
    seller_id: ObjectId,
    order_id: ObjectId,
    order_amount: int,
    commission_percent: float,
):
    seller = await db.users.find_one({"_id": seller_id})
    if not seller:
        raise Exception("Seller not found")
    
    seller = await db.users.find_one({"_id": seller_id})
    if seller.get("is_frozen"):
        raise Exception("Settlement blocked: seller is frozen")

    tier = seller.get("seller_tier", "standard")
    reserve_percent = SELLER_RESERVE_CONFIG.get(tier, 10)

    commission = int(order_amount * commission_percent / 100)
    reserve = int(order_amount * reserve_percent / 100)
    seller_credit = order_amount - commission - reserve

    # Commission debit
    await add_ledger_entry(
        db,
        seller_id,
        ENTRY_COMMISSION_DEBIT,
        debit=commission,
        order_id=order_id,
        reason_code="COMMISSION_DEDUCTED",
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
        entry_type="RETURN_REFUND",
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
        entry_type="RESERVE_RELEASE",
        credit=reserve_amount,
        order_id=order_id,
        reason_code="RETURN_RESERVE_RELEASED",
    )