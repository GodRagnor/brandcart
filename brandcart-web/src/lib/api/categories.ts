import { serverFetch } from "@/lib/server-api";

export async function getCategories() {
  return serverFetch("/public/categories", {
    revalidate: 3600, // 1 hour
    tags: ["categories"],
  });
}
