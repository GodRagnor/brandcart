import type { Metadata } from "next";
import { getProductById } from "@/lib/api/products";
import type { Product } from "@/lib/types";

import ProductGallery from "@/components/product/ProductGallery";
import ProductPrice from "@/components/product/ProductPrice";
import ProductTrust from "@/components/product/ProductTrust";
import CODBadge from "@/components/product/CODBadge";
import AddToCartButton from "@/components/cart/AddToCartButton";

type Props = {
  params: { id: string };
};

/* ================= SEO METADATA ================= */
export async function generateMetadata(
  { params }: Props
): Promise<Metadata> {
  const product: Product | null = await getProductById(params.id);

  if (!product) {
    return {
      title: "Product not found | Brandcart",
      description: "This product is no longer available on Brandcart.",
    };
  }

  return {
    title: `${product.title} | Brandcart`,
    description: `${product.title} at best price with COD from verified seller ${product.seller.brand_name}.`,
    openGraph: {
      title: product.title,
      description: product.description,
      images: [product.image],
      url: `https://brandcart.in/product/${product.id}`,
    },
    alternates: {
      canonical: `https://brandcart.in/product/${product.id}`,
    },
  };
}

/* ================= PAGE ================= */
export default async function ProductPage({ params }: Props) {
  const product: Product | null = await getProductById(params.id);

  if (!product) {
    return (
      <main className="p-10 text-center text-neutral-500">
        Product not found
      </main>
    );
  }

  return (
    <>
      {/* ================= STEP 9 — PRODUCT JSON-LD ================= */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.title,
            image: product.image,
            description: product.description,
            brand: {
              "@type": "Brand",
              name: product.seller.brand_name,
            },
            offers: {
              "@type": "Offer",
              priceCurrency: "INR",
              price: product.selling_price,
              availability:
                product.stock > 0
                  ? "https://schema.org/InStock"
                  : "https://schema.org/OutOfStock",
            },
          }),
        }}
      />

      {/* ================= STEP 13 — BREADCRUMB JSON-LD ================= */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: "https://brandcart.in",
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Products",
                item: "https://brandcart.in/search",
              },
              {
                "@type": "ListItem",
                position: 3,
                name: product.title,
                item: `https://brandcart.in/product/${product.id}`,
              },
            ],
          }),
        }}
      />

      {/* ================= PRODUCT UI ================= */}
      <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-neutral-50 min-h-screen">

        {/* LEFT: Images */}
        <ProductGallery images={product.images ?? [product.image]} />

        {/* RIGHT: Details */}
        <div>
          <h1 className="text-2xl font-semibold">
            {product.title}
          </h1>

          <ProductPrice
            price={product.selling_price}
            mrp={product.mrp}
          />

          <CODBadge enabled={product.seller.cod_supported} />

          <ProductTrust
            brand={product.seller.brand_name}
            score={product.seller.trust_score}
          />

          <p className="mt-4 text-neutral-600">
            {product.description}
          </p>

          <AddToCartButton product={product} />
        </div>
      </main>
    </>
  );
}
