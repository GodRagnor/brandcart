export default function ProductSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6 animate-pulse">
      <div className="h-64 bg-neutral-200 rounded mb-6" />
      <div className="h-6 w-1/2 bg-neutral-200 rounded mb-4" />
      <div className="h-4 w-1/3 bg-neutral-200 rounded mb-6" />
      <div className="h-10 w-full bg-neutral-200 rounded" />
    </div>
  );
}
