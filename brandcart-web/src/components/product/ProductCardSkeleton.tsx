import Skeleton from "@/components/ui/Skeleton";

export default function ProductCardSkeleton() {
  return (
    <div className="border border-neutral-200 rounded-xl p-3 space-y-3">
      {/* Image */}
      <Skeleton className="w-full h-40 rounded-lg" />

      {/* Title */}
      <Skeleton className="h-4 w-3/4" />

      {/* Price */}
      <Skeleton className="h-4 w-1/2" />

      {/* Button */}
      <Skeleton className="h-9 w-full rounded-md" />
    </div>
  );
}
