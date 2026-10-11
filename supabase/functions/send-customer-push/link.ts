/**
 * The page a customer's notification opens, as a full address.
 *
 * An event carries its link: a full address (an order update's account page, a campaign's
 * store) or, for older events, a path. A path, or no link at all, resolves against the store
 * the event belongs to, never against one fixed store: the sender once sent every store's
 * customer to Pura's site.
 */

const PLATFORM_HOME = "https://boutq.store";

/** A store's own address on the platform; the platform's when the store is not known. */
export function storeHome(slug: string | null | undefined): string {
  const clean = String(slug ?? "")
    .trim()
    .toLowerCase();
  return /^[a-z0-9][a-z0-9-]*$/.test(clean) ? `https://${clean}.boutq.store` : PLATFORM_HOME;
}

export function notificationUrl(
  targetUrl: string | null | undefined,
  slug: string | null | undefined,
): string {
  const home = storeHome(slug);
  const target = String(targetUrl ?? "").trim();
  if (!target) return home;
  try {
    const url = new URL(target, home);
    return url.protocol === "https:" ? url.toString() : home;
  } catch {
    return home;
  }
}
