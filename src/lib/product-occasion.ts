/**
 * What a product is worn or given for (`products.occasion`): the editor offers these four, and
 * the storefront shows the product's own and filters by it. The column keeps the Arabic word the
 * editor wrote, so it is the value; a word typed some other way is shown as it was written.
 */
export const OCCASION_CHOICES = [
  { value: "يومي", ar: "يومي", en: "Daily" },
  { value: "سهرة", ar: "سهرة", en: "Evening" },
  { value: "مناسبات", ar: "مناسبات", en: "Occasions" },
  { value: "إطلالة رسمية", ar: "إطلالة رسمية", en: "Formal" },
] as const;

/** A product's occasion in the reader's language; null when it has none. */
export function occasionLabel(value: string | null | undefined, lang: "ar" | "en"): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const known = OCCASION_CHOICES.find((choice) => choice.value === v);
  return known ? known[lang] : v;
}
