export default function TopBrandsSkeleton() {
  return (
    <section className="px-4 py-6">
      <div className="h-5 w-32 bg-neutral-200 rounded mb-4 animate-pulse" />

      <div className="flex gap-4 overflow-x-auto">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="min-w-[96px] h-20 rounded-lg bg-neutral-200 animate-pulse"
          />
        ))}
      </div>
    </section>
  );
}
