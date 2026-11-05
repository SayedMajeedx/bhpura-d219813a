/**
 * The picture on an installed admin's alert (the PWA review of 2026-11-05): the store's own, so an
 * owner of two stores tells them apart at a glance. Its favicon (a square drawn for small sizes),
 * else its logo; only a raster picture on the platform's media host, which the admin's worker also
 * checks (`public/admin-sw.js`). None: the worker shows Boutq's.
 */
export const MEDIA_HOST = "https://media.boutq.store/";

export function alertIcon(
  settings: { favicon_url?: string | null; logo_url?: string | null } | null | undefined,
): string | null {
  for (const raw of [settings?.favicon_url, settings?.logo_url]) {
    const url = raw?.trim() ?? "";
    if (url.startsWith(MEDIA_HOST) && !/\.svg(\?|#|$)/i.test(url) && url.length <= 512) return url;
  }
  return null;
}
