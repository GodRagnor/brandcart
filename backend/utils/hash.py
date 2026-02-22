from passlib.context import CryptContext

# bcrypt configuration
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

# bcrypt hard limit
MAX_BCRYPT_BYTES = 72


def hash_password(password: str) -> str:
    """
    Hash a password safely using bcrypt.
    Enforces bcrypt 72-byte limit.
    """
    if len(password.encode("utf-8")) > MAX_BCRYPT_BYTES:
        raise ValueError("Password too long (max 72 bytes)")
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify password safely.
    Never lets bcrypt crash, even with bad legacy hashes.
    """
    if len(plain_password.encode("utf-8")) > MAX_BCRYPT_BYTES:
        return False
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False
