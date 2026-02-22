import Image from "next/image";
import TopBrandsSkeleton from "./TopBrandsSkeleton";

type Brand = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
};

function safeImageSrc(src: string | null) {
  if (!src) return "/placeholder-brand.png";
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  if (src.startsWith("/")) return src;
  return "/placeholder-brand.png";
}

export default function TopBrands({ brands }: { brands: Brand[] }) {
  if (!brands.length) return <TopBrandsSkeleton />;

  return (
    <section className="px-4 py-6">
      <h2 className="text-lg font-semibold mb-4">Top Brands</h2>

      <div className="flex gap-4 overflow-x-auto">
        {brands.map((b) => (
          <div
            key={b.id}
            className="min-w-[96px] h-20 bg-white border rounded-lg flex items-center justify-center"
          >
            <Image
              src={safeImageSrc(b.logo_url)}
              alt={b.name}
              width={72}
              height={40}
              className="object-contain"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
