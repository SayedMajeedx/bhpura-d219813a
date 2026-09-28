import { normalizeVertical, type StoreVertical } from "@/lib/store-profile";

/**
 * Which animated templates suit each kind of store, best first. Every store
 * still sees every template; this only orders them and marks the first few
 * as suggested, so an abaya store starts from Atelier Reveal and Swatch Run
 * and a roastery from its roasts and offers.
 */
const BEST_FIRST: Record<StoreVertical, readonly string[]> = {
  abayas: ["atelier-reveal", "swatch-run", "detail-zoom", "lookbook-carousel", "editorial-cover"],
  fashion: ["atelier-reveal", "lookbook-carousel", "swatch-run", "editorial-cover", "detail-zoom"],
  jewelry: ["detail-zoom", "editorial-cover", "atelier-reveal", "lookbook-carousel"],
  beauty: ["atelier-reveal", "swatch-run", "detail-zoom", "price-drop"],
  coffee: ["swatch-run", "price-drop", "occasion-pack", "lookbook-carousel"],
  food: ["price-drop", "occasion-pack", "lookbook-carousel", "atelier-reveal"],
  gifts: ["occasion-pack", "lookbook-carousel", "price-drop", "atelier-reveal"],
  home: ["lookbook-carousel", "detail-zoom", "editorial-cover", "swatch-run"],
  electronics: ["price-drop", "detail-zoom", "swatch-run", "lookbook-carousel"],
  print: ["lookbook-carousel", "price-drop", "occasion-pack", "atelier-reveal"],
  digital: ["price-drop", "editorial-cover", "occasion-pack"],
  general: ["atelier-reveal", "price-drop", "lookbook-carousel", "occasion-pack"],
};

/** How many of a store's best templates are marked as suggested. */
export const SUGGESTED_COUNT = 3;

/**
 * The templates in the order to show them for a store of `vertical` (any
 * value; unknown ones are treated as a general store), with the first few
 * marked. Templates the list does not name keep their own order after it.
 */
export function templatesForStore<T extends { id: string }>(
  templates: readonly T[],
  vertical: unknown,
): Array<T & { suggested: boolean }> {
  const best = BEST_FIRST[normalizeVertical(vertical)];
  const rank = (id: string) => {
    const index = best.indexOf(id);
    return index < 0 ? best.length : index;
  };
  const suggested = new Set(best.slice(0, SUGGESTED_COUNT));
  return templates
    .map((template, index) => ({ template, index }))
    .sort((a, b) => rank(a.template.id) - rank(b.template.id) || a.index - b.index)
    .map(({ template }) => ({ ...template, suggested: suggested.has(template.id) }));
}
