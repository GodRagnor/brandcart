import time
from typing import Dict
from fastapi import HTTPException, status

# In-memory store (process-level)
_RATE_LIMIT_STORE: Dict[str, list] = {}

def rate_limit(
    key: str,
    max_requests: int,
    window_seconds: int,
):
    """
    Simple sliding window rate limiter.
    key = user_id / ip / phone / route
    """

    now = time.time()
    window_start = now - window_seconds

    timestamps = _RATE_LIMIT_STORE.get(key, [])

    # keep only valid timestamps
    timestamps = [t for t in timestamps if t > window_start]

    if len(timestamps) >= max_requests:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please slow down.",
        )

    timestamps.append(now)
    _RATE_LIMIT_STORE[key] = timestamps
