import re

def make_slug(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"\s+", "-", text)
    return text

async def generate_unique_seller_slug(db, base_slug: str) -> str:
    slug = base_slug
    counter = 1

    while await db.users.find_one({"seller_profile.slug": slug}):
        counter += 1
        slug = f"{base_slug}-{counter}"

    return slug
