"use client";

import Image from "next/image";
import Link from "next/link";
import CODBadge from "./CODBadge";
import ProductTrust from "./ProductTrust";

type ProductCardProps = {
  product: {
    id: string;
    title: string;
    image?: string;
    selling_price: number;
    mrp: number;
    stock: number;
    seller: {
      brand_name: string;
      trust_score: number;
      cod_supported: boolean;
    };
  };
};

export default function ProductCard({ product }: ProductCardProps) {
  const discount =
    product.mrp > product.selling_price
      ? Math.round(
          ((product.mrp - product.selling_price) / product.mrp) * 100
        )
      : 0;

  return (
    <Link
      href={`/product/${product.id}`}
      className="group block rounded-xl border bg-white hover:shadow-md transition"
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden rounded-t-xl">
        <Image
          src={product.image || "/placeholder.png"}
          alt={product.title}
          fill
          className="object-cover group-hover:scale-105 transition"
        />
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        {/* Title */}
        <h3 className="text-sm font-medium line-clamp-2">
          {product.title}
        </h3>

        {/* Price */}
        <div className="flex items-center gap-2">
          <span className="font-semibold text-lg">
            ₹{product.selling_price.toLocaleString()}
          </span>
          {discount > 0 && (
            <>
              <span className="text-sm line-through text-neutral-400">
                ₹{product.mrp.toLocaleString()}
              </span>
              <span className="text-xs font-medium text-green-600">
                {discount}% OFF
              </span>
            </>
          )}
        </div>

        {/* Trust + COD */}
        <div className="flex items-center justify-between">
          <ProductTrust
            brand={product.seller.brand_name}
            score={product.seller.trust_score}
          />
          <CODBadge enabled={product.seller.cod_supported} />
        </div>

        {/* CTA */}
        <button
          disabled={product.stock === 0}
          className="mt-2 w-full rounded-lg bg-black py-2 text-sm text-white disabled:bg-neutral-300 disabled:cursor-not-allowed"
        >
          {product.stock === 0 ? "Out of Stock" : "Add to Cart"}
        </button>
      </div>
    </Link>
  );
}
