import { productOnSaleOrOffer } from "@/lib/offer-price";
import type { StoreOffer } from "@/lib/offers";
import { NEW_ARRIVALS_WINDOW_MS, smartKindOf, type SmartKind } from "@/lib/smart-categories";

/**
 * The automatic collections a store's menus show only while their page would list something (the
 * owner's request of 2026-11-22: Pura's "تنزيلات" opened a page saying "no products" while nothing
 * was on sale, and "New arrivals" did the same a month after the last new piece). Each is read as
 * its page fills itself, so a link shown is never an empty page and comes back by itself:
 * - Sale: a product on sale or one a live automatic offer lowers (`productOnSaleOrOffer`, the
 *   sale page's own filter);
 * - New arrivals: a product added within `NEW_ARRIVALS_WINDOW_MS` (the page's own window);
 * - Best sellers: the store has best sellers at all (the page lists them);
 * - All products: the store shows a product.
 * A fact not known (the page data or the ranking not loaded) hides nothing.
 */

type CollectionProduct = Parameters<typeof productOnSaleOrOffer>[0] & {
  created_at?: string | null;
};

export type CollectionSource = {
  /** Every active product, as the store's page data holds them; null when not known. */
  products: readonly CollectionProduct[] | null | undefined;
  /** How many best sellers the store has; null when not known. */
  bestSellerCount: number | null | undefined;
  /** The store's live automatic offers (an offer that lowers a price puts it on sale). */
  offers: readonly StoreOffer[] | null | undefined;
  now?: number;
};

/** The automatic collections whose page would list nothing now. */
export function emptyCollections(source: CollectionSource): Set<SmartKind> {
  const empty = new Set<SmartKind>();
  const { products, bestSellerCount, offers } = source;
  if (products) {
    if (products.length === 0) empty.add("all");
    const since = (source.now ?? Date.now()) - NEW_ARRIVALS_WINDOW_MS;
    const isNew = (p: CollectionProduct) =>
      Boolean(p.created_at) && Date.parse(p.created_at as string) >= since;
    if (!products.some(isNew)) empty.add("new");
    if (!products.some((p) => productOnSaleOrOffer(p, offers))) empty.add("offers");
  }
  if (bestSellerCount === 0) empty.add("best");
  return empty;
}

/** The categories without the automatic collections that would be empty; the rest as they are. */
export function shownCategories<T extends { slug?: string | null }>(
  categories: readonly T[],
  empty: ReadonlySet<SmartKind>,
): T[] {
  if (empty.size === 0) return [...categories];
  return categories.filter((category) => {
    const kind = smartKindOf(category.slug);
    return !kind || !empty.has(kind);
  });
}

type Words = { ar: string; en: string };

/**
 * What an automatic collection's page says when it lists nothing (a link shared before, an
 * Instagram bio): why, in its own words, never "this category has no products". Null for a
 * collection with no words of its own.
 */
export function emptyCollectionWords(
  kind: SmartKind | null,
  servicesStore: boolean,
): { title: Words; body: Words } | null {
  const things = servicesStore
    ? { ar: "الخدمات", en: "services" }
    : { ar: "المنتجات", en: "products" };
  if (kind === "offers") {
    return {
      title: { ar: "لا توجد تنزيلات حالياً", en: "Nothing on sale right now" },
      body: {
        ar: `تظهر هنا ${things.ar} المخفّضة حين يبدأ التخفيض. إلى ذلك الحين يمكنك تصفح كل ${things.ar}.`,
        en: `Discounted ${things.en} show here when a sale starts. Until then, you can browse all ${things.en}.`,
      },
    };
  }
  if (kind === "new") {
    return {
      title: {
        ar: servicesStore ? "لا توجد خدمات جديدة حالياً" : "لا توجد منتجات جديدة حالياً",
        en: "Nothing new right now",
      },
      body: {
        ar: `تظهر هنا ${things.ar} المضافة خلال آخر 30 يوماً. يمكنك تصفح كل ${things.ar}.`,
        en: `The ${things.en} added in the last 30 days show here. You can browse all ${things.en}.`,
      },
    };
  }
  if (kind === "best") {
    return {
      title: { ar: "لا توجد قائمة للأكثر مبيعاً بعد", en: "No best sellers yet" },
      body: {
        ar: servicesStore
          ? "تظهر هنا الخدمات الأكثر حجزاً بعد أول الحجوزات. يمكنك تصفح كل الخدمات."
          : "تظهر هنا المنتجات الأكثر طلباً بعد أول الطلبات. يمكنك تصفح كل المنتجات.",
        en: servicesStore
          ? "The most booked services show here after the first bookings. You can browse all services."
          : "The most ordered products show here after the first orders. You can browse all products.",
      },
    };
  }
  return null;
}

/**
 * The line the admin's categories list writes under an automatic collection: when the store shows
 * it, and whether it shows now (`emptyNow` null: not known yet). Null for one always shown.
 */
export function collectionShownNote(
  kind: SmartKind | null,
  emptyNow: boolean | null,
  lang: "ar" | "en",
): string | null {
  const rules: Partial<Record<SmartKind, { rule: Words; hidden: Words }>> = {
    offers: {
      rule: {
        ar: "يظهر في المتجر ما دام فيه منتج مخفّض",
        en: "Shown on the store while something is on sale",
      },
      hidden: { ar: "مخفي الآن: لا منتجات مخفّضة", en: "Hidden now: nothing on sale" },
    },
    new: {
      rule: {
        ar: "يظهر في المتجر ما دام فيه منتج أُضيف خلال آخر 30 يوماً",
        en: "Shown on the store while something was added in the last 30 days",
      },
      hidden: { ar: "مخفي الآن: لا منتجات جديدة", en: "Hidden now: nothing new" },
    },
    best: {
      rule: {
        ar: "يظهر في المتجر بعد أول المبيعات",
        en: "Shown on the store once something has sold",
      },
      hidden: { ar: "مخفي الآن: لا مبيعات بعد", en: "Hidden now: no sales yet" },
    },
  };
  const words = kind ? rules[kind] : undefined;
  if (!words) return null;
  const state =
    emptyNow === null
      ? null
      : emptyNow
        ? words.hidden[lang]
        : lang === "ar"
          ? "ظاهر الآن"
          : "Shown now";
  return state ? `${words.rule[lang]} · ${state}` : words.rule[lang];
}
