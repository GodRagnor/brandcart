"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  const redirect = params.get("redirect") || "/";

  const sendOtp = async () => {
    setLoading(true);
    await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/auth/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });

    router.push(`/otp?phone=${phone}&redirect=${redirect}`);
  };

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm p-6 border rounded">
        <h1 className="text-xl font-semibold mb-4">Login</h1>

        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Enter phone number"
          className="w-full border p-2 mb-4"
        />

        <button
          onClick={sendOtp}
          disabled={loading || phone.length < 10}
          className="w-full bg-black text-white py-2"
        >
          {loading ? "Sending OTP..." : "Send OTP"}
        </button>
      </div>
    </main>
  );
}
