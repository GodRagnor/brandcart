"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/cart";

export default function CartPage() {
  const { items, removeFromCart, updateQty } = useCart();
  const router = useRouter();

  const subtotal = items.reduce(
    (total, item) => total + item.price * item.qty,
    0
  );

  if (items.length === 0) {
    return (
      <main className="p-8 text-center">
        <h1 className="text-xl font-semibold mb-2">Your cart is empty</h1>
        <button
          onClick={() => router.push("/")}
          className="bg-black text-white px-4 py-2 rounded"
        >
          Continue Shopping
        </button>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-6 grid md:grid-cols-3 gap-6">
      {/* LEFT — Cart Items */}
      <div className="md:col-span-2 space-y-4">
        {items.map(item => (
          <div
            key={item.product_id}
            className="flex gap-4 border p-4 rounded-lg"
          >
            <div className="relative w-24 h-24">
              <Image
                src={item.image}
                alt={item.title}
                fill
                className="object-cover rounded"
              />
            </div>

            <div className="flex-1">
              <h2 className="font-semibold">{item.title}</h2>
              <p className="text-lg font-semibold mt-1">₹{item.price}</p>

              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() =>
                    updateQty(item.product_id, item.qty - 1)
                  }
                  className="px-2 py-1 border rounded"
                >
                  -
                </button>

                <span>{item.qty}</span>

                <button
                  onClick={() =>
                    updateQty(item.product_id, item.qty + 1)
                  }
                  className="px-2 py-1 border rounded"
                >
                  +
                </button>
              </div>

              <button
                onClick={() => removeFromCart(item.product_id)}
                className="text-red-500 text-sm mt-3"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* RIGHT — Summary */}
      <div className="border p-6 rounded-lg h-fit">
        <h2 className="font-semibold mb-4">Price Details</h2>

        <div className="flex justify-between mb-2">
          <span>Subtotal</span>
          <span>₹{subtotal}</span>
        </div>

        <div className="flex justify-between mb-4">
          <span>Delivery</span>
          <span>Free</span>
        </div>

        <hr className="mb-4" />

        <div className="flex justify-between font-semibold text-lg mb-4">
          <span>Total</span>
          <span>₹{subtotal}</span>
        </div>

        <button
          onClick={() => router.push("/checkout")}
          className="w-full bg-black text-white py-3 rounded-lg"
        >
          Proceed to Checkout
        </button>
      </div>
    </main>
  );
}
