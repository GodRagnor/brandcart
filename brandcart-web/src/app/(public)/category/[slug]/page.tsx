import type { Metadata } from "next";
import ProductGrid from "@/components/product/ProductGrid";
import { getCategories } from "@/lib/api/categories";

/* ================= TYPES ================= */
type Category = {
  name: string;
  slug: string;
  icon?: string;
};

type Props = {
  params: { slug: string };
};
/* ========================================= */

/* ================= SEO (STEP 14 + 15) ================= */
export async function generateMetadata(
  { params }: Props
): Promise<Metadata> {
  const categories = (await getCategories()) as Category[];
  const category = categories.find(
    (c) => c.slug === params.slug
  );

  const name =
    category?.name ??
    params.slug.replace(/-/g, " ");

  const canonicalUrl = `https://brandcart.in/category/${params.slug}`;

  return {
    title: `${name} Products Online | Brandcart`,
    description: `Buy ${name} products online at best price with COD & verified sellers on Brandcart.`,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${name} Products | Brandcart`,
      description: `Shop ${name} products with fast delivery and COD on Brandcart.`,
      url: canonicalUrl,
    },
  };
}
/* ===================================================== */

export default function CategoryPage({ params }: Props) {
  return (
    <main className="min-h-screen bg-neutral-50">
      <h1 className="px-4 py-4 text-xl font-semibold capitalize">
        {params.slug.replace(/-/g, " ")}
      </h1>

      <ProductGrid category={params.slug} />
    </main>
  );
}
