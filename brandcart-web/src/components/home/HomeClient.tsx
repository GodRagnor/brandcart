"use client";

import { useEffect, useState } from "react";
import { useLocation } from "@/context/location";

import ProductSection from "@/components/home/ProductSection";
import TopBrands from "@/components/home/TopBrands";

import {
  getFlashDeals,
  getTopDiscounts,
  getTrending,
  getRecommended,
  getTopBrands,
} from "@/lib/api/home";

export default function HomeClient() {
  const { pincode } = useLocation();

  const [loading, setLoading] = useState(false);

  const [flashDeals, setFlashDeals] = useState<any[]>([]);
  const [topDiscounts, setTopDiscounts] = useState<any[]>([]);
  const [trending, setTrending] = useState<any[]>([]);
  const [recommended, setRecommended] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);

  useEffect(() => {
    if (!pincode || pincode.length !== 6) return;

    setLoading(true);

    Promise.all([
      getFlashDeals(),
      getTopDiscounts(),
      getTrending(),
      getRecommended(),
      getTopBrands(),
    ])
      .then(
        ([
          flashDealsData,
          topDiscountsData,
          trendingData,
          recommendedData,
          brandsData,
        ]) => {
          setFlashDeals(flashDealsData || []);
          setTopDiscounts(topDiscountsData || []);
          setTrending(trendingData || []);
          setRecommended(recommendedData || []);
          setBrands(brandsData || []);
        }
      )
      .finally(() => setLoading(false));
  }, [pincode]);

  const hasAnyProducts =
    flashDeals.length ||
    topDiscounts.length ||
    trending.length ||
    recommended.length;

  /* ---------------------------------- */
  /* PINCODE GUARD */
  /* ---------------------------------- */
  if (!pincode || pincode.length !== 6) {
    return (
      <div className="px-4 py-6 text-sm text-neutral-500">
        Enter a valid 6-digit pincode to see available products.
      </div>
    );
  }

  /* ---------------------------------- */
  /* EMPTY STATE */
  /* ---------------------------------- */
  if (!loading && !hasAnyProducts) {
    return (
      <div className="px-4 py-6 text-sm text-neutral-500">
        No products available for this pincode.
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      {/* ---------------------------------- */}
      {/* FLASH DEALS (HIGH-CONVERSION) */}
      {/* ---------------------------------- */}
      <ProductSection
        title="Flash Deals"
        products={flashDeals}
        loading={loading}
        viewAllLink="/flash-deals"
      />

      {/* ---------------------------------- */}
      {/* TOP DISCOUNTS */}
      {/* ---------------------------------- */}
      <ProductSection
        title="Top Discounts"
        products={topDiscounts}
        loading={loading}
        viewAllLink="/top-discounts"
      />

      {/* ---------------------------------- */}
      {/* TRENDING (PREMIUM FEEL) */}
      {/* ---------------------------------- */}
      <ProductSection
        title="Trending"
        products={trending}
        loading={loading}
        viewAllLink="/trending"
      />

      {/* ---------------------------------- */}
      {/* RECOMMENDED */}
      {/* ---------------------------------- */}
      <ProductSection
        title="Recommended for You"
        products={recommended}
        loading={loading}
      />

      {/* ---------------------------------- */}
      {/* TOP BRANDS (TRUST BUILDER) */}
      {/* ---------------------------------- */}
      {brands.length > 0 && (
        <TopBrands brands={brands} />
      )}
    </div>
  );
}
