/**
 * Single source of truth for constructing public storefront URLs across Boutq OS.
 * Follows the canonical rule:
 * - Production: https://${slug}.boutq.store${path}
 * - Localhost / Development: /${slug}${path}
 * - Custom domain (if configured and in production): https://${customDomain}${path}
 */
export function getStorefrontUrl(
  brandOrSlug: string | { slug: string; custom_domain?: string | null } | null | undefined,
  path = "",
): string {
  if (!brandOrSlug) return "/";

  const slug = typeof brandOrSlug === "string" ? brandOrSlug : brandOrSlug.slug || "";
  const customDomain = typeof brandOrSlug === "object" ? brandOrSlug.custom_domain : null;

  const cleanSlug = slug.trim().toLowerCase();
  const normalizedPath = path ? (path.startsWith("/") ? path : `/${path}`) : "";

  if (
    typeof window !== "undefined" &&
    (window.location.hostname.toLowerCase() === "localhost" ||
      window.location.hostname.toLowerCase() === "127.0.0.1")
  ) {
    return `/${cleanSlug}${normalizedPath}`;
  }

  if (customDomain && customDomain.trim()) {
    return `https://${customDomain.trim()}${normalizedPath}`;
  }

  return `https://${cleanSlug}.boutq.store${normalizedPath}`;
}
