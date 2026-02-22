"use client";

export default function ProductSort({
  onChange,
}: {
  onChange: (s: string) => void;
}) {
  return (
    <select
      className="border rounded px-3 py-2 text-sm"
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Sort</option>
      <option value="price_asc">Price: Low → High</option>
      <option value="price_desc">Price: High → Low</option>
      <option value="rating">Top Rated</option>
    </select>
  );
}
