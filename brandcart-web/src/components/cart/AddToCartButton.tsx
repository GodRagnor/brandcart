"use client";

import { useCart } from "@/context/cart";
import type { Product } from "@/lib/types";

export default function AddToCartButton({ product }: { product: Product }) {
  const { addToCart } = useCart();

  const handleAdd = () => {
    addToCart({
      product_id: product.id,
      title: product.title,
      image: product.image,
      price: product.selling_price,
      mrp: product.mrp,
      qty: 1,
      seller_id: product.seller.brand_name,
    });
  };

  return (
    <button
      onClick={handleAdd}
      className="mt-4 bg-black text-white px-6 py-3 rounded-lg"
    >
      Add to Cart
    </button>
  );
}
