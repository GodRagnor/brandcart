import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# =====================================================
# ENV
# =====================================================
ENV = os.getenv("ENV", "development")

# =====================================================
# DATABASE
# =====================================================
MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI")

# =====================================================
# JWT
# =====================================================
JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_DAYS = int(os.getenv("ACCESS_TOKEN_DAYS", 30))

BUYER_ACCESS_TOKEN_MINUTES = int(os.getenv("BUYER_ACCESS_TOKEN_MINUTES", 60))
BUYER_REFRESH_TOKEN_DAYS = int(os.getenv("BUYER_REFRESH_TOKEN_DAYS", 30))

SELLER_ACCESS_TOKEN_MINUTES = int(os.getenv("SELLER_ACCESS_TOKEN_MINUTES", 30))
SELLER_REFRESH_TOKEN_DAYS = int(os.getenv("SELLER_REFRESH_TOKEN_DAYS", 7))

# =====================================================
# SECRETS
# =====================================================
OTP_SECRET = os.getenv("OTP_SECRET")
DELIVERY_WEBHOOK_SECRET = os.getenv("DELIVERY_WEBHOOK_SECRET")
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY")
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET")
EMERGENCY_PAYOUT_FEE_PERCENT = float(os.getenv("EMERGENCY_PAYOUT_FEE_PERCENT", 1.5))
EMERGENCY_PAYOUT_FEE_FLAT = float(os.getenv("EMERGENCY_PAYOUT_FEE_FLAT", 5))
PAYOUT_PROVIDER = os.getenv("PAYOUT_PROVIDER", "razorpayx")
RAZORPAYX_KEY_ID = os.getenv("RAZORPAYX_KEY_ID")
RAZORPAYX_KEY_SECRET = os.getenv("RAZORPAYX_KEY_SECRET")
RAZORPAYX_ACCOUNT_NUMBER = os.getenv("RAZORPAYX_ACCOUNT_NUMBER")
RAZORPAYX_WEBHOOK_SECRET = os.getenv("RAZORPAYX_WEBHOOK_SECRET")

# =====================================================
# COD / RISK
# =====================================================
MAX_COD_ORDER_VALUE = int(os.getenv("MAX_COD_ORDER_VALUE", 25000))
MAX_DAILY_COD_ORDERS = int(os.getenv("MAX_DAILY_COD_ORDERS", 20))
COD_MIN_SECURITY_BALANCE = int(os.getenv("COD_MIN_SECURITY_BALANCE", 0))
COD_RTO_PENALTY = int(os.getenv("COD_RTO_PENALTY", 0))
MAX_NEGATIVE_WALLET = int(os.getenv("MAX_NEGATIVE_WALLET", -5000))

# =====================================================
# RETURNS
# =====================================================
RETURN_WINDOW_DAYS = int(os.getenv("RETURN_WINDOW_DAYS", 7))
SELLER_ACTION_HOURS = int(os.getenv("SELLER_ACTION_HOURS", 48))

# =====================================================
# CORS
# =====================================================
CORS_ALLOWED_ORIGINS = os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")

# =====================================================
# ADMIN
# =====================================================
ADMIN_PHONE = os.getenv("ADMIN_PHONE")

# --------------------------------------------------
# CLOUDINARY
# --------------------------------------------------

CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")

# --------------------------------------------------
# DATA ENCRYPTION
# --------------------------------------------------
BANK_DATA_ENCRYPTION_KEY = os.getenv("BANK_DATA_ENCRYPTION_KEY")

# =====================================================
# OTP & NOTIFICATIONS
# =====================================================
OTP_DEV_MODE = (os.getenv("OTP_DEV_MODE", "true")).lower() in {"1", "true", "yes", "on"}
AUTH_COOKIE_SECURE = (os.getenv("AUTH_COOKIE_SECURE", "true" if ENV.lower() == "production" else "false")).lower() in {"1", "true", "yes", "on"}
AUTH_COOKIE_SAMESITE = (os.getenv("AUTH_COOKIE_SAMESITE", "lax") or "lax").strip().lower()
AUTH_COOKIE_DOMAIN = (os.getenv("AUTH_COOKIE_DOMAIN") or "").strip() or None

# SMS Configuration (Twilio)
SMS_PROVIDER = (os.getenv("SMS_PROVIDER") or "twilio").lower()
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_FROM_PHONE = os.getenv("TWILIO_FROM_PHONE")

# Email Configuration (SMTP)
EMAIL_PROVIDER = (os.getenv("EMAIL_PROVIDER") or "none").lower()
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL")


def validate_production_env() -> None:
    if (ENV or "").lower() != "production":
        return

    if OTP_DEV_MODE:
        raise RuntimeError("Production env misconfigured. OTP_DEV_MODE must be false in production.")

    allowed_samesite = {"lax", "strict", "none"}
    if AUTH_COOKIE_SAMESITE not in allowed_samesite:
        raise RuntimeError(
            f"Production env misconfigured. AUTH_COOKIE_SAMESITE must be one of: {', '.join(sorted(allowed_samesite))}"
        )
    if AUTH_COOKIE_SAMESITE == "none" and not AUTH_COOKIE_SECURE:
        raise RuntimeError(
            "Production env misconfigured. AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAMESITE=none."
        )

    required = {
        "JWT_SECRET": JWT_SECRET,
        "OTP_SECRET": OTP_SECRET,
        "DELIVERY_WEBHOOK_SECRET": DELIVERY_WEBHOOK_SECRET,
        "ADMIN_API_KEY": ADMIN_API_KEY,
        "RAZORPAY_KEY_ID": RAZORPAY_KEY_ID,
        "RAZORPAY_KEY_SECRET": RAZORPAY_KEY_SECRET,
        "RAZORPAY_WEBHOOK_SECRET": RAZORPAY_WEBHOOK_SECRET,
        "RAZORPAYX_KEY_ID": RAZORPAYX_KEY_ID,
        "RAZORPAYX_KEY_SECRET": RAZORPAYX_KEY_SECRET,
        "RAZORPAYX_ACCOUNT_NUMBER": RAZORPAYX_ACCOUNT_NUMBER,
        "RAZORPAYX_WEBHOOK_SECRET": RAZORPAYX_WEBHOOK_SECRET,
        "CLOUDINARY_CLOUD_NAME": CLOUDINARY_CLOUD_NAME,
        "CLOUDINARY_API_KEY": CLOUDINARY_API_KEY,
        "CLOUDINARY_API_SECRET": CLOUDINARY_API_SECRET,
        "MONGODB_URI": MONGO_URI,
        "BANK_DATA_ENCRYPTION_KEY": BANK_DATA_ENCRYPTION_KEY,
    }

    invalid = []
    for key, value in required.items():
        val = (value or "").strip()
        if not val or val.startswith("CHANGE_THIS"):
            invalid.append(key)

    otp_channels_enabled = False
    if SMS_PROVIDER == "twilio":
        otp_channels_enabled = True
        for key, value in {
            "TWILIO_ACCOUNT_SID": TWILIO_ACCOUNT_SID,
            "TWILIO_AUTH_TOKEN": TWILIO_AUTH_TOKEN,
            "TWILIO_FROM_PHONE": TWILIO_FROM_PHONE,
        }.items():
            val = (value or "").strip()
            if not val or val.startswith("CHANGE_THIS"):
                invalid.append(key)
    elif SMS_PROVIDER not in {"", "none"}:
        invalid.append("SMS_PROVIDER")

    if EMAIL_PROVIDER == "smtp":
        otp_channels_enabled = True
        for key, value in {
            "SMTP_HOST": SMTP_HOST,
            "SMTP_USER": SMTP_USER,
            "SMTP_PASSWORD": SMTP_PASSWORD,
        }.items():
            val = (value or "").strip()
            if not val or val.startswith("CHANGE_THIS"):
                invalid.append(key)
    elif EMAIL_PROVIDER not in {"", "none"}:
        invalid.append("EMAIL_PROVIDER")

    if not otp_channels_enabled:
        invalid.append("OTP_PROVIDER")

    if (RAZORPAY_KEY_ID or "").startswith("rzp_test_"):
        invalid.append("RAZORPAY_KEY_ID_LIVE")
    if (RAZORPAYX_KEY_ID or "").startswith("rzp_test_"):
        invalid.append("RAZORPAYX_KEY_ID_LIVE")

    if invalid:
        raise RuntimeError(f"Production env misconfigured. Invalid keys: {', '.join(sorted(invalid))}")
