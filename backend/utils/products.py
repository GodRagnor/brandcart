from bson import ObjectId

def build_product_card(product: dict, seller: dict):
    product_images = product.get("images") or product.get("image_urls") or []

    return {
        "id": str(product["_id"]),
        "title": product.get("title"),
        "selling_price": product.get("selling_price"),
        "mrp": product.get("mrp"),
        "images": product_images,
        "category": product.get("category"),
        "sub_category": product.get("sub_category"),
        "seller": {
            "id": str(seller["_id"]),
            "brand_name": seller.get("seller_profile", {}).get("brand_name"),
            "slug": seller.get("seller_profile", {}).get("slug"),
            "logo_url": seller.get("seller_profile", {}).get("logo_url"),
            "trust_score": seller.get("seller_profile", {})
                              .get("trust", {})
                              .get("score", 0),
        },
        "stock": product.get("stock", 0),
    }
