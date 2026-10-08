import type { StorefrontCategory, StorefrontPageData } from "@/lib/data/storefront";

/**
 * What the store's layout route has already loaded, for the pages inside it.
 *
 * The layout calls `get_storefront_page_data` once, and that one answer holds the brand, the
 * settings with the CMS pages, every active category, every active product with its variants and
 * the best sellers. A page inside the store used to ask the database for some of the same things
 * again, each ask a full round trip to a distant database (about a quarter of a second); reading
 * them from the layout's answer costs nothing, and nothing is cached: it is the same fresh read.
 */

export type StoreLayoutData = {
  brand: Record<string, unknown> | null;
  settings: {
    pages?: Array<Record<string, unknown>>;
    favicon_url?: string | null;
    logo_url?: string | null;
  } | null;
  bootstrapData: StorefrontPageData | null;
  isSuspended: boolean;
};

/** The layout's loader data, whatever shape it has (a suspended store carries no catalog). */
export function storeLayoutData(layout: unknown): StoreLayoutData {
  const data = (layout ?? {}) as Partial<StoreLayoutData>;
  return {
    brand: data.brand ?? null,
    settings: data.settings ?? null,
    bootstrapData: data.bootstrapData ?? null,
    isSuspended: Boolean(data.isSuspended),
  };
}

/** The store's active categories as the layout loaded them. */
export function layoutCategories(layout: StoreLayoutData): StorefrontCategory[] {
  return layout.bootstrapData?.categories ?? [];
}

/** One of the store's CMS pages by its slug, or null. */
export function layoutPage(layout: StoreLayoutData, slug: string) {
  return layout.settings?.pages?.find((page) => page?.slug === slug) ?? null;
}
