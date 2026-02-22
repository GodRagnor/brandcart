"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function CheckoutPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login?redirect=/checkout");
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return <main className="p-6">Checking authentication...</main>;
  }

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold mb-4">Checkout</h1>
      {/* Address + Payment comes next */}
    </main>
  );
}
