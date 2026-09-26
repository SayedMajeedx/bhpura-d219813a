/**
 * Which workspace the admin shell shows: the super admin's platform
 * workspace, or one brand. The rules the app shell (header, navigation,
 * breadcrumbs) applies.
 */

/**
 * Platform mode is a super admin outside `/admin/b/:slug`: no tenant, so their
 * own profile brand never leaks into it. Otherwise the brand in the URL wins;
 * a brand member without one falls back to their own brand.
 */
export function resolveWorkspace(args: {
  urlSlug: string | null;
  isSuperAdmin: boolean;
  profileBrandSlug: string | null | undefined;
}) {
  const isPlatformMode = args.isSuperAdmin && !args.urlSlug;
  const activeSlug = args.urlSlug ?? (args.isSuperAdmin ? null : (args.profileBrandSlug ?? null));
  return { isPlatformMode, activeSlug };
}

/**
 * The brand record for the active slug: from the brand list when it has it
 * (slugs compared case-insensitively), else the profile's own brand, but only
 * when that is the brand in the URL (never another tenant's).
 */
export function pickActiveBrand<
  Listed extends { slug: string },
  Own extends { slug?: string | null },
>(args: {
  isPlatformMode: boolean;
  activeSlug: string | null;
  brands: Listed[] | undefined;
  profileBrand: Own | null | undefined;
}): Listed | Own | undefined {
  if (args.isPlatformMode) return undefined;
  const slug = args.activeSlug?.toLowerCase();
  const listed = slug ? args.brands?.find((brand) => brand.slug.toLowerCase() === slug) : undefined;
  if (listed) return listed;
  const ownMatches = !slug || args.profileBrand?.slug?.toLowerCase() === slug;
  return ownMatches ? (args.profileBrand ?? undefined) : undefined;
}

/**
 * The header's brand name: the brand's name in the UI language (English as
 * fallback), else its slug, else "Boutq Platform" in platform mode or the
 * app title.
 */
export function workspaceLabel(args: {
  brand: { name_en?: string | null; name_ar?: string | null } | undefined;
  activeSlug: string | null;
  isPlatformMode: boolean;
  lang: "ar" | "en";
  appTitle: string;
}) {
  const { brand, lang } = args;
  return (
    (lang === "ar" ? brand?.name_ar : brand?.name_en) ??
    brand?.name_en ??
    args.activeSlug ??
    (args.isPlatformMode ? (lang === "ar" ? "إدارة منصة بوتيك" : "Boutq Platform") : args.appTitle)
  );
}
