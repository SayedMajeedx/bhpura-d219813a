import type { Brand, PublicSettings } from "@/lib/storefront-context";
import {
  defaultStorefrontTypography,
  getGoogleFontsUrl,
  normalizeTypography,
  selfHostedFontPreloads,
} from "@/lib/typography";
import { buildOrganizationSchema, buildWebSiteSchema } from "@/lib/seo/structured-data";
import { jsonForScript } from "@/lib/seo/json-for-script";
import { socialImage, storefrontCanonical } from "@/lib/seo/canonical";
import { isServicesProfile, resolveStoreModules } from "@/lib/store-profile";
import { faviconType, resolveBrandFavicon } from "@/lib/favicon";

/**
 * The storefront's <head>: language and direction, title and description
 * (with social cards), favicon and manifest, font preloads (Google fonts are
 * applied by a small script so they never block rendering) and the
 * Organization and WebSite structured data.
 */
export function storefrontHead(loaderData: unknown, options: { home?: boolean } = {}) {
  const typedLoaderData = loaderData as
    { brand?: Brand; settings?: PublicSettings; initialLang?: "ar" | "en" } | undefined;
  const b = typedLoaderData?.brand;
  const settings = typedLoaderData?.settings;
  const lang = typedLoaderData?.initialLang || "ar";
  if (!b) return { meta: [{ title: "Storefront" }] };

  // A store that takes bookings and sells no goods is described as a place to book.
  const modules = resolveStoreModules({
    store_vertical: settings?.store_vertical,
    store_modules: settings?.store_modules,
  });
  const takesBookings = isServicesProfile(modules);
  const nameAr = settings?.business_name || b.name_ar || b.name_en;
  const nameEn = settings?.business_name || b.name_en || b.name_ar;
  const title =
    lang === "ar"
      ? b.meta_title ||
        (takesBookings ? `${nameAr} — احجز موعدك أونلاين` : settings?.business_name) ||
        b.name_ar ||
        `${b.name_en} — متجر إلكتروني`
      : b.meta_title ||
        (takesBookings ? `${nameEn} — Book online` : settings?.business_name) ||
        b.name_en ||
        `${b.name_ar} — Online Store`;
  const desc =
    lang === "ar"
      ? b.meta_description ||
        (takesBookings
          ? `احجز مع ${nameAr} أونلاين: شاهد التواريخ المتاحة وخدماتنا وعروضنا.`
          : `تسوق من ${b.name_ar || b.name_en} أونلاين.`)
      : b.meta_description ||
        (takesBookings
          ? `Book ${nameEn} online: see the free dates, our services and offers.`
          : `Shop ${b.name_en || b.name_ar} online.`);
  const img = socialImage(settings?.logo_url || b.logo_url);
  const favicon = resolveBrandFavicon(settings?.favicon_url, settings?.logo_url ?? b.logo_url);
  const typography = normalizeTypography(
    settings?.storefront_typography,
    defaultStorefrontTypography(),
  );
  const googleFontsUrl = getGoogleFontsUrl(typography);
  const fontPreloads = selfHostedFontPreloads(typography, lang);
  const orgSchema = buildOrganizationSchema(b, settings);
  const webSiteSchema = buildWebSiteSchema(b, settings);

  // The home page says which address is its own (each page below sets its own).
  const homeUrl = storefrontCanonical({
    slug: b.slug,
    custom_domain: (b as { custom_domain?: string | null }).custom_domain,
  });
  const links: Array<Record<string, any>> = [
    ...(options.home ? [{ rel: "canonical", href: homeUrl }] : []),
    {
      rel: "icon",
      href: favicon,
      ...(faviconType(favicon) ? { type: faviconType(favicon) } : {}),
    },
    {
      rel: "manifest",
      href: `/${b.slug}/manifest.webmanifest`,
    },
    // Self-hosted faces for the active language are fetched at high priority
    // alongside the CSS so text renders in the final font on first paint.
    ...fontPreloads.map((href) => ({
      rel: "preload",
      as: "font",
      type: "font/woff2",
      href,
      crossOrigin: "anonymous",
    })),
    // Merchant-selected Google families (rare) are fetched early but applied
    // by the inline script below so the stylesheet never blocks rendering.
    ...(googleFontsUrl
      ? [
          { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
          { rel: "preload", as: "style", href: googleFontsUrl },
        ]
      : []),
  ];

  const scripts: Array<Record<string, any>> = [
    ...(googleFontsUrl
      ? [
          {
            children: `(function(){var l=document.createElement("link");l.rel="stylesheet";l.href=${jsonForScript(googleFontsUrl)};document.head.appendChild(l);})();`,
          },
        ]
      : []),
    {
      type: "application/ld+json",
      children: jsonForScript(orgSchema),
    },
    {
      type: "application/ld+json",
      children: jsonForScript(webSiteSchema),
    },
  ];

  return {
    htmlAttrs: {
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
    },
    meta: [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:type", content: "website" },
      ...(options.home ? [{ property: "og:url", content: homeUrl }] : []),
      { property: "og:image", content: img },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: desc },
      { name: "twitter:image", content: img },
    ],
    links,
    scripts,
  };
}
