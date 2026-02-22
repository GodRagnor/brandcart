import ProductSectionSkeleton from "./ProductSectionSkeleton";
import ProductCard from "@/components/product/ProductCard";

type Props = {
  title: string;
  products: any[];
  loading?: boolean;
  viewAllLink?: string;
};

export default function ProductSection({
  title,
  products,
  loading = false,
  viewAllLink,
}: Props) {
  if (loading) {
    return <ProductSectionSkeleton />;
  }

  if (!products.length) {
    return null;
  }

  return (
    <section className="px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {viewAllLink && (
          <a
            href={viewAllLink}
            className="text-sm text-orange-600 hover:underline"
          >
            View all
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
