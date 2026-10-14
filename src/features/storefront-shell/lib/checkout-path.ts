/**
 * Whether a storefront address is its checkout (`/<store>/checkout`), where the
 * shell leaves out what would pull the shopper away from paying: the footer and
 * the floating WhatsApp button.
 */
export function isCheckoutPath(pathname: string): boolean {
  return /\/checkout\/?$/.test(pathname);
}
