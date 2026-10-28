import { countOf } from "@/lib/arabic-count";

/**
 * What a promo code is for, in a few words, or null when it reaches every line. The database
 * works out which lines a code reaches (`validate_promo_code`: a line counts when its product is
 * chosen or its category is); this is only how the Discounts list says so.
 */
export function promoScopeText(
  promo: { product_ids?: readonly string[] | null; category_slugs?: readonly string[] | null },
  lang: "ar" | "en",
): string | null {
  const products = promo.product_ids?.length ?? 0;
  const categories = promo.category_slugs?.length ?? 0;
  if (products === 0 && categories === 0) return null;
  const parts = [
    products > 0 ? countOf(products, "product", lang) : null,
    categories > 0 ? countOf(categories, "category", lang) : null,
  ].filter(Boolean);
  const joined = parts.join(lang === "ar" ? " و" : " and ");
  return lang === "ar" ? `لـ ${joined} محددة` : `For ${joined} chosen`;
}
