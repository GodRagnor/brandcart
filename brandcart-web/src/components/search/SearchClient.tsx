"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import ProductGrid from "@/components/product/ProductGrid";

export default function SearchClient() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(query.trim());
    }, 500);

    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products, brands…"
        className="w-full border rounded-lg px-4 py-3 mb-6"
      />

      {debounced ? (
        <ProductGrid search={debounced} />
      ) : (
        <p className="text-sm text-neutral-500">
          Start typing to search products.
        </p>
      )}
    </div>
  );
}
