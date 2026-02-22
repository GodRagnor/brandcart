from datetime import datetime
from bson import ObjectId

class WalletLedger:
    def __init__(
        self,
        seller_id: ObjectId,
        entry_type: str,
        credit: int = 0,
        debit: int = 0,
        order_id: ObjectId | None = None,
        reason_code: str | None = None,
    ):
        self.seller_id = seller_id
        self.order_id = order_id
        self.entry_type = entry_type
        self.credit = credit
        self.debit = debit
        self.reason_code = reason_code
        self.created_at = datetime.utcnow()
