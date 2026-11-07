/**
 * The platform's own address, written once. Every store's main address is its own subdomain,
 * `<slug>.boutq.store/<slug>` (the address search engines are told, `src/lib/seo/canonical.ts`;
 * `boutq.store/<slug>` redirects to it), and its admin is at `boutq.store/admin/b/<slug>`. The onboarding wizard once handed new merchants
 * `boutq.app` links, a domain that does not answer (`tests/platform-host.test.ts` keeps it out).
 */
import { storefrontBase, storefrontOrigin } from "@/lib/seo/canonical";

export const PLATFORM_HOST = "boutq.store";
export const PLATFORM_ORIGIN = `https://${PLATFORM_HOST}`;

/** A store's public address: `https://pura.boutq.store/pura`. */
export function storeAddress(slug: string): string {
  return storefrontBase({ slug });
}

/**
 * The address of an order's invoice, on the store's own address: a customer reads the store's name
 * in the link, wherever staff sent it from. The admin is on the platform's address, so a link built
 * from the page's own address once read `boutq.store` for every store (the owner's report of
 * 2026-11-07). The email function has its own copy (`supabase/functions/send-order-email`).
 */
export function invoiceAddress(
  store: { slug: string; custom_domain?: string | null },
  token: string,
): string {
  return `${storefrontOrigin(store)}/invoice/${token}`;
}

/** A store's admin address: `https://boutq.store/admin/b/pura`. */
export function adminAddress(slug: string): string {
  return `${PLATFORM_ORIGIN}/admin/b/${slug}`;
}
