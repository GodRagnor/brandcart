import ProductCardSkeleton from "@/components/product/ProductCardSkeleton";

export default function ProductSectionSkeleton() {
  return (
    <section className="px-4 py-6">
      {/* Title */}
      <div className="mb-4">
        <div className="h-5 w-40 bg-neutral-200 rounded" />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}
