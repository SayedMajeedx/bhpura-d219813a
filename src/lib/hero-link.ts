/**
 * Where a hero slide's button goes. A slide's link may point at a section of the shop's home page
 * (`#products`, the default a new slide was given), which a services store's home page
 * (`ServicesHome`) does not have: the button did nothing there (Aurora's live hero, 2026-10-26). On
 * a services store such a link, or none, goes to the booking page; any other link is the store's.
 */

/** Sections only the shop's home page has. */
const SHOP_SECTIONS = new Set(["#products"]);

/** A services store's booking page. */
export const bookingPageHref = (slug: string) => `/${slug}/book`;

export function heroButtonHref(
  href: string | null | undefined,
  store: { slug: string; servicesStore: boolean },
): string {
  const target = href?.trim() || "#products";
  if (store.servicesStore && SHOP_SECTIONS.has(target)) return bookingPageHref(store.slug);
  return target;
}

/** A new slide's button: "Book now" to the booking page on a services store, else "Shop now". */
export function newSlideButton(bookingHref: string | null | undefined) {
  return bookingHref
    ? { button_en: "Book now", button_ar: "احجز الآن", button_href: bookingHref }
    : { button_en: "Shop now", button_ar: "تسوّق الآن", button_href: "#products" };
}
