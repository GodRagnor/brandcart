type Props = {
  brand: string;
  score: number;
};

export default function ProductTrust({ brand, score }: Props) {
  let label = "New Seller";
  let color = "text-neutral-500";

  if (score >= 80) {
    label = "Verified Seller";
    color = "text-green-600";
  } else if (score >= 60) {
    label = "Trusted Seller";
    color = "text-amber-600";
  }

  return (
    <div className={`text-xs font-medium ${color}`}>
      {brand} · {label}
    </div>
  );
}
