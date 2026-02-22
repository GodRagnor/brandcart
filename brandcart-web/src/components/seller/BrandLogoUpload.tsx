"use client";

import { useState } from "react";
import api from "@/lib/api";

export default function BrandLogoUpload() {
  const [loading, setLoading] = useState(false);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.[0]) return;

    const form = new FormData();
    form.append("file", e.target.files[0]);

    try {
      setLoading(true);
      await api.post("/uploads/brand-logo", form);
      alert("Brand logo updated");
      location.reload();
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <label className="block text-sm mb-2">Brand Logo</label>
      <input type="file" accept="image/*" onChange={upload} />
      {loading && <p className="text-sm mt-2">Uploading...</p>}
    </div>
  );
}
