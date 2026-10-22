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
    "made-for-you",
    "coming-soon",
    "detail-zoom",
    "lookbook-carousel",
    "editorial-cover",
  ],
  fashion: [
    "reel-cut",
    "atelier-reveal",
    "lookbook-carousel",
    "coming-soon",
    "made-for-you",
    "swatch-run",
    "bundle-set",
    "editorial-cover",
    "bold-poster",
  ],
  jewelry: [
    "detail-zoom",
    "reel-cut",
    "editorial-cover",
    "coming-soon",
    "made-for-you",
    "bundle-set",
    "atelier-reveal",
    "lookbook-carousel",
  ],
  beauty: [
    "reel-cut",
    "atelier-reveal",
    "bundle-set",
    "coming-soon",
    "swatch-run",
    "bold-poster",
    "detail-zoom",
    "price-drop",
  ],
  fragrance: [
    "atelier-reveal",
    "reel-cut",
    "bundle-set",
    "coming-soon",
    "made-for-you",
    "detail-zoom",
    "occasion-pack",
    "price-drop",
  ],
  services: [
    "menu-board",
    "occasion-pack",
    "bold-poster",
    "editorial-cover",
    "lookbook-carousel",
    "price-drop",
  ],
  coffee: [
    "menu-board",
    "bold-poster",
    "swatch-run",
    "price-drop",
    "reel-cut",
    "made-for-you",
    "occasion-pack",
  ],
  food: [
    "menu-board",
    "bold-poster",
    "price-drop",
    "bundle-set",
    "reel-cut",
    "made-for-you",
    "occasion-pack",
  ],
  gifts: [
    "bundle-set",
    "occasion-pack",
    "bold-poster",
    "coming-soon",
    "lookbook-carousel",
    "made-for-you",
    "price-drop",
    "reel-cut",
  ],
  home: [
    "lookbook-carousel",
    "reel-cut",
    "bundle-set",
    "coming-soon",
    "detail-zoom",
    "editorial-cover",
    "swatch-run",
  ],
  electronics: ["bold-poster", "price-drop", "reel-cut", "bundle-set", "detail-zoom", "swatch-run"],
  print: [
    "bold-poster",
    "lookbook-carousel",
    "menu-board",
    "price-drop",
    "made-for-you",
    "occasion-pack",
  ],
  digital: ["bold-poster", "price-drop", "menu-board", "editorial-cover", "occasion-pack"],
  general: [
    "reel-cut",
    "atelier-reveal",
    "bold-poster",
    "coming-soon",
    "price-drop",
    "bundle-set",
    "lookbook-carousel",
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
