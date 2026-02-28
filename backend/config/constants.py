# backend/config/constants.py

# -----------------------------
# COD / PAYMENT LIMITS
# -----------------------------
from config.env import MAX_COD_ORDER_VALUE, MAX_DAILY_COD_ORDERS

PLATFORM_FEE_PER_ORDER = 10          # fixed INR fee per order

# -----------------------------
# WALLET / RISK LIMITS
# -----------------------------

MAX_NEGATIVE_WALLET = -5000           # hard stop for settlements
LOW_TRUST_THRESHOLD = 30              # below this = risky seller

# -----------------------------
# RETURNS / RTO
# -----------------------------

RETURN_WINDOW_DAYS = 7
SELLER_ACTION_HOURS = 48

# Time windows
RISK_LOOKBACK_DAYS = 30

# =========================================
# SELLER RESERVE RULES (BY TIER)
# =========================================

SELLER_RESERVE_CONFIG = {
    "standard": 10,        # % reserve
    "verified_fast": 5,
    "premium": 3,
}
