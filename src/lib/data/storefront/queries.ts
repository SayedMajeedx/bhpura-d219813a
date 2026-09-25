import { queryOptions } from "@tanstack/react-query";
import { publicSupabase as supabase } from "@/integrations/supabase/client";
import { storefrontKeys } from "./keys";
import {
  CATEGORY_SELECT,
  PRODUCT_CARD_SELECT,
  PRODUCT_DETAIL_BASE_SELECT,
  PRODUCT_DETAIL_SELECT,
  QUICK_SEARCH_SELECT,
  RECOMMENDATION_SELECT,
} from "./selects";
import type {
  BestSellerRow,
  ProductRow,
  QuickSearchResult,
  RecommendationProduct,
  StorefrontBrandRef,
  StorefrontCategory,
  StorefrontProductDetail,
  TrendingRow,
} from "./types";

/**
 * Public storefront reads. Every fetcher is scoped by `brand_id` (or the brand
 * slug for RPCs that resolve it server-side) and only returns active products
 * and categories. Pages use `storefrontQueries.*` so a cache key is always
 * filled by the same fetcher with the same columns.
 */

/** Catalog data changes rarely during a visit; admin saves invalidate `storefrontKeys.all`. */
const CATALOG_CACHE = {
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: false,
} as const;

/* ------------------------------------------------------------------------- */
/* Store identity                                                            */
/* ------------------------------------------------------------------------- */

/**
 * Everything a storefront page needs in one round trip, assembled by the
 * `get_storefront_page_data` database function. `brand` and `settings` are
 * wide JSON objects that the layout route normalises itself.
 */
export type StorefrontPageData = {
  brand?: Record<string, unknown> | null;
  settings?: Record<string, unknown> | null;
  benefitSettings?: unknown[] | null;
  trackingSettings?: Record<string, unknown> | null;
  is_suspended?: boolean | null;
  suspension_reason?: string | null;
  products?: ProductRow[] | null;
  categories?: StorefrontCategory[] | null;
  bestSellerRows?: BestSellerRow[] | null;
  trendingRows?: TrendingRow[] | null;
};

/** Best sellers and trending rows in the page data are computed with this limit. */
export const PAGE_DATA_RANKING_LIMIT = 8;

export async function fetchStorefrontPageData(slug: string): Promise<StorefrontPageData | null> {
  const { data, error } = await supabase.rpc("get_storefront_page_data", { p_brand_slug: slug });
  if (error) throw error;
  return (data as StorefrontPageData | null) ?? null;
}

export async function fetchActiveBrandIdentity(slug: string) {
  const { data, error } = await supabase
    .from("brands")
    .select("id, slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type StorefrontPageMeta = {
  brand: {
    id: string;
    name_en: string;
    name_ar: string | null;
    logo_url: string | null;
    meta_title: string | null;
    meta_description: string | null;
  };
  pages: unknown[];
  faviconUrl: string | null;
};

/**
 * Brand identity, SEO fields and CMS pages for server-rendered page heads.
 * SEO fields and settings are read separately so a schema change to either
 * cannot take the storefront offline (see cfe61be7).
 */
export async function fetchStorefrontPageMeta(slug: string): Promise<StorefrontPageMeta | null> {
  const { data: baseBrand, error } = await supabase
    .from("brands")
    .select("id, name_en, name_ar, logo_url")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !baseBrand) return null;

  const [{ data: seo }, { data: settings }] = await Promise.all([
    supabase
      .from("brands")
      .select("meta_title, meta_description")
      .eq("id", baseBrand.id)
      .maybeSingle(),
    supabase
      .from("brand_public_settings")
      .select("pages, logo_url, favicon_url")
      .eq("brand_id", baseBrand.id)
      .maybeSingle(),
  ]);

  return {
    brand: {
      ...baseBrand,
      meta_title: seo?.meta_title ?? null,
      meta_description: seo?.meta_description ?? null,
    },
    pages: Array.isArray(settings?.pages) ? settings.pages : [],
    faviconUrl: settings?.favicon_url || settings?.logo_url || baseBrand.logo_url || null,
  };
}

/* ------------------------------------------------------------------------- */
/* Products                                                                  */
/* ------------------------------------------------------------------------- */

export async function fetchStorefrontProducts(brandId: string): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_CARD_SELECT)
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ProductRow[];
}

/** Active products with these ids, in the order given; unknown or inactive ids are dropped. */
export async function fetchProductsByIds(
  brandId: string,
  ids: readonly string[],
): Promise<ProductRow[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_CARD_SELECT)
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .in("id", [...ids]);
  if (error) throw error;
  const byId = new Map(((data ?? []) as unknown as ProductRow[]).map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is ProductRow => Boolean(p));
}

/** One product id lookup: full columns, or the base columns if the full request fails. */
async function fetchProductById(
  brandId: string,
  productId: string,
): Promise<StorefrontProductDetail | null> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_DETAIL_SELECT)
    .eq("id", productId)
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .maybeSingle();
  if (data) return data as unknown as StorefrontProductDetail;
  if (!error) return null;

  const { data: fallback } = await supabase
    .from("products")
    .select(PRODUCT_DETAIL_BASE_SELECT)
    .eq("id", productId)
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .maybeSingle();
  return (fallback as unknown as StorefrontProductDetail | null) ?? null;
}

/**
 * Product page / quick view lookup. Tries the id, then any `alternateIds`
 * (the product page passes an id repaired from a corrupted URL), then treats
 * the target as a name slug ("black-abaya" → "black abaya").
 */
export async function fetchProductDetail(
  brandId: string,
  targetId: string,
  alternateIds: readonly string[] = [],
): Promise<StorefrontProductDetail | null> {
  for (const candidate of [targetId, ...alternateIds]) {
    if (!candidate) continue;
    const product = await fetchProductById(brandId, candidate);
    if (product) return product;
  }

  const nameGuess = targetId.replace(/-/g, " ");
  const { data } = await supabase
    .from("products")
    .select(PRODUCT_DETAIL_SELECT)
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .or(`name_en.ilike.${nameGuess},name.ilike.${nameGuess}`)
    .maybeSingle();
  return (data as unknown as StorefrontProductDetail | null) ?? null;
}

export async function fetchRecommendationCatalog(
  brandId: string,
): Promise<RecommendationProduct[]> {
  const { data, error } = await supabase
    .from("products")
    .select(RECOMMENDATION_SELECT)
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as RecommendationProduct[];
}

export async function fetchBestSellerRows(slug: string, limit: number): Promise<BestSellerRow[]> {
  const { data, error } = await supabase.rpc("get_storefront_best_sellers", {
    p_brand_slug: slug,
    p_limit: limit,
  });
  if (error) throw error;
  return data ?? [];
}

export async function fetchTrendingRows(slug: string, limit: number): Promise<TrendingRow[]> {
  const { data, error } = await supabase.rpc("get_storefront_trending", {
    p_brand_slug: slug,
    p_limit: limit,
  });
  if (error) throw error;
  return data ?? [];
}

/** What a category page lists: a smart collection or a set of category values. */
export type CategoryProductsScope =
  | { kind: "best" }
  | { kind: "new" }
  | { kind: "offers" }
  | { kind: "categories"; values: string[] };

export function categoryScopeKey(scope: CategoryProductsScope): string {
  return scope.kind === "categories"
    ? `categories:${[...scope.values].sort().join("|")}`
    : scope.kind;
}

const NEW_ARRIVALS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function fetchCategoryProducts(
  brand: StorefrontBrandRef,
  scope: CategoryProductsScope,
): Promise<ProductRow[]> {
  if (scope.kind === "best") {
    const ranked = await fetchBestSellerRows(brand.slug, 24);
    return fetchProductsByIds(
      brand.id,
      ranked.map((row) => row.product_id),
    );
  }

  let query = supabase
    .from("products")
    .select(PRODUCT_CARD_SELECT)
    .eq("brand_id", brand.id)
    .eq("is_active", true);

  if (scope.kind === "categories") {
    query = query.in("category", scope.values);
  } else if (scope.kind === "new") {
    query = query.gte("created_at", new Date(Date.now() - NEW_ARRIVALS_WINDOW_MS).toISOString());
  }

  let ordered = query.order("created_at", { ascending: false });
  if (scope.kind === "new") ordered = ordered.limit(60);
  if (scope.kind === "offers") ordered = ordered.limit(200);

  const { data, error } = await ordered;
  if (error) throw error;
  const rows = (data ?? []) as unknown as ProductRow[];
  if (scope.kind !== "offers") return rows;
  return rows.filter((product) =>
    product.product_variants.some(
      (variant) => Number(variant.original_price || 0) > Number(variant.selling_price || 0),
    ),
  );
}

/* ------------------------------------------------------------------------- */
/* Search                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Characters with meaning inside a PostgREST `or=(…)` filter or an ILIKE
 * pattern. Left in a term, a comma or bracket breaks the request and `%`/`_`
 * act as wildcards, so they are replaced with spaces.
 */
export function sanitizeSearchTerm(term: string): string {
  return term.replace(/[%_,()\\]/g, " ").trim();
}

/** Full search page: names, descriptions and category. */
export async function fetchStorefrontSearch(brandId: string, term: string): Promise<ProductRow[]> {
  const clean = sanitizeSearchTerm(term);
  if (!clean) return [];
  const pattern = `%${clean}%`;
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_CARD_SELECT)
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .or(
      ["name", "name_ar", "name_en", "description", "description_ar", "description_en", "category"]
        .map((column) => `${column}.ilike.${pattern}`)
        .join(","),
    );
  if (error) throw error;
  return (data ?? []) as unknown as ProductRow[];
}

/** Instant search boxes: product names only, a handful of results. */
export async function fetchQuickSearch(
  brandId: string,
  term: string,
  limit: number,
): Promise<QuickSearchResult[]> {
  const clean = sanitizeSearchTerm(term);
  if (clean.length < 2) return [];
  const pattern = `%${clean}%`;
  const { data, error } = await supabase
    .from("products")
    .select(QUICK_SEARCH_SELECT)
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .or(`name.ilike.${pattern},name_ar.ilike.${pattern},name_en.ilike.${pattern}`)
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as QuickSearchResult[];
}

/* ------------------------------------------------------------------------- */
/* Categories and options                                                    */
/* ------------------------------------------------------------------------- */

export async function fetchStorefrontCategories(brandId: string): Promise<StorefrontCategory[]> {
  const { data, error } = await supabase
    .from("categories")
    .select(CATEGORY_SELECT)
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as StorefrontCategory[];
}

/** An active category by slug, or null when it does not exist (the page shows 404). */
export async function fetchCategoryBySlug(
  brandId: string,
  categorySlug: string,
): Promise<StorefrontCategory | null> {
  const { data, error } = await supabase
    .from("categories")
    .select(CATEGORY_SELECT)
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .eq("slug", categorySlug)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as StorefrontCategory | null) ?? null;
}

/** Paid add-ons (gift wrap, engraving …) offered on product pages. Optional: errors yield none. */
export async function fetchCustomizationOptions(brandId: string) {
  const { data, error } = await supabase
    .from("customization_options")
    .select("*")
    .eq("brand_id", brandId)
    .order("name");
  if (error) return [];
  return data ?? [];
}

/* ------------------------------------------------------------------------- */
/* Query options                                                             */
/* ------------------------------------------------------------------------- */

/**
 * Ready-made `useQuery` options. Spread them and add screen-specific options:
 * `useQuery({ ...storefrontQueries.products(brand), initialData })`.
 * Never override `queryFn`: a key must always be filled by the same fetcher.
 */
/**
 * How an order is fulfilled, for the thank-you page. Read with the anonymous
 * client, which RLS gives no access to orders, so this returns null for every
 * shopper and the page uses its URL parameters (bug backlog #19).
 */
export async function fetchOrderConfirmation(orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("fulfillment_method, digital_delivery_channel")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export const storefrontQueries = {
  orderConfirmation: (slug: string, orderId: string) =>
    queryOptions({
      queryKey: storefrontKeys.orderConfirmation(slug, orderId),
      queryFn: () => fetchOrderConfirmation(orderId),
      enabled: Boolean(orderId),
    }),
  products: (brand: StorefrontBrandRef) =>
    queryOptions({
      queryKey: storefrontKeys.products(brand.slug),
      queryFn: () => fetchStorefrontProducts(brand.id),
      ...CATALOG_CACHE,
    }),

  /** `alternateIds` must derive from `productId` (they are not part of the key). */
  product: (brand: StorefrontBrandRef, productId: string, alternateIds: readonly string[] = []) =>
    queryOptions({
      queryKey: storefrontKeys.product(brand.slug, productId),
      queryFn: () => fetchProductDetail(brand.id, productId, alternateIds),
      ...CATALOG_CACHE,
    }),

  recommendations: (brand: StorefrontBrandRef) =>
    queryOptions({
      queryKey: storefrontKeys.recommendations(brand.slug),
      queryFn: () => fetchRecommendationCatalog(brand.id),
      ...CATALOG_CACHE,
    }),

  productsByIds: (
    brand: StorefrontBrandRef,
    list: "wishlist" | "recently-viewed",
    ids: readonly string[],
  ) =>
    queryOptions({
      queryKey: storefrontKeys.productsByIds(brand.slug, list, ids),
      queryFn: () => fetchProductsByIds(brand.id, ids),
      staleTime: 5 * 60_000,
    }),

  categories: (brand: StorefrontBrandRef) =>
    queryOptions({
      queryKey: storefrontKeys.categories(brand.slug),
      queryFn: () => fetchStorefrontCategories(brand.id),
      ...CATALOG_CACHE,
    }),

  category: (brand: StorefrontBrandRef, categorySlug: string) =>
    queryOptions({
      queryKey: storefrontKeys.category(brand.slug, categorySlug),
      queryFn: () => fetchCategoryBySlug(brand.id, categorySlug),
      ...CATALOG_CACHE,
    }),

  categoryProducts: (
    brand: StorefrontBrandRef,
    categorySlug: string,
    scope: CategoryProductsScope,
  ) =>
    queryOptions({
      queryKey: storefrontKeys.categoryProducts(brand.slug, categorySlug, categoryScopeKey(scope)),
      queryFn: () => fetchCategoryProducts(brand, scope),
      ...CATALOG_CACHE,
    }),

  bestSellers: (brand: StorefrontBrandRef, limit: number) =>
    queryOptions({
      queryKey: storefrontKeys.bestSellers(brand.slug, limit),
      queryFn: () => fetchBestSellerRows(brand.slug, limit),
      ...CATALOG_CACHE,
    }),

  trending: (brand: StorefrontBrandRef, limit: number) =>
    queryOptions({
      queryKey: storefrontKeys.trending(brand.slug, limit),
      queryFn: () => fetchTrendingRows(brand.slug, limit),
      ...CATALOG_CACHE,
    }),

  search: (brand: StorefrontBrandRef, term: string) =>
    queryOptions({
      queryKey: storefrontKeys.search(brand.slug, term),
      queryFn: () => fetchStorefrontSearch(brand.id, term),
    }),

  quickSearch: (brand: StorefrontBrandRef, term: string, limit: number) =>
    queryOptions({
      queryKey: storefrontKeys.quickSearch(brand.slug, term, limit),
      queryFn: () => fetchQuickSearch(brand.id, term, limit),
      staleTime: 60_000,
    }),

  customizationOptions: (brand: StorefrontBrandRef) =>
    queryOptions({
      queryKey: storefrontKeys.customizationOptions(brand.slug),
      queryFn: () => fetchCustomizationOptions(brand.id),
      staleTime: 5 * 60_000,
    }),
};
