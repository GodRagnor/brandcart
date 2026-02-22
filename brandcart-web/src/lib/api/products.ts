import api from "@/lib/api";
import type { Product } from "@/lib/types";

export async function searchProducts(params: {
  category?: string;
  search?: string;
  sort?: string;
  page?: number;
  min_price?: number;
  max_price?: number;
}) {
  const res = await api.get("/products/search", { params });
  return res.data;
}


export async function getProductById(id: string): Promise<Product | null> {
  try {
    const res = await api.get(`/products/${id}`);
    return res.data ?? null;
  } catch {
    return null;
  }
}
