"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function OtpPage() {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();

  const phone = params.get("phone")!;
  const redirect = params.get("redirect") || "/";

  const verifyOtp = async () => {
    setLoading(true);

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, otp }),
    });

    const data = await res.json();

    login(data.access_token, {
      phone,
      role: data.role,
    });

    router.replace(redirect);
  };

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm p-6 border rounded">
        <h1 className="text-xl font-semibold mb-4">Enter OTP</h1>

        <input
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          placeholder="6-digit OTP"
          className="w-full border p-2 mb-4"
        />

        <button
          onClick={verifyOtp}
          disabled={loading || otp.length !== 6}
          className="w-full bg-black text-white py-2"
        >
          Verify OTP
        </button>
      </div>
    </main>
  );
}
