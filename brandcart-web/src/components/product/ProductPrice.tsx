type Props = {
  price: number;
  mrp?: number;
};

export default function ProductPrice({ price, mrp }: Props) {
  return (
    <div className="mt-2 flex items-center gap-3">
      <span className="text-2xl font-semibold">₹{price}</span>

      {typeof mrp === "number" && mrp > price && (
        <span className="text-sm text-neutral-500 line-through">
          ₹{mrp}
        </span>
      )}
    </div>
  );
}
