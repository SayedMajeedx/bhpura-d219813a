import type { Brand, PublicSettings } from "@/lib/storefront-context";
import {
  defaultStorefrontTypography,
  getGoogleFontsUrl,
  normalizeTypography,
  selfHostedFontPreloads,
} from "@/lib/typography";
import { buildOrganizationSchema, buildWebSiteSchema } from "@/lib/seo/structured-data";
import { faviconType, resolveBrandFavicon } from "@/lib/favicon";

/**
 * The storefront's <head>: language and direction, title and description
 * (with social cards), favicon and manifest, font preloads (Google fonts are
 * applied by a small script so they never block rendering) and the
 * Organization and WebSite structured data.
 */
export function storefrontHead(loaderData: unknown) {
  const typedLoaderData = loaderData as
    { brand?: Brand; settings?: PublicSettings; initialLang?: "ar" | "en" } | undefined;
  const b = typedLoaderData?.brand;
  const settings = typedLoaderData?.settings;
  const lang = typedLoaderData?.initialLang || "ar";
  if (!b) return { meta: [{ title: "Storefront" }] };

  const title =
    lang === "ar"
      ? b.meta_title || settings?.business_name || b.name_ar || `${b.name_en} — متجر إلكتروني`
      : b.meta_title || settings?.business_name || b.name_en || `${b.name_ar} — Online Store`;
  const desc =
    lang === "ar"
      ? b.meta_description || `تسوق من ${b.name_ar || b.name_en} أونلاين.`
      : b.meta_description || `Shop ${b.name_en || b.name_ar} online.`;
  const img = settings?.logo_url || b.logo_url || "https://boutq.store/og-placeholder.png";
  const favicon = resolveBrandFavicon(settings?.favicon_url, settings?.logo_url ?? b.logo_url);
  const typography = normalizeTypography(
    settings?.storefront_typography,
    defaultStorefrontTypography(),
  );
  const googleFontsUrl = getGoogleFontsUrl(typography);
  const fontPreloads = selfHostedFontPreloads(typography, lang);
  const orgSchema = buildOrganizationSchema(b, settings);
  const webSiteSchema = buildWebSiteSchema(b, settings);

  const links: Array<Record<string, any>> = [
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
            children: `(function(){var l=document.createElement("link");l.rel="stylesheet";l.href=${JSON.stringify(googleFontsUrl)};document.head.appendChild(l);})();`,
          },
        ]
      : []),
    {
      type: "application/ld+json",
      children: JSON.stringify(orgSchema),
    },
    {
      type: "application/ld+json",
      children: JSON.stringify(webSiteSchema),
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
