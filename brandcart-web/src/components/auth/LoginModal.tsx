"use client";

import { useState } from "react";
import { useAuth } from "@/context/auth";

export default function LoginModal({ onClose }: { onClose: () => void }) {
  const { login } = useAuth();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");

  async function sendOtp() {
    await fetch("http://127.0.0.1:8000/api/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    setStep("otp");
  }

  async function verifyOtp() {
    const res = await fetch("http://127.0.0.1:8000/api/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, otp }),
    });

    const data = await res.json();

    login(data.access_token, {
      phone,
      role: data.role,
    });

    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-white p-6 rounded w-80">
        {step === "phone" ? (
          <>
            <input
              placeholder="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="border p-2 w-full"
            />
            <button onClick={sendOtp} className="mt-3 w-full bg-black text-white p-2">
              Send OTP
            </button>
          </>
        ) : (
          <>
            <input
              placeholder="OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="border p-2 w-full"
            />
            <button onClick={verifyOtp} className="mt-3 w-full bg-black text-white p-2">
              Verify
            </button>
          </>
        )}
      </div>
    </div>
  );
}
