import { translateOptionTerms } from "@/lib/translate-options.functions";

/** Warms the variant-option translation cache for terms the admin just typed. */
export function prefetchOptionTranslations(terms: Array<string | null | undefined>, isAr: boolean) {
  const cleanTerms = Array.from(
    new Set(terms.map((t) => (t || "").trim()).filter((t) => t.length > 0)),
  );
  if (cleanTerms.length === 0) return;

  translateOptionTerms({
    data: {
      terms: cleanTerms,
      from: isAr ? "ar" : "en",
      to: isAr ? "en" : "ar",
    },
  }).catch((err) => console.warn("Failed to prefetch variant translations:", err));
}
