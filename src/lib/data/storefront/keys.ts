/**
 * TanStack Query keys for the public storefront.
 *
 * Rules:
 * - Every key starts with `["storefront", brandSlug]`, so one call refreshes a
 *   whole store after an admin save:
 *   `queryClient.invalidateQueries({ queryKey: storefrontKeys.all(slug) })`.
 * - Every argument that changes the result is part of the key (limits, terms,
 *   id lists). Two queries may share a key only if they run the same fetcher;
 *   use the query options in `queries.ts` rather than building keys by hand.
 */
export const storefrontKeys = {
  all: (slug: string) => ["storefront", slug] as const,

  products: (slug: string) => [...storefrontKeys.all(slug), "products"] as const,
  product: (slug: string, productId: string) =>
    [...storefrontKeys.all(slug), "product", productId] as const,
  recommendations: (slug: string) =>
    [...storefrontKeys.all(slug), "product-recommendations"] as const,
  productsByIds: (slug: string, list: "wishlist" | "recently-viewed", ids: readonly string[]) =>
    [...storefrontKeys.all(slug), list, ids.join(",")] as const,

  categories: (slug: string) => [...storefrontKeys.all(slug), "categories"] as const,
  category: (slug: string, categorySlug: string) =>
    [...storefrontKeys.all(slug), "category", categorySlug] as const,
  categoryProducts: (slug: string, categorySlug: string, scope: string) =>
    [...storefrontKeys.all(slug), "category-products", categorySlug, scope] as const,

  bestSellers: (slug: string, limit: number) =>
    [...storefrontKeys.all(slug), "best-sellers", limit] as const,
  trending: (slug: string, limit: number) =>
    [...storefrontKeys.all(slug), "trending", limit] as const,

  search: (slug: string, term: string) => [...storefrontKeys.all(slug), "search", term] as const,
  quickSearch: (slug: string, term: string, limit: number) =>
    [...storefrontKeys.all(slug), "quick-search", term, limit] as const,

  socialProof: (slug: string, productId: string | undefined) =>
    [...storefrontKeys.all(slug), "social-proof", productId] as const,
  customizationOptions: (slug: string) =>
    [...storefrontKeys.all(slug), "customization-options"] as const,
  pageMeta: (slug: string) => [...storefrontKeys.all(slug), "page-meta"] as const,
};
