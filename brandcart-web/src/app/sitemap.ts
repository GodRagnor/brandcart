import type { MetadataRoute } from "next";
import { getCategories } from "@/lib/api/categories";
import { serverFetch } from "@/lib/server-api";

/* ================= TYPES ================= */
type Category = {
  slug: string;
};
/* ======================================== */

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://brandcart.in";

  /* ---------- Static routes ---------- */
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/search`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];

  /* ---------- Category routes ---------- */
  let categoryRoutes: MetadataRoute.Sitemap = [];
  try {
    const categories = (await getCategories()) as Category[];

    categoryRoutes = categories.map((c) => ({
      url: `${baseUrl}/category/${c.slug}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    }));
  } catch {
    // fail silently – sitemap must never crash
  }

  /* ---------- Product routes (limited crawl) ---------- */
  let productRoutes: MetadataRoute.Sitemap = [];
  try {
    const products = await serverFetch<{ id: string }[]>(
      "/products?limit=500"
    );

    productRoutes = products.map((p) => ({
      url: `${baseUrl}/product/${p.id}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    }));
  } catch {
    // fail silently
  }

  return [
    ...staticRoutes,
    ...categoryRoutes,
    ...productRoutes,
  ];
}
