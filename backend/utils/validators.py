import re

PHONE_REGEX = re.compile(r"^(?:\+91)?[6-9]\d{9}$")

def normalize_phone(phone: str) -> str:
    phone = phone.strip()

    if phone.startswith("+91"):
        phone = phone[3:]

    if not PHONE_REGEX.match(phone):
        raise ValueError("Invalid phone number format")

    return "+91" + phone
