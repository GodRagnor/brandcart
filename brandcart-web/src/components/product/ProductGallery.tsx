"use client";

import Image from "next/image";

type Props = {
  images: string[];
};

export default function ProductGallery({ images }: Props) {
  if (!images?.length) return null;

  return (
    <div className="relative w-full aspect-square">
      <Image
        src={images[0]}
        alt="Product image"
        fill
        priority   // 🚀 Makes this LCP optimized
        sizes="(max-width: 768px) 100vw, 50vw"
        className="object-cover rounded-xl"
      />
    </div>
  );
}
