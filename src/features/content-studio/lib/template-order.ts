import { normalizeVertical, type StoreVertical } from "@/lib/store-profile";

/**
 * Which animated templates suit each kind of store, best first. Every store
 * still sees every template; this only orders them and marks the first few
 * as suggested, so an abaya store starts from Atelier Reveal and Swatch Run
 * and a roastery from its roasts and offers.
 */
const BEST_FIRST: Record<StoreVertical, readonly string[]> = {
  abayas: [
    "atelier-reveal",
    "reel-cut",
    "swatch-run",
    "detail-zoom",
    "lookbook-carousel",
    "editorial-cover",
  ],
  fashion: [
    "reel-cut",
    "atelier-reveal",
    "lookbook-carousel",
    "swatch-run",
    "editorial-cover",
    "bold-poster",
  ],
  jewelry: ["detail-zoom", "reel-cut", "editorial-cover", "atelier-reveal", "lookbook-carousel"],
  beauty: ["reel-cut", "atelier-reveal", "swatch-run", "bold-poster", "detail-zoom", "price-drop"],
  fragrance: ["atelier-reveal", "reel-cut", "detail-zoom", "occasion-pack", "price-drop"],
  services: ["occasion-pack", "bold-poster", "editorial-cover", "lookbook-carousel", "price-drop"],
  coffee: [
    "bold-poster",
    "swatch-run",
    "price-drop",
    "reel-cut",
    "occasion-pack",
    "lookbook-carousel",
  ],
  food: [
    "bold-poster",
    "price-drop",
    "reel-cut",
    "occasion-pack",
    "lookbook-carousel",
    "atelier-reveal",
  ],
  gifts: [
    "occasion-pack",
    "bold-poster",
    "lookbook-carousel",
    "price-drop",
    "reel-cut",
    "atelier-reveal",
  ],
  home: ["lookbook-carousel", "reel-cut", "detail-zoom", "editorial-cover", "swatch-run"],
  electronics: [
    "bold-poster",
    "price-drop",
    "reel-cut",
    "detail-zoom",
    "swatch-run",
    "lookbook-carousel",
  ],
  print: ["bold-poster", "lookbook-carousel", "price-drop", "occasion-pack", "atelier-reveal"],
  digital: ["bold-poster", "price-drop", "editorial-cover", "occasion-pack"],
  general: [
    "reel-cut",
    "atelier-reveal",
    "bold-poster",
    "price-drop",
    "lookbook-carousel",
    "occasion-pack",
  ],
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
