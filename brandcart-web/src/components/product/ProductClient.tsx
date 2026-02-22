"use client";

import ProductGallery from "@/components/product/ProductGallery";
import ProductPrice from "@/components/product/ProductPrice";
import CODBadge from "@/components/product/CODBadge";
import ProductTrust from "@/components/product/ProductTrust";

type Props = {
  product: any;
};

export default function ProductClient({ product }: Props) {
  return (
    <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Left: Images */}
      <ProductGallery images={product.images || [product.image]} />

      {/* Right: Info */}
      <div>
        <h1 className="text-2xl font-semibold">{product.title}</h1>

        <ProductPrice
          price={product.selling_price}
          mrp={product.mrp}
        />

        <CODBadge enabled={product.seller?.cod_supported} />

        <ProductTrust
          brand={product.seller?.brand_name}
          score={product.seller?.trust_score}
        />

        <p className="mt-4 text-neutral-600">
          {product.description}
        </p>

        <button
          disabled={product.stock === 0}
          className="mt-6 w-full bg-black text-white py-3 rounded-lg disabled:opacity-50"
        >
          {product.stock === 0 ? "Out of stock" : "Add to Cart"}
        </button>
      </div>
    </main>
  );
}
