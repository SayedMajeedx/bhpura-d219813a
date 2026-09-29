import type { StoreVertical } from "@/lib/store-profile";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DefaultCategorySpec {
  name_ar: string;
  name_en: string;
  slug: string;
  sort_order: number;
}

export const PURA_BRAND_ID = "b2f628c9-cfeb-444b-befe-5dbbb9d5c9e6";

export const DEFAULT_VERTICAL_CATEGORIES: Record<StoreVertical, DefaultCategorySpec[]> = {
  coffee: [
    {
      name_ar: "محاصيل القهوة المختصة",
      name_en: "Specialty Coffee Beans",
      slug: "specialty-beans",
      sort_order: 1,
    },
    {
      name_ar: "أظرف التقطير سريعة التحضير",
      name_en: "Drip Bags",
      slug: "drip-bags",
      sort_order: 2,
    },
    {
      name_ar: "أدوات ومكائن التحضير",
      name_en: "Brewing Tools & Gear",
      slug: "brewing-tools",
      sort_order: 3,
    },
    {
      name_ar: "أكواب وإكسسوارات المحمصة",
      name_en: "Cups & Merchandise",
      slug: "cups-merchandise",
      sort_order: 4,
    },
  ],
  food: [
    { name_ar: "وجبات رئيسية", name_en: "Main Dishes", slug: "main-dishes", sort_order: 1 },
    {
      name_ar: "مقبلات وسلطات",
      name_en: "Appetizers & Salads",
      slug: "appetizers-salads",
      sort_order: 2,
    },
    { name_ar: "مشروبات", name_en: "Beverages", slug: "beverages", sort_order: 3 },
    {
      name_ar: "حلويات ومخبوزات",
      name_en: "Desserts & Bakery",
      slug: "desserts-bakery",
      sort_order: 4,
    },
  ],
  print: [
    {
      name_ar: "أختام شخصية وتجارية",
      name_en: "Personal & Business Stamps",
      slug: "stamps",
      sort_order: 1,
    },
    {
      name_ar: "مطبوعات ورقية وكروت",
      name_en: "Paper Prints & Business Cards",
      slug: "paper-prints",
      sort_order: 2,
    },
    {
      name_ar: "لوحات وبنرات إعلانية",
      name_en: "Signs & Banners",
      slug: "signs-banners",
      sort_order: 3,
    },
  ],
  beauty: [
    { name_ar: "عطور نسائية", name_en: "Women's Perfumes", slug: "women-perfumes", sort_order: 1 },
    { name_ar: "عطور رجالية", name_en: "Men's Perfumes", slug: "men-perfumes", sort_order: 2 },
    { name_ar: "دخون وعود", name_en: "Oud & Incense", slug: "oud-incense", sort_order: 3 },
  ],
  abayas: [
    { name_ar: "عبايات يومية", name_en: "Daily Abayas", slug: "daily-abayas", sort_order: 1 },
    {
      name_ar: "عبايات مناسبات",
      name_en: "Occasion Abayas",
      slug: "occasion-abayas",
      sort_order: 2,
    },
    { name_ar: "طرح ونقابات", name_en: "Scarves & Veils", slug: "scarves-veils", sort_order: 3 },
  ],
  fashion: [
    { name_ar: "فساتين", name_en: "Dresses", slug: "dresses", sort_order: 1 },
    { name_ar: "بلايز وقمصان", name_en: "Tops & Shirts", slug: "tops-shirts", sort_order: 2 },
    { name_ar: "بناطيل وتنانير", name_en: "Pants & Skirts", slug: "pants-skirts", sort_order: 3 },
    {
      name_ar: "إكسسوارات أزياء",
      name_en: "Fashion Accessories",
      slug: "fashion-accessories",
      sort_order: 4,
    },
  ],
  jewelry: [
    { name_ar: "سلاسل وقلادات", name_en: "Necklaces & Pendants", slug: "necklaces", sort_order: 1 },
    { name_ar: "خواتم ودبل", name_en: "Rings & Bands", slug: "rings", sort_order: 2 },
    { name_ar: "أساور وحلي", name_en: "Bracelets & Bangles", slug: "bracelets", sort_order: 3 },
    { name_ar: "أقراط وحلقان", name_en: "Earrings", slug: "earrings", sort_order: 4 },
  ],
  gifts: [
    { name_ar: "باقات وتنسيقات", name_en: "Bouquets & Floral", slug: "bouquets", sort_order: 1 },
    {
      name_ar: "صناديق هدايا فاخرة",
      name_en: "Luxury Gift Boxes",
      slug: "gift-boxes",
      sort_order: 2,
    },
    { name_ar: "توزيعات مناسبات", name_en: "Occasion Favors", slug: "favors", sort_order: 3 },
  ],
  digital: [
    {
      name_ar: "ملفات وقوالب",
      name_en: "Templates & Assets",
      slug: "templates-assets",
      sort_order: 1,
    },
    {
      name_ar: "كتب وأدلة إلكترونية",
      name_en: "E-Books & Guides",
      slug: "ebooks-guides",
      sort_order: 2,
    },
    {
      name_ar: "دورات وتراخيص",
      name_en: "Courses & Licenses",
      slug: "courses-licenses",
      sort_order: 3,
    },
  ],
  home: [
    { name_ar: "ديكور وإكسسوارات", name_en: "Home Decor", slug: "home-decor", sort_order: 1 },
    {
      name_ar: "أثاث ومفروشات",
      name_en: "Furniture & Bedding",
      slug: "furniture-bedding",
      sort_order: 2,
    },
    {
      name_ar: "إضاءة وشموع",
      name_en: "Lighting & Candles",
      slug: "lighting-candles",
      sort_order: 3,
    },
  ],
  electronics: [
    {
      name_ar: "هواتف وأجهزة لوحية",
      name_en: "Phones & Tablets",
      slug: "phones-tablets",
      sort_order: 1,
    },
    {
      name_ar: "سماعات وصوتيات",
      name_en: "Audio & Headphones",
      slug: "audio-headphones",
      sort_order: 2,
    },
    {
      name_ar: "ملحقات وشواحن",
      name_en: "Accessories & Chargers",
      slug: "accessories-chargers",
      sort_order: 3,
    },
  ],
  general: [
    { name_ar: "وصلنا حديثاً", name_en: "New Arrivals", slug: "new-arrivals", sort_order: 1 },
    { name_ar: "الأكثر طلباً", name_en: "Best Sellers", slug: "best-sellers", sort_order: 2 },
  ],
};

export interface SyncVerticalCategoriesOptions {
  db: SupabaseClient;
  brandId: string;
  newVertical: StoreVertical;
  replaceEmptyOldCategories?: boolean;
}

export interface SyncVerticalCategoriesResult {
  skipped: boolean;
  reason?: string;
  insertedCount: number;
  removedCount: number;
}

/**
 * Synchronizes categories when changing a store vertical, or on explicit merchant request.
 * Strictly protects Pura from any automated changes.
 * Safely preserves any category currently associated with products.
 */
export type CategoryRow = {
  id: string;
  slug: string | null;
  name_ar: string | null;
  name_en: string | null;
};

/**
 * What a product's category field may hold (its id, slug or either name),
 * normalised for comparison. A category matched by any of them is in use.
 */
export function categoryKeys(category: CategoryRow): string[] {
  return [category.id, category.slug, category.name_ar, category.name_en]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim().toLowerCase());
}

/**
 * How a store's categories follow a new vertical: the vertical's default
 * categories that are missing are added, and (when asked) categories no
 * product uses that are not the vertical's are removed. A category any
 * product uses is never removed.
 */
export function planCategorySync({
  existing,
  usedKeys,
  targets,
  replaceEmpty,
}: {
  existing: readonly CategoryRow[];
  /** The products' category values, lower-cased and trimmed. */
  usedKeys: ReadonlySet<string>;
  targets: readonly DefaultCategorySpec[];
  replaceEmpty: boolean;
}): { add: DefaultCategorySpec[]; remove: CategoryRow[] } {
  const targetSlugs = new Set(targets.map((target) => target.slug.toLowerCase()));
  const remove = replaceEmpty
    ? existing.filter((category) => {
        const slug = (category.slug ?? "").trim().toLowerCase();
        if (slug && targetSlugs.has(slug)) return false;
        return !categoryKeys(category).some((key) => usedKeys.has(key));
      })
    : [];
  const existingSlugs = new Set(existing.map((category) => (category.slug ?? "").toLowerCase()));
  const add = targets.filter((target) => !existingSlugs.has(target.slug.toLowerCase()));
  return { add, remove };
}

export async function syncBrandVerticalCategories({
  db,
  brandId,
  newVertical,
  replaceEmptyOldCategories = true,
}: SyncVerticalCategoriesOptions): Promise<SyncVerticalCategoriesResult> {
  // CRITICAL SAFEGUARD: Never mutate brand Pura
  if (brandId === PURA_BRAND_ID) {
    return {
      skipped: true,
      reason: "pura_protected",
      insertedCount: 0,
      removedCount: 0,
    };
  }

  const targets = DEFAULT_VERTICAL_CATEGORIES[newVertical] || DEFAULT_VERTICAL_CATEGORIES.general;

  // 1. Fetch current categories
  const { data: currentCategories, error: catErr } = await db
    .from("categories")
    .select("id, slug, name_ar, name_en")
    .eq("brand_id", brandId);

  if (catErr) throw catErr;

  const existingCats = currentCategories || [];

  // 2. Fetch products to determine which categories are in active use
  const { data: prods, error: prodErr } = await db
    .from("products")
    .select("category")
    .eq("brand_id", brandId)
    .not("category", "is", null);

  if (prodErr) throw prodErr;

  const usedCategoryIdentifiers = new Set<string>();
  for (const p of prods || []) {
    if (p.category) {
      usedCategoryIdentifiers.add(String(p.category).trim().toLowerCase());
    }
  }

  const plan = planCategorySync({
    existing: existingCats,
    usedKeys: usedCategoryIdentifiers,
    targets,
    replaceEmpty: replaceEmptyOldCategories,
  });

  let removedCount = 0;
  if (plan.remove.length > 0) {
    const idsToRemove = plan.remove.map((c) => c.id);
    const { error: delErr } = await db
      .from("categories")
      .delete()
      .eq("brand_id", brandId)
      .in("id", idsToRemove);

    if (delErr) throw delErr;
    removedCount = idsToRemove.length;
  }

  // Insert missing target categories for this vertical
  let insertedCount = 0;
  for (const spec of plan.add) {
    const { error: insErr } = await db.from("categories").insert({
      brand_id: brandId,
      name_ar: spec.name_ar,
      name_en: spec.name_en,
      slug: spec.slug,
      sort_order: spec.sort_order,
      is_active: true,
    });

    if (insErr) throw insErr;
    insertedCount++;
  }

  return {
    skipped: false,
    insertedCount,
    removedCount,
  };
}
