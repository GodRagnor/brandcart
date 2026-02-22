"use client";

import { useEffect, useRef, useState } from "react";

import ProductCard from "@/components/product/ProductCard";
import ProductGridSkeleton from "@/components/product/ProductGridSkeleton";
import ProductFilters from "@/components/product/ProductFilters";
import ProductSort from "@/components/product/ProductSort";

import { searchProducts } from "@/lib/api/products";

type Props = {
  category?: string;
  search?: string;
};

export default function ProductGrid({ category, search }: Props) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters, setFilters] = useState<any>({});
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loaderRef = useRef<HTMLDivElement | null>(null);

  /* 🔁 RESET when inputs change */
  useEffect(() => {
    setProducts([]);
    setPage(1);
    setHasMore(true);
  }, [category, search, filters, sort]);

  /* 📦 FETCH PRODUCTS */
  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      page === 1 ? setLoading(true) : setLoadingMore(true);

      try {
        const data = await searchProducts({
          category,
          search,
          ...filters,
          sort,
          page,
        });

        if (!active) return;

        const list = Array.isArray(data) ? data : [];

        if (page === 1) {
          setProducts(list);
        } else {
          setProducts((prev) => [...prev, ...list]);
        }

        if (list.length === 0) {
          setHasMore(false);
        }
      } catch {
        if (!active) return;
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [page, category, search, filters, sort]);

  /* 👀 INTERSECTION OBSERVER */
  useEffect(() => {
    if (!hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPage((p) => p + 1);
        }
      },
      { rootMargin: "200px" }
    );

    if (loaderRef.current) observer.observe(loaderRef.current);

    return () => observer.disconnect();
  }, [hasMore, loadingMore]);

  if (loading && page === 1) {
    return <ProductGridSkeleton />;
  }

  if (!products.length) {
    return (
      <div className="px-4 py-10 text-sm text-neutral-500">
        No products found.
      </div>
    );
  }

  return (
    <div className="px-4">
      {/* Filters & Sort */}
      <div className="flex gap-4 mb-4">
        <ProductFilters onChange={setFilters} />
        <ProductSort onChange={setSort} />
      </div>

      {/* Products */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>

      {/* Loader trigger */}
      {hasMore && (
        <div ref={loaderRef} className="py-10">
          {loadingMore && <ProductGridSkeleton />}
        </div>
      )}
    </div>
  );
}
