import { serverFetch } from "@/lib/server-api";

export async function getBanners() {
  return serverFetch("/public/banners", {
    revalidate: 1800, // 30 minutes
    tags: ["banners"],
  });
}
