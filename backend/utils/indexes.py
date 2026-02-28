from pymongo import ASCENDING, DESCENDING
from pymongo.errors import OperationFailure

from utils.idempotency import IDEMPOTENCY_TTL_SECONDS


def _normalize_key_pairs(keys):
    return [(k, v) for k, v in keys]


async def _create_index_safe(collection, keys, **kwargs):
    """
    Create index safely.
    If Mongo reports IndexOptionsConflict/IndexKeySpecsConflict for same key pattern,
    drop the conflicting index and recreate with desired options.
    """
    desired_key = _normalize_key_pairs(keys)
    desired_name = kwargs.get("name")
    try:
        await collection.create_index(keys, **kwargs)
        return
    except OperationFailure as e:
        if getattr(e, "code", None) not in {85, 86}:
            raise

        conflicting_names = []
        async for idx in collection.list_indexes():
            idx_key = _normalize_key_pairs(list(idx.get("key", {}).items()))
            if idx_key == desired_key:
                idx_name = idx.get("name")
                if idx_name and idx_name != desired_name:
                    conflicting_names.append(idx_name)

        for idx_name in conflicting_names:
            await collection.drop_index(idx_name)

        await collection.create_index(keys, **kwargs)


async def ensure_indexes(db):
    # Users
    await _create_index_safe(
        db.users,
        [("phone", ASCENDING)],
        name="users_phone_unique_idx",
        unique=True,
        sparse=True,
    )
    await _create_index_safe(
        db.users,
        [("role", ASCENDING), ("seller_status", ASCENDING)],
        name="users_role_seller_status_idx",
    )

    # OTP
    await _create_index_safe(
        db.otp_codes,
        [("phone", ASCENDING)],
        name="otp_phone_unique_idx",
        unique=True,
    )
    await _create_index_safe(
        db.otp_codes,
        [("expires_at", ASCENDING)],
        name="otp_expires_ttl_idx",
        expireAfterSeconds=0,
    )

    # Products
    await _create_index_safe(
        db.products,
        [("active", ASCENDING), ("created_at", DESCENDING)],
        name="products_active_created_idx",
    )
    await _create_index_safe(
        db.products,
        [("seller_id", ASCENDING), ("created_at", DESCENDING)],
        name="products_seller_created_idx",
    )

    # Orders
    await _create_index_safe(
        db.orders,
        [("buyer_id", ASCENDING), ("created_at", DESCENDING)],
        name="orders_buyer_created_at_idx",
    )
    await _create_index_safe(
        db.orders,
        [("seller_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)],
        name="orders_seller_status_created_at_idx",
    )
    await _create_index_safe(
        db.orders,
        [("payment.method", ASCENDING), ("payment.status", ASCENDING)],
        name="orders_payment_state_idx",
    )
    await _create_index_safe(
        db.orders,
        [("status", ASCENDING), ("settlement.status", ASCENDING), ("delivered_at", ASCENDING)],
        name="orders_settlement_idx",
    )

    # Idempotency
    await _create_index_safe(
        db.idempotency_keys,
        [("key", ASCENDING), ("scope", ASCENDING)],
        name="idempotency_key_scope_unique",
        unique=True,
    )
    await _create_index_safe(
        db.idempotency_keys,
        [("created_at", ASCENDING)],
        name="idempotency_ttl_idx",
        expireAfterSeconds=IDEMPOTENCY_TTL_SECONDS,
    )

    # Payout requests
    await _create_index_safe(
        db.payout_requests,
        [("status", ASCENDING), ("requested_at", DESCENDING)],
        name="payout_requests_status_requested_at_idx",
    )
    await _create_index_safe(
        db.payout_requests,
        [("seller_id", ASCENDING), ("requested_at", DESCENDING)],
        name="payout_requests_seller_requested_at_idx",
    )
    await _create_index_safe(
        db.payout_requests,
        [("provider_payout_id", ASCENDING)],
        name="payout_requests_provider_payout_unique",
        unique=True,
        sparse=True,
    )

    # Wallet ledger
    await _create_index_safe(
        db.wallet_ledger,
        [("seller_id", ASCENDING), ("created_at", DESCENDING)],
        name="wallet_ledger_seller_created_at_idx",
    )
    await _create_index_safe(
        db.wallet_ledger,
        [("reference_id", ASCENDING)],
        name="wallet_ledger_reference_idx",
        sparse=True,
    )
