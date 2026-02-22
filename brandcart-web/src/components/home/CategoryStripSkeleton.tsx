export default function CategoryStripSkeleton() {
  return (
    <div className="flex gap-4 px-4 py-4 overflow-x-auto">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col items-center gap-2 min-w-[64px]"
        >
          <div className="h-12 w-12 rounded-full bg-neutral-200 animate-pulse" />
          <div className="h-3 w-10 rounded bg-neutral-200 animate-pulse" />
        </div>
      ))}
    </div>
  );
}
