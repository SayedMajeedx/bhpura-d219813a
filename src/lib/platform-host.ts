/**
 * The platform's own address, written once. Every store lives at `boutq.store/<slug>` and its
 * admin at `boutq.store/admin/b/<slug>`. The onboarding wizard once handed new merchants
 * `boutq.app` links, a domain that does not answer (`tests/platform-host.test.ts` keeps it out).
 */
export const PLATFORM_HOST = "boutq.store";
export const PLATFORM_ORIGIN = `https://${PLATFORM_HOST}`;

/** A store's public address: `https://boutq.store/pura`. */
export function storeAddress(slug: string): string {
  return `${PLATFORM_ORIGIN}/${slug}`;
}

/** A store's admin address: `https://boutq.store/admin/b/pura`. */
export function adminAddress(slug: string): string {
  return `${PLATFORM_ORIGIN}/admin/b/${slug}`;
}
