import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/cart",
          "/checkout",
          "/login",
          "/orders",
          "/api",
        ],
      },
    ],
    sitemap: "https://brandcart.in/sitemap.xml",
  };
}
