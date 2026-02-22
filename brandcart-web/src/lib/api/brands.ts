import api from "@/lib/api";

export async function getTopBrands() {
  try {
    const res = await api.get("/public/top-brands");
    return res.data.brands ?? [];
  } catch (e) {
    console.error("Top brands fetch failed", e);
    return [];
  }
}
