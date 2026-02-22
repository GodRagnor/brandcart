"use client";

export default function ProductFilters({
  onChange,
}: {
  onChange: (f: any) => void;
}) {
  return (
    <select
      className="border rounded px-3 py-2 text-sm"
      onChange={(e) =>
        onChange({ price: e.target.value })
      }
    >
      <option value="">Price</option>
      <option value="0-500">Below ₹500</option>
      <option value="500-1000">₹500–₹1000</option>
      <option value="1000-5000">₹1000–₹5000</option>
    </select>
  );
}
