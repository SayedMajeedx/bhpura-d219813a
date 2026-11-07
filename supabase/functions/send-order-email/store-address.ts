/**
 * A copy of `invoiceAddress` (`src/lib/platform-host.ts`) for this function (it is deployed on its
 * own); the two are run against each other by `tests/invoice-address.test.ts`.
 */
type Store = { slug?: string | null; custom_domain?: string | null } | null | undefined;

/** The order's invoice on the store's own address; the platform's for an order with no store. */
export function invoiceAddress(store: Store, token: string): string {
  const domain = store?.custom_domain
    ?.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  const slug = store?.slug?.trim().toLowerCase();
  const origin = domain
    ? `https://${domain}`
    : slug
      ? `https://${slug}.boutq.store`
      : "https://boutq.store";
  return `${origin}/invoice/${token}`;
}
