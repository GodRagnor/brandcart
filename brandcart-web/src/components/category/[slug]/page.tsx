import type { Metadata } from "next";
import ProductGrid from "@/components/product/ProductGrid";
import { getCategories } from "@/lib/api/categories";

/* ---------------- TYPES ---------------- */

type Category = {
  name: string;
  slug: string;
  icon?: string;
};

type Props = {
  params: { slug: string };
};

/* ---------------- SEO (STEP 14) ---------------- */

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

  return {
    title: `${name} Products Online | Brandcart`,
    description: `Buy ${name} products online at best price with COD & verified sellers on Brandcart.`,
    openGraph: {
      title: `${name} Products | Brandcart`,
      description: `Shop ${name} with fast delivery and COD on Brandcart.`,
      url: `https://brandcart.in/category/${params.slug}`,
    },
    alternates: {
      canonical: `https://brandcart.in/category/${params.slug}`,
    },
  };
}

/* ---------------- PAGE ---------------- */

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
