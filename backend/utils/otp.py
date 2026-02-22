import random
import hashlib
from datetime import datetime, timedelta

# ===============================
# GENERATE 6-DIGIT OTP
# ===============================
def generate_otp() -> str:
    return str(random.randint(100000, 999999))


# ===============================
# OTP EXPIRY (5 MINUTES)
# ===============================
def otp_expiry():
    return datetime.utcnow() + timedelta(minutes=5)


# ===============================
# HASH OTP
# ===============================
def hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()


# ===============================
# VERIFY OTP
# ===============================
def verify_hash(plain_otp: str, hashed_otp: str) -> bool:
    return hash_otp(plain_otp) == hashed_otp
