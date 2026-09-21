/**
 * Paths under `/` that are never a brand slug. Shared by the storefront route
 * loader (client + SSR) and the Worker fast paths, so a crawler probe such as
 * /robots.txt or /favicon.ico never triggers a brand lookup.
 */
const RESERVED = new Set([
  "admin",
  "api",
  "assets",
  "fonts",
  "invoice",
  "brands",
  "app-builds",
  "mobile-releases",
]);

export function isReservedStorefrontSlug(slug: string): boolean {
  if (!slug) return true;
  if (slug.startsWith(".")) return true; // .well-known, dotfiles
  if (/\.[a-z0-9]{1,8}$/i.test(slug)) return true; // robots.txt, sitemap.xml, favicon.ico, …
  return RESERVED.has(slug.toLowerCase());
}
