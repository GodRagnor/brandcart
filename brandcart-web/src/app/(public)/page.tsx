import type { Metadata } from "next";

import CategoryStrip from "@/components/home/CategoryStrip";
import BannerCarousel from "@/components/home/BannerCarousel";
import HomeClient from "@/components/home/HomeClient";
import HomeHeaderClient from "@/components/home/HomeHeaderClient";

import { getCategories } from "@/lib/api/categories";
import { getBanners } from "@/lib/api/banners";

/* ================= SEO (STEP 15) ================= */
export const metadata: Metadata = {
  title: "Brandcart | Local-first Indian Marketplace",
  description:
    "Shop from verified local sellers with COD, fast delivery and best prices on Brandcart.",
  alternates: {
    canonical: "https://brandcart.in",
  },
  openGraph: {
    title: "Brandcart | Local-first Indian Marketplace",
    description:
      "Buy products online from verified sellers with COD and fast delivery.",
    url: "https://brandcart.in",
    siteName: "Brandcart",
    type: "website",
  },
};
/* ================================================= */

export default async function Home() {
  let categories: any[] = [];
  let banners: any[] = [];

  try {
    const results = await Promise.allSettled([
      getCategories(),
      getBanners(),
    ]);

    if (results[0].status === "fulfilled" && Array.isArray(results[0].value)) {
      categories = results[0].value;
    }

    if (results[1].status === "fulfilled" && Array.isArray(results[1].value)) {
      banners = results[1].value;
    }
  } catch (err) {
    console.error("Home page fetch failed:", err);
  }

  return (
    <main className="bg-neutral-50 min-h-screen">
      {/* Client-only header (location, search, cart) */}
      <HomeHeaderClient />

      {/* Server-rendered SEO-safe sections */}
      <CategoryStrip categories={categories} />
      <BannerCarousel banners={banners} />

      {/* Client-side pincode-driven product sections */}
      <HomeClient />
    </main>
  );
}
