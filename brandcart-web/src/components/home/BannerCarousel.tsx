"use client";

import Image from "next/image";

type Banner = {
  title?: string;
  image?: string;
  cat?: string;
  link?: string;
};

type BannerCarouselProps = {
  banners: Banner[];
};

export default function BannerCarousel({ banners }: BannerCarouselProps) {
  if (!banners || banners.length === 0) return null;

  return (
    <section className="px-4 py-6">
      <div className="overflow-hidden rounded-2xl">
        {banners.map((b, index) => (
          <div
            key={index}
            className="relative h-48 bg-gradient-to-r from-orange-500 to-amber-500"
          >
            {b.image && (
              <Image
                src={b.image}
                alt={b.title ?? "Banner"}
                fill
                className="object-cover"
                priority={index === 0}
              />
            )}

            <div className="absolute inset-0 bg-black/40" />

            <div className="absolute inset-0 flex flex-col justify-center px-6 text-white">
              {b.title && (
                <h2 className="text-lg font-semibold leading-snug">
                  {b.title}
                </h2>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
