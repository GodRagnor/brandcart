"use client";

import Image from "next/image";
import Link from "next/link";

type Category = {
  id: string;
  name: string;
  icon_url: string;
  slug: string;
};

export default function CategoryStrip({ categories }: { categories: Category[] }) {
  if (!categories.length) return null;

  return (
    <section className="px-4 py-3">
      <div className="flex gap-4 overflow-x-auto no-scrollbar">
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/category/${cat.slug}`}
            className="flex flex-col items-center min-w-[64px]"
          >
            <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center">
              <Image
                src={cat.icon_url}
                alt={cat.name}
                width={28}
                height={28}
              />
            </div>
            <span className="mt-1 text-xs text-neutral-700 text-center">
              {cat.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
