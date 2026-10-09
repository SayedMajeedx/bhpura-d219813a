/**
 * The home page's chosen category path (a category, then a sub-category, and so on) as it is
 * kept in the address: `?cat=abayas,evening`. Keeping it there makes the logo, a link to the
 * home page and the browser's back button all work, because the page reads its filter from the
 * address instead of from state of its own.
 */

/** The category path in the address, or none for the unfiltered home page. */
export function parseCategoryPath(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((part) => {
      try {
        return decodeURIComponent(part).trim();
      } catch {
        return part.trim();
      }
    })
    .filter(Boolean);
}

/** The `cat` value for a path (undefined for none, so the address stays clean). */
export function categoryPathParam(path: readonly string[]): string | undefined {
  const parts = path.map((slug) => slug.trim()).filter(Boolean);
  return parts.length > 0 ? parts.map(encodeURIComponent).join(",") : undefined;
}
