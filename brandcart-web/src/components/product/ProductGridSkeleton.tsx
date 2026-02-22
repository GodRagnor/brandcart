export default function ProductGridSkeleton() {
  return (
    <div className="px-4 py-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="border border-neutral-200 rounded-lg p-3"
        >
          <div className="h-32 w-full rounded bg-neutral-200 animate-pulse" />
          <div className="mt-3 h-3 w-3/4 rounded bg-neutral-200 animate-pulse" />
          <div className="mt-2 h-3 w-1/2 rounded bg-neutral-200 animate-pulse" />
          <div className="mt-3 h-4 w-1/3 rounded bg-neutral-300 animate-pulse" />
        </div>
      ))}
    </div>
  );
}
