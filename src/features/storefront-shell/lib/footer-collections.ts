import { smartKindOf } from "@/lib/smart-categories";

type CategoryRow = {
  slug: string;
  name_en: string | null;
  name_ar: string | null;
  parent_id?: string | null;
};

export type FooterCollection = {
  /** The category's own address, as the header menu links it. */
  slug: string;
  /** The store's own name for it, in the reader's language. */
  name: string;
  /** "Sale" is drawn in bold, as in the header. */
  sale: boolean;
};

/**
 * The newest pieces and the sale in the footer's Shop column: the store's own categories of those
 * kinds, as the header menu shows them. A category the store paused is not in the list the
 * storefront reads (`is_active`), so its link leaves the footer with it: the footer once wrote
 * "New arrivals" and "Sale" for every store, and Pura's paused sale stayed in its footer.
 */
/** The slug says it (`smartKindOf`), else the store's own names, as the header marks its sale. */
function kindOf(c: CategoryRow): "new" | "offers" | null {
  const kind = smartKindOf(c.slug);
  if (kind === "new" || kind === "offers") return kind;
  if (kind) return null;
  const words = `${c.name_en ?? ""} ${c.name_ar ?? ""}`;
  if (/\b(sale|offers?|discounts?)\b|تنزيل|عروض|تخفيض/i.test(words)) return "offers";
  if (/\bnew\b|وصل حديث|الجديد/i.test(words)) return "new";
  return null;
}

export function footerCollections(
  categories: readonly CategoryRow[],
  isAr: boolean,
): FooterCollection[] {
  const pick = (kind: "new" | "offers") =>
    categories.find((c) => !c.parent_id && kindOf(c) === kind);
  return (["new", "offers"] as const).flatMap((kind) => {
    const category = pick(kind);
    if (!category) return [];
    const name =
      (isAr ? category.name_ar || category.name_en : category.name_en || category.name_ar) ?? "";
    return [{ slug: category.slug, name, sale: kind === "offers" }];
  });
}
