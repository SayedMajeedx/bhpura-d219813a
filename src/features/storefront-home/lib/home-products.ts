import { hasAvailableStock, type ProductRow, type StorefrontCategory } from "@/lib/data/storefront";
import type { PublicSettings } from "@/lib/storefront-context";
import { productOnSale } from "@/lib/product-price";

/**
 * The home page's product rules: available products first, the four rails
 * (new, best sellers, sale, trending; a product in one rail only), the grid filtered by the chosen
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

/** Which rails the page draws: a rail that is not drawn claims no product. */
export type ShownRails = Record<"new" | "best" | "sale" | "trending", boolean>;

const ALL_RAILS: ShownRails = { new: true, best: true, sale: true, trending: true };

/**
 * Which rail keeps a product that two rails would show: a sale first (the store chose it, and
 * it ends), then the best sellers and trending (ranked by orders and visits), then the newest.
 */
const CLAIM_ORDER = ["sale", "best", "trending", "new"] as const;

const RAIL_SIZE = 8;

/**
 * Up to 8 products for each rail: newest, best sellers and trending by rank, and on sale. A
 * product shows in one rail only, the first of `CLAIM_ORDER` that is drawn and wants it: with a
 * small catalogue the rails all drew the same pieces (Pura: 11 products as 22 cards). Each rail
 * still fills up to 8 from its own list, and the grid below is the whole catalogue, untouched.
 * A rail left with nothing is not drawn (`MerchandisingSection`).
 */
export function homeMerchandising(
  products: ProductRow[],
  bestSellerRows: RankingRows,
  trendingRows: RankingRows,
  shown: ShownRails = ALL_RAILS,
) {
  const list = availableFirst(products);
  const ranked = (rows: RankingRows) => {
    const rank = new Map(
      (rows ?? []).map((row: any, index: number) => [String(row.product_id), index]),
    );
    return list
      .filter((p) => rank.has(p.id))
      .sort(
        (a, b) =>
          Number(hasAvailableStock(b)) - Number(hasAvailableStock(a)) ||
          ((rank.get(a.id) as number) ?? 99) - ((rank.get(b.id) as number) ?? 99),
      );
  };

  const candidates = {
    new: list,
    best: ranked(bestSellerRows),
    sale: list.filter(productOnSale),
    trending: ranked(trendingRows),
  };

  const claimed = new Set<string>();
  const rails = { new: [], best: [], sale: [], trending: [] } as Record<
    keyof ShownRails,
    ProductRow[]
  >;
  for (const kind of CLAIM_ORDER) {
    if (!shown[kind]) {
      rails[kind] = candidates[kind].slice(0, RAIL_SIZE);
      continue;
    }
    rails[kind] = candidates[kind].filter((p) => !claimed.has(p.id)).slice(0, RAIL_SIZE);
    for (const p of rails[kind]) claimed.add(p.id);
  }

  return {
    newest: rails.new,
    bestSellers: rails.best,
    saleProducts: rails.sale,
    trending: rails.trending,
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
    if (isSale) return list.filter(productOnSale);

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

type PromoCardFields = {
  image_url?: string | null;
  title_ar?: string | null;
  title_en?: string | null;
};

const filled = (value: unknown) => typeof value === "string" && value.trim().length > 0;

/**
 * The promo cards that show: a card needs a picture or a title. A card with only a link or a
 * colour shows nothing (Pura had four such cards). The settings count cards with the same rule.
 */
export function promoCardsToShow<T extends PromoCardFields>(
  cards: ReadonlyArray<T | null | undefined> | null | undefined,
): T[] {
  return (cards ?? []).filter(
    (card): card is T =>
      Boolean(card) &&
      (filled(card!.image_url) || filled(card!.title_en) || filled(card!.title_ar)),
  );
}

/**
 * Whether the area under the hero (the promo cards and the new arrivals) has anything to show.
 * Its section carries a background and its own padding, so drawn empty it left a bare band
 * between the hero and the next section (Pura: no cards that show, new arrivals off).
 */
export function promoAreaShows({
  cards,
  showNewArrivals,
  newest,
  activeCat,
}: {
  cards: ReadonlyArray<PromoCardFields | null | undefined> | null | undefined;
  showNewArrivals: boolean | null | undefined;
  newest: ReadonlyArray<unknown>;
  activeCat: unknown;
}): boolean {
  if (promoCardsToShow(cards).length > 0) return true;
  // The new arrivals rail shows on the whole shop only, when on and with a product (MerchandisingSection).
  return !activeCat && Boolean(showNewArrivals) && newest.length > 0;
}
