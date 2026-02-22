import api from "@/lib/api";

export async function getFlashDeals() {
  const res = await api.get("/products/flash-deals");
  return res.data;
}

export async function getTopDiscounts() {
  const res = await api.get("/products/top-discounts");
  return res.data;
}

export async function getTrending() {
  const res = await api.get("/products/trending");
  return res.data;
}

export async function getRecommended() {
  const res = await api.get("/products/recommended");
  return res.data;
}

export async function getTopBrands() {
  const res = await api.get("/brands/top");
  return res.data;
}
