"use client";

import Link from "next/link";
import { Search, ShoppingCart, User, MapPin } from "lucide-react";
import { useLocation } from "@/context/location";

export default function HomeHeader() {
  const { pincode, setPincode } = useLocation();

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-neutral-200">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-4">
        {/* Brand */}
        <Link
          href="/"
          className="text-xl font-bold tracking-tight text-neutral-900"
        >
          Brandcart
        </Link>

        {/* Search */}
        <div className="flex-1 relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
          />
          <input
            type="text"
            placeholder="Search for products, brands..."
            className="
              w-full pl-10 pr-4 py-2.5
              rounded-full
              border border-neutral-300
              bg-white
              text-neutral-900
              placeholder:text-neutral-400
              focus:outline-none
              focus:ring-2
              focus:ring-orange-400
            "
          />
        </div>

        {/* Pincode */}
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-neutral-700" />
          <input
            type="text"
            maxLength={6}
            placeholder="Pincode"
            value={pincode ?? ""}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, "");
              if (value.length <= 6) setPincode(value);
            }}
            className="
              w-24 px-2 py-1.5
              rounded
              border border-neutral-300
              bg-white
              text-neutral-900
              placeholder:text-neutral-400
              text-sm
              focus:outline-none
              focus:ring-2
              focus:ring-orange-400
            "
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <Link
            href="/cart"
            className="text-neutral-700 hover:text-neutral-900"
          >
            <ShoppingCart size={22} />
          </Link>

          <Link
            href="/account"
            className="text-neutral-700 hover:text-neutral-900"
          >
            <User size={22} />
          </Link>
        </div>
      </div>
    </header>
  );
}
