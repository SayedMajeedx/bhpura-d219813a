import { hasAvailableStock, type ProductRow, type StorefrontCategory } from "@/lib/data/storefront";
import type { PublicSettings } from "@/lib/storefront-context";

/**
 * The home page's product rules: available products first, the four rails
 * (new, best sellers, sale, trending), the grid filtered by the chosen
 * category or collection, and the backgrounds that join the promo cards and
 * the product grid to the editorial sections next to them.
 */

type RankingRows = ReadonlyArray<{ product_id: string }> | undefined;

/** Every category below `catId`, breadth first. */
export function getDescendantCategories(catId: string, categories: any[]): any[] {
  const descendants: any[] = [];
  const queue = categories.filter((c) => c.parent_id === catId);
  while (queue.length > 0) {
    const current = queue.shift()!;
    descendants.push(current);
    const children = categories.filter((c) => c.parent_id === current.id);
    queue.push(...children);
  }
  return descendants;
}

/** In-stock products first, keeping the original order otherwise. */
export function availableFirst(products: ProductRow[]): ProductRow[] {
  return products
    .map((product, index) => ({ product, index }))
    .sort(
      (a, b) =>
        Number(hasAvailableStock(b.product)) - Number(hasAvailableStock(a.product)) ||
        a.index - b.index,
    )
    .map(({ product }) => product);
}

/** Up to 8 products for each rail: newest, best sellers and trending by rank, and on sale. */
export function homeMerchandising(
  products: ProductRow[],
  bestSellerRows: RankingRows,
  trendingRows: RankingRows,
) {
  const list = availableFirst(products);

  // 1. New Arrivals
  const newestList = list.slice(0, 8);

  // 2. Best Sellers (mapped to RPC best sellers)
  const bestIds = new Map(
    (bestSellerRows ?? []).map((row: any, index: number) => [String(row.product_id), index]),
  );
  const bestSellersList = list
    .filter((p) => bestIds.has(p.id))
    .sort(
      (a, b) =>
        Number(hasAvailableStock(b)) - Number(hasAvailableStock(a)) ||
        ((bestIds.get(a.id) as number) ?? 99) - ((bestIds.get(b.id) as number) ?? 99),
    )
    .slice(0, 8);

  // 3. Sale (where original_price > selling_price)
  const saleList = list
    .filter((p) =>
      p.product_variants.some((v) => Number(v.original_price || 0) > Number(v.selling_price || 0)),
    )
    .slice(0, 8);

  // 4. Trending Now (mapped to RPC trending)
  const trendingIds = new Map<string, number>(
    (trendingRows ?? []).map((row: any, index: number) => [String(row.product_id), index]),
  );
  const trendingList = list
    .filter((p) => trendingIds.has(p.id))
    .sort(
      (a, b) =>
        Number(hasAvailableStock(b)) - Number(hasAvailableStock(a)) ||
        ((trendingIds.get(a.id) as number) ?? 99) - ((trendingIds.get(b.id) as number) ?? 99),
    )
    .slice(0, 8);

  return {
    newest: newestList,
    bestSellers: bestSellersList,
    saleProducts: saleList,
    trending: trendingList,
  };
}

/**
 * The product grid for the chosen category: the "new" (30 days), "best
 * sellers" and "sale" collections by slug, else the category and all its
 * sub-categories, else products whose category matches the slug.
 */
export function homeGridProducts({
  products,
  activeCategorySlugs,
  categories,
  bestSellerRows,
  now,
}: {
  products: ProductRow[];
  activeCategorySlugs: string[];
  categories: StorefrontCategory[];
  bestSellerRows: RankingRows;
  now: number;
}): ProductRow[] {
  const list = availableFirst(products);
  if (activeCategorySlugs.length > 0) {
    const activeCatSlug = activeCategorySlugs[0];
    const catSlug = activeCatSlug.toLowerCase().replace(/\s+/g, "-");
    const isNew = ["new-arrivals", "new"].includes(catSlug);
    const isBest = ["most-selling", "best-sellers", "best-selling"].includes(catSlug);
    const isSale = ["offers", "sale", "discounts"].includes(catSlug);

    if (isNew) {
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      return list.filter((p) => {
        const createdAt = p.created_at ? new Date(p.created_at).getTime() : 0;
        return createdAt >= thirtyDaysAgo;
      });
    }
    if (isBest) {
      const bestIds = new Map(
        (bestSellerRows ?? []).map((row: any, index: number) => [String(row.product_id), index]),
      );
      return list
        .filter((p) => bestIds.has(p.id))
        .sort(
          (a, b) =>
            Number(hasAvailableStock(b)) - Number(hasAvailableStock(a)) ||
            ((bestIds.get(a.id) as number) ?? 99) - ((bestIds.get(b.id) as number) ?? 99),
        );
    }
    if (isSale) {
      return list.filter((p) =>
        p.product_variants.some(
          (v) => Number(v.original_price || 0) > Number(v.selling_price || 0),
        ),
      );
    }

    // Filter recursively by the leaf selection (deepest active level)
    const leafSlug = activeCategorySlugs[activeCategorySlugs.length - 1];
    const activeCategoryItem = categories.find(
      (c) => c.slug === leafSlug || c.name_en === leafSlug,
    );

    if (activeCategoryItem) {
      const descendants = getDescendantCategories(activeCategoryItem.id, categories);
      const matchSlugs = new Set([
        leafSlug.toLowerCase().replace(/\s+/g, "-"),
        ...descendants.map((c) => c.slug?.toLowerCase()).filter(Boolean),
        ...descendants.map((c) => c.name_en?.toLowerCase()).filter(Boolean),
      ]);
      return list.filter((p) => {
        const pCat = p.category?.toLowerCase();
        return pCat && matchSlugs.has(pCat);
      });
    }

    const leafSlugNormalised = leafSlug.toLowerCase().replace(/\s+/g, "-");
    return list.filter(
      (p) => p.category === leafSlug || p.category?.toLowerCase() === leafSlugNormalised,
    );
  }
  return list;
}

/**
 * The grid continues the colour of the last visible editorial rail, and the
 * promo area takes the colour of the first one (only when no category is
 * chosen, since the rails are hidden then).
 */
export function homeSectionBackgrounds({
  editorialSections,
  bestSellers,
  saleProducts,
  trending,
  activeCat,
}: {
  editorialSections: PublicSettings["homepage_editorial_sections"];
  bestSellers: readonly unknown[];
  saleProducts: readonly unknown[];
  trending: readonly unknown[];
  activeCat: string | null;
}): { productsAreaBackground: string; promoAreaBackground: string } {
  const trailingBackgroundColor = (
    [
      ["trending", trending],
      ["sale", saleProducts],
      ["best", bestSellers],
    ] as const
  ).find(
    ([kind, sectionProducts]) => editorialSections[kind].enabled && sectionProducts.length > 0,
  )?.[0];
  const productsAreaBackground = trailingBackgroundColor
    ? editorialSections[trailingBackgroundColor].background_color || "var(--sf-background)"
    : "var(--sf-background)";
  const leadingEditorialKind = (
    [
      ["best", bestSellers],
      ["sale", saleProducts],
      ["trending", trending],
    ] as const
  ).find(
    ([kind, sectionProducts]) => editorialSections[kind].enabled && sectionProducts.length > 0,
  )?.[0];
  const promoAreaBackground =
    !activeCat && leadingEditorialKind
      ? editorialSections[leadingEditorialKind].background_color || "var(--sf-background)"
      : "var(--sf-background)";
  return { productsAreaBackground, promoAreaBackground };
}
