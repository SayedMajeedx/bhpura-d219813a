/**
 * How a store's header is laid out on a laptop (the owner's review of 2026-11-15: six labelled
 * buttons of one weight, a large search box and a second row made it read like an app's toolbar).
 *
 * - The logo leads. Search, account, wishlist and bag are icons, named for screen readers, and
 *   the language and currency sit quietly after them.
 * - The menu shares the logo's row when it fits there (`menuFitsOneRow`), from 1280px wide;
 *   otherwise, on a narrower screen and for a store whose logo is centred, it is a row of its own.
 */

/** At most this many top-level links in the logo's row. */
export const ONE_ROW_MAX_LINKS = 6;
/**
 * At most this many characters across their names. At 1280px the row leaves about 700px between
 * the logo and the icons; a link takes about 8px a character and 24px of padding.
 */
export const ONE_ROW_MAX_CHARS = 52;

export function menuFitsOneRow(names: readonly string[], logoCentred: boolean): boolean {
  if (logoCentred || names.length === 0 || names.length > ONE_ROW_MAX_LINKS) return false;
  const chars = names.reduce((sum, name) => sum + name.trim().length, 0);
  return chars <= ONE_ROW_MAX_CHARS;
}

/** Whether a menu link is the page being shown: the category itself or one of its pages. */
export function isCurrentMenuLink(pathname: string, slug: string, category: string): boolean {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // A malformed address is compared as it is.
  }
  const own = `/${slug}/${category}`;
  return path === own || path === `${own}/`;
}
