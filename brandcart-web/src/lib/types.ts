/* ============================
   SHARED DOMAIN TYPES
   Used across API + UI + SEO
============================ */

/* ---------- SELLER ---------- */
export type Seller = {
  brand_name: string;
  trust_score: number;
  cod_supported: boolean;
};

/* ---------- PRODUCT ---------- */
export type Product = {
  id: string;

  title: string;
  description: string;

  /* Images */
  image: string;          // primary image
  images?: string[];      // optional gallery

  /* Pricing */
  selling_price: number;
  mrp?: number;

  /* Inventory */
  stock: number;

  /* Relations */
  seller: Seller;
};

/* ---------- CATEGORY ---------- */
export type Category = {
  name: string;
  slug: string;
  icon?: string;
};

/* ---------- BANNER ---------- */
export type Banner = {
  id: string;
  title?: string;
  subtitle?: string;
  image: string;
  link?: string;
};

/* ---------- PAGINATION ---------- */
export type PaginationParams = {
  page?: number;
  limit?: number;
};

/* ---------- SEARCH PARAMS ---------- */
export type ProductSearchParams = {
  q?: string;
  category?: string;
  sub_category?: string;
  min_price?: number;
  max_price?: number;
  sort?: string;
  page?: number;
};
