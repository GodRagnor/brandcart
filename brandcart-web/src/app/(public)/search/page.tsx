import { Suspense } from "react";
import SearchClient from "@/components/search/SearchClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search Products Online | Brandcart",
  description:
    "Search products across categories on Brandcart with COD and verified sellers.",
};

export default function SearchPage() {
  return (
    <main className="min-h-screen bg-neutral-50">
      <Suspense
        fallback={
          <div className="px-4 py-10 text-center text-neutral-500">
            Loading search results…
          </div>
        }
      >
        <SearchClient />
      </Suspense>
    </main>
  );
}
