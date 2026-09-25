import { createFileRoute, notFound } from "@tanstack/react-router";
import React from "react";
import { StorefrontProvider, type Brand, type PublicSettings } from "@/lib/storefront-context";
import { StorefrontSuspended } from "@/components/storefront/StorefrontSuspended";
import { useDynamicFavicon } from "@/lib/favicon";
import { isReservedStorefrontSlug } from "@/lib/seo/reserved-slugs";
import { fetchStorefrontPageData } from "@/lib/data/storefront";
import { resolveInitialLang } from "@/features/storefront-shell/lib/initial-lang";
import {
  heroConfigFrom,
  publicSettingsFromPageData,
} from "@/features/storefront-shell/lib/public-settings";
import { storefrontHead } from "@/features/storefront-shell/lib/storefront-head";
import { StoreShell } from "@/features/storefront-shell/components/StoreShell";
import { StorefrontError } from "@/features/storefront-shell/components/StorefrontError";

export const Route = createFileRoute("/$slug")({
  staleTime: 10_000,
  preloadStaleTime: 10_000,
  headers: () => ({
    "Cache-Control": "public, max-age=0, s-maxage=10, must-revalidate",
  }),
  loader: async ({ params, location }) => {
    // File-like or platform paths (robots.txt, favicon.ico, .well-known, …) are
    // never brands: fail fast instead of a database round-trip + SSR error page.
    if (isReservedStorefrontSlug(params.slug)) throw notFound();

    const initialLang = await resolveInitialLang(params.slug, location?.search);

    const pageData = await fetchStorefrontPageData(params.slug).catch(() => null);
    if (!pageData?.brand) throw notFound();

    const brand = pageData.brand as unknown as Brand;
    if (pageData.is_suspended) {
      return {
        brand: brand as unknown as Brand,
        settings: { business_name: brand.name_ar || brand.name_en } as unknown as PublicSettings,
        bootstrapData: pageData,
        isSuspended: true,
        suspensionReason: pageData.suspension_reason || "trial_expired",
        initialLang,
      };
    }

    const safeSettings = publicSettingsFromPageData(brand, pageData);

    const heroConfig = heroConfigFrom(brand.hero_media);
    return {
      brand: { ...brand, hero_media: heroConfig } as unknown as Brand,
      settings: safeSettings,
      bootstrapData: pageData,
      initialLang,
    };
  },
  head: ({ loaderData }) => storefrontHead(loaderData),
  component: StorefrontLayout,
  errorComponent: StorefrontError,
  notFoundComponent: () => <StorefrontError />,
});

function StorefrontLayout() {
  const loaderData = Route.useLoaderData() as any;
  const { brand, settings, bootstrapData, isSuspended, suspensionReason, initialLang } = loaderData;

  // Must run unconditionally, before the early return below — React hooks
  // can't be called conditionally. It safely handles undefined inputs.
  useDynamicFavicon(settings?.favicon_url, settings?.logo_url ?? brand.logo_url);

  if (isSuspended) {
    return <StorefrontSuspended brand={brand} suspensionReason={suspensionReason} />;
  }

  return (
    <StorefrontProvider
      brand={brand}
      settings={settings}
      initialLang={initialLang}
      sizeGuides={bootstrapData?.size_guides ?? []}
      addons={bootstrapData?.addons ?? []}
    >
      <StoreShell />
    </StorefrontProvider>
  );
}

// Modularized storefront components
import { StorefrontMenu } from "@/components/storefront/StorefrontNavigation";
import { CartDrawer } from "@/components/storefront/StorefrontCartDrawer";

export { StorefrontMenu, CartDrawer };
