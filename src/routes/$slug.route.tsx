import {
  createFileRoute,
  Outlet,
  Link,
  notFound,
  useNavigate,
  useLocation,
  useRouter,
} from "@tanstack/react-router";
import React, { useEffect, useRef, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { publicSupabase as supabase } from "@/integrations/supabase/client";
import {
  StorefrontProvider,
  useStorefront,
  formatPrice,
  pickName,
  type Brand,
  type PublicSettings,
  readableOn,
} from "@/lib/storefront-context";
import {
  customFontFaces,
  defaultStorefrontTypography,
  normalizeTypography,
  typographyVariables,
} from "@/lib/typography";
import {
  renderTrustBadgeIcon,
  DEFAULT_TRUST_BADGES,
  type TrustBadgesConfig,
} from "@/lib/trust-badges";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StorefrontSuspended } from "@/components/storefront/StorefrontSuspended";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ShoppingBag,
  Languages,
  Minus,
  Plus,
  Trash2,
  X,
  User,
  Search,
  Menu,
  Home,
  PackageSearch,
  FileText,
  LogIn,
  Heart,
  Bell,
  Grid2X2,
  ChevronDown,
  Sparkles,
  Share2,
  Gift,
} from "lucide-react";
import { ShareCartModal } from "@/components/storefront/ShareCartModal";
import { OsEmptyState } from "@/components/os/os-empty-state";
import { Input } from "@/components/ui/input";
import { cloudflareImageUrl } from "@/lib/media-delivery";
import { faviconType, resolveBrandFavicon, useDynamicFavicon } from "@/lib/favicon";
import { StorefrontAnalytics } from "@/components/storefront-analytics";

export const Route = createFileRoute("/$slug")({
  staleTime: 10_000,
  preloadStaleTime: 10_000,
  headers: () => ({
    "Cache-Control": "public, max-age=0, s-maxage=10, must-revalidate",
  }),
  loader: async ({ params }) => {
    const { data: pageData, error } = await (supabase.rpc as any)("get_storefront_page_data", {
      p_brand_slug: params.slug,
    });
    if (error || !pageData || !pageData.brand) throw notFound();

    const brand = pageData.brand;
    if (pageData.is_suspended) {
      return {
        brand: brand as unknown as Brand,
        settings: { business_name: brand.name_ar || brand.name_en } as unknown as PublicSettings,
        bootstrapData: pageData,
        isSuspended: true,
        suspensionReason: pageData.suspension_reason || "trial_expired",
      };
    }

    const settings = pageData.settings ?? {};
    const benefitSettings = pageData.benefitSettings ?? [];
    const trackingSettings = pageData.trackingSettings ?? {};

    const s = settings as any;
    const rawPagesData = s?.pages;
    const rawPages = Array.isArray(rawPagesData)
      ? rawPagesData
      : Array.isArray(rawPagesData?.items)
        ? rawPagesData.items
        : [];
    const footerTitles =
      !Array.isArray(rawPagesData) && typeof rawPagesData === "object" && rawPagesData !== null
        ? rawPagesData.footer_titles
        : null;

    const normalizedPages = rawPages.map((p: any, index: number) => ({
      slug: p?.slug ?? `page-${index + 1}`,
      title_ar: p?.title_ar ?? null,
      title_en: p?.title_en ?? null,
      content_ar: p?.content_ar ?? null,
      content_en: p?.content_en ?? null,
      image_url: p?.image_url ?? null,
      menu_icon_url: p?.menu_icon_url ?? null,
      image_position: p?.image_position === "bottom" ? "bottom" : "top",
      meta_title: p?.meta_title ?? null,
      meta_description: p?.meta_description ?? null,
      group: p?.group === "company" ? "company" : "help",
    }));
    const rawSocials = Array.isArray(s?.socials) ? s.socials : [];
    const normalizedSocials = rawSocials
      .map((x: any) => ({ name: String(x?.name ?? "").trim(), url: String(x?.url ?? "").trim() }))
      .filter((x: { name: string; url: string }) => x.name && x.url);
    const rawEditorialSections =
      s?.homepage_editorial_sections && typeof s.homepage_editorial_sections === "object"
        ? s.homepage_editorial_sections
        : {};
    const editorialSection = (key: "best" | "sale" | "trending", enabled: boolean) => ({
      enabled: rawEditorialSections[key]?.enabled ?? enabled,
      banner_image_url:
        rawEditorialSections[key]?.banner_image_url ??
        (key === "trending" ? s?.trending_banner_background_url : null) ??
        "",
      background_color: rawEditorialSections[key]?.background_color ?? "",
      background_image_url: rawEditorialSections[key]?.background_image_url ?? "",
    });
    const legacyTypography = defaultStorefrontTypography();
    legacyTypography.body.en = {
      family: s?.storefront_font_en ?? "Inter",
      url: s?.storefront_font_en_url ?? null,
    };
    legacyTypography.body.ar = {
      family: s?.storefront_font_ar ?? "Tajawal",
      url: s?.storefront_font_ar_url ?? null,
    };
    const storefrontTypography = normalizeTypography(s?.storefront_typography, legacyTypography);
    if (s?.storefront_font_ar) {
      storefrontTypography.body.ar = {
        family: s.storefront_font_ar,
        url: s.storefront_font_ar_url ?? null,
      };
      storefrontTypography.display.ar = storefrontTypography.body.ar;
    }
    if (s?.storefront_font_en) {
      storefrontTypography.body.en = {
        family: s.storefront_font_en,
        url: s.storefront_font_en_url ?? null,
      };
      storefrontTypography.display.en = storefrontTypography.body.en;
    }
    const safeSettings: PublicSettings = {
      brand_id: brand.id,
      business_name: s?.business_name ?? brand.name_en,
      logo_url: s?.logo_url ?? brand.logo_url ?? null,
      favicon_url: s?.favicon_url ?? null,
      currency: s?.currency ?? "BHD",
      primary_color: s?.storefront_accent_color ?? brand.primary_color ?? "#3f121a",
      storefront_accent_color: s?.storefront_accent_color ?? brand.primary_color ?? "#3f121a",
      storefront_radius: s?.storefront_radius ?? null,
      header_glass: s?.header_glass ?? true,
      badge_accent: s?.badge_accent ?? "maroon",
      secondary_banner_parallax_enabled: s?.secondary_banner_parallax_enabled ?? false,
      secondary_banner_parallax_mobile_enabled: s?.secondary_banner_parallax_mobile_enabled ?? true,
      secondary_banner_parallax_breakpoint: Number(s?.secondary_banner_parallax_breakpoint ?? 768),
      trending_banner_background_url: s?.trending_banner_background_url ?? null,
      category_banner_background_url: s?.category_banner_background_url ?? null,
      text_color: s?.storefront_text_color ?? "#111111",
      background_color: s?.storefront_background_color ?? "#ffffff",
      cod_enabled: s?.cod_enabled ?? true,
      card_enabled: s?.card_enabled ?? false,
      benefit_enabled: s?.benefit_enabled ?? false,
      benefit_qr_url: s?.benefit_qr_url ?? null,
      benefit_account_number: (benefitSettings as any[])?.[0]?.benefit_account_number ?? null,
      footer_note: s?.footer_note ?? null,
      delivery_enabled: s?.delivery_enabled ?? true,
      pickup_enabled: s?.pickup_enabled ?? true,
      digital_delivery_enabled: s?.digital_delivery_enabled ?? false,
      delivery_fee: Number(s?.delivery_fee ?? 0),
      delivery_estimate_enabled: Boolean(s?.delivery_estimate_enabled ?? true),
      delivery_estimate_ar: s?.delivery_estimate_ar ?? null,
      delivery_estimate_en: s?.delivery_estimate_en ?? null,
      vat_inclusive: Boolean(s?.vat_inclusive ?? false),
      shipping_zones: (() => {
        try {
          const raw = s?.shipping_zones;
          const parsed = Array.isArray(raw) ? raw : JSON.parse(raw || "[]");
          return parsed.map((z: any) => ({
            id: String(z.id || ""),
            name_en: String(z.name_en || ""),
            name_ar: String(z.name_ar || ""),
            fee: Number(z.fee ?? 0),
          }));
        } catch (e) {
          return [];
        }
      })(),
      logo_size: Number(s?.logo_size ?? 48),
      footer_logo_size: Number(s?.footer_logo_size ?? 28),
      logo_align: (s?.logo_align ?? "left") as "left" | "center" | "right",
      show_header_name: s?.show_header_name ?? true,
      show_hero_title: s?.show_hero_title ?? true,
      show_hero_about: s?.show_hero_about ?? true,
      show_footer_name: s?.show_footer_name ?? true,
      storefront_font_en: s?.storefront_font_en ?? "Inter",
      storefront_font_ar: s?.storefront_font_ar ?? "Tajawal",
      storefront_font_en_url: s?.storefront_font_en_url ?? null,
      storefront_font_ar_url: s?.storefront_font_ar_url ?? null,
      storefront_typography: storefrontTypography,
      hero_title_en: s?.hero_title_en ?? null,
      hero_title_ar: s?.hero_title_ar ?? null,
      hero_title_size: Number(s?.hero_title_size ?? 48),
      hero_title_color: s?.hero_title_color ?? null,
      hero_title_align: (s?.hero_title_align ?? "start") as "start" | "center" | "end",
      header_bg: s?.header_bg ?? null,
      header_fg: s?.header_fg ?? null,
      footer_bg: s?.footer_bg ?? null,
      footer_fg: s?.footer_fg ?? null,
      footer_company_title_en: footerTitles?.company_en ?? null,
      footer_company_title_ar: footerTitles?.company_ar ?? null,
      footer_help_title_en: footerTitles?.help_en ?? null,
      footer_help_title_ar: footerTitles?.help_ar ?? null,
      heading_color: s?.heading_color ?? null,
      link_color: s?.link_color ?? null,
      price_color: s?.price_color ?? null,
      product_title_color: s?.product_title_color ?? null,
      btn_primary_bg: s?.btn_primary_bg ?? null,
      btn_primary_fg: s?.btn_primary_fg ?? null,
      btn_secondary_bg: s?.btn_secondary_bg ?? null,
      btn_secondary_fg: s?.btn_secondary_fg ?? null,
      btn_checkout_bg: s?.btn_checkout_bg ?? null,
      btn_checkout_fg: s?.btn_checkout_fg ?? null,
      pages: normalizedPages,
      socials: normalizedSocials,
      whatsapp_enabled: Boolean(s?.whatsapp_enabled),
      whatsapp_number: s?.whatsapp_number ?? null,
      menu_bg: s?.menu_bg ?? null,
      menu_fg: s?.menu_fg ?? null,
      menu_title_en: s?.menu_title_en ?? null,
      menu_title_ar: s?.menu_title_ar ?? null,
      menu_show_home: s?.menu_show_home ?? true,
      menu_show_account: s?.menu_show_account ?? true,
      menu_show_orders: s?.menu_show_orders ?? true,
      menu_show_pages: s?.menu_show_pages ?? true,
      home_promo_cards: Array.isArray(s?.home_promo_cards) ? s.home_promo_cards.slice(0, 4) : [],
      homepage_editorial_sections: {
        best: editorialSection("best", s?.show_best_sellers ?? true),
        sale: editorialSection("sale", true),
        trending: editorialSection("trending", true),
      },
      show_new_arrivals: s?.show_new_arrivals ?? true,
      show_best_sellers: s?.show_best_sellers ?? true,
      new_arrivals_title_en: s?.new_arrivals_title_en ?? null,
      new_arrivals_title_ar: s?.new_arrivals_title_ar ?? null,
      best_sellers_title_en: s?.best_sellers_title_en ?? null,
      best_sellers_title_ar: s?.best_sellers_title_ar ?? null,
      announcement_enabled: s?.announcement_enabled ?? false,
      announcement_text_en: s?.announcement_text_en ?? null,
      announcement_text_ar: s?.announcement_text_ar ?? null,
      announcement_bg: s?.announcement_bg ?? "#111111",
      announcement_fg: s?.announcement_fg ?? "#ffffff",
      announcement_bold: s?.announcement_bold ?? false,
      announcement_italic: s?.announcement_italic ?? false,
      announcement_dismissible: s?.announcement_dismissible ?? true,
      announcement_scope: s?.announcement_scope ?? "all",
      announcement_audience: s?.announcement_audience ?? "all",
      global_sale_badges_enabled: s?.global_sale_badges_enabled ?? true,
      cart_drawer_checkout_bg: s?.cart_drawer_checkout_bg ?? null,
      cart_drawer_checkout_fg: s?.cart_drawer_checkout_fg ?? null,
      google_analytics_enabled: Boolean((trackingSettings as any)?.google_analytics_enabled),
      google_analytics_id: (trackingSettings as any)?.google_analytics_id ?? null,
      meta_pixel_enabled: Boolean((trackingSettings as any)?.meta_pixel_enabled),
      meta_pixel_id: (trackingSettings as any)?.meta_pixel_id ?? null,
      analytics_consent_required: (trackingSettings as any)?.consent_required ?? true,
      storefront_loader_text_en: s?.storefront_loader_text_en ?? null,
      storefront_loader_text_ar: s?.storefront_loader_text_ar ?? null,
    };

    const rawHero = brand.hero_media as any;
    const legacyHero = Array.isArray(rawHero) ? rawHero : [];
    const heroConfig = {
      background:
        rawHero && !Array.isArray(rawHero) && rawHero.background !== undefined
          ? rawHero.background
          : (legacyHero[0] ?? null),
      slides:
        rawHero && !Array.isArray(rawHero) && Array.isArray(rawHero.slides)
          ? rawHero.slides.slice(0, 5)
          : [],
    };
    return {
      brand: { ...brand, hero_media: heroConfig } as unknown as Brand,
      settings: safeSettings,
      bootstrapData: pageData,
    };
  },
  head: ({ loaderData }) => {
    const typedLoaderData = loaderData as { brand?: Brand; settings?: PublicSettings } | undefined;
    const b = typedLoaderData?.brand;
    const settings = typedLoaderData?.settings;
    if (!b) return { meta: [{ title: "Storefront" }] };
    const title = b.meta_title || settings?.business_name || `${b.name_en} — Online Store`;
    const desc =
      b.meta_description || `Shop ${b.name_en}${b.name_ar ? " / " + b.name_ar : ""} online.`;
    const img = settings?.logo_url || b.logo_url || "https://boutq.store/og-placeholder.png";
    const favicon = resolveBrandFavicon(settings?.favicon_url, settings?.logo_url ?? b.logo_url);
    const links: Array<Record<string, any>> = [
      {
        rel: "icon",
        href: favicon,
        ...(faviconType(favicon) ? { type: faviconType(favicon) } : {}),
      },
    ];

    return {
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
    };
  },
  component: StorefrontLayout,
  errorComponent: StorefrontError,
  notFoundComponent: () => <StorefrontError />,
});

function StorefrontLayout() {
  const loaderData = Route.useLoaderData() as any;
  const { brand, settings, isSuspended, suspensionReason } = loaderData;

  if (isSuspended) {
    return <StorefrontSuspended brand={brand} suspensionReason={suspensionReason} />;
  }

  useDynamicFavicon(settings?.favicon_url, settings?.logo_url ?? brand.logo_url);
  return (
    <StorefrontProvider brand={brand} settings={settings}>
      <StorefrontAnalytics />
      <StoreShell />
    </StorefrontProvider>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  if (!hex || !hex.startsWith("#")) return `rgba(255, 255, 255, ${alpha})`;
  let clean = hex.replace("#", "");
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (clean.length !== 6) return `rgba(255, 255, 255, ${alpha})`;
  const num = parseInt(clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isColorDark(hex: string | null | undefined): boolean {
  if (!hex || !hex.startsWith("#")) return false;
  let clean = hex.replace("#", "");
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (clean.length !== 6) return false;
  const num = parseInt(clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

function StoreShell() {
  const { brand, settings, lang } = useStorefront();
  const qc = useQueryClient();
  const router = useRouter();

  const primary = settings.primary_color || brand.primary_color || "#3f121a";
  const headerBg = settings.header_bg ?? settings.background_color ?? "#ffffff";
  const headerFg = settings.header_fg ?? readableOn(headerBg, settings.text_color);
  const footerBg = settings.footer_bg ?? settings.background_color ?? "#ffffff";
  const footerFg = settings.footer_fg ?? readableOn(footerBg, settings.text_color);
  const btnPrimaryBg = settings.btn_primary_bg ?? primary;
  const btnPrimaryFg = settings.btn_primary_fg ?? readableOn(btnPrimaryBg, "#ffffff");
  const btnSecondaryBg = settings.btn_secondary_bg ?? "#111111";
  const btnSecondaryFg = settings.btn_secondary_fg ?? readableOn(btnSecondaryBg, "#ffffff");
  const btnCheckoutBg = settings.btn_checkout_bg ?? btnPrimaryBg;
  const btnCheckoutFg = settings.btn_checkout_fg ?? readableOn(btnCheckoutBg, "#ffffff");
  const cartDrawerCheckoutBg = settings.cart_drawer_checkout_bg ?? btnCheckoutBg;
  const cartDrawerCheckoutFg =
    settings.cart_drawer_checkout_fg ?? readableOn(cartDrawerCheckoutBg, btnCheckoutFg);
  const headingColor = settings.heading_color ?? primary;
  const linkColor = settings.link_color ?? primary;
  const productTitleColor = settings.product_title_color ?? headingColor;
  const priceColor = settings.price_color ?? headingColor;
  const typographyLanguage = lang === "ar" ? "ar" : "en";
  const typographyVars = typographyVariables(settings.storefront_typography, typographyLanguage);
  const typographyFaces = customFontFaces(settings.storefront_typography, typographyLanguage);

  useEffect(() => {
    // Clean up refresh tokens stored by the retired client-only pseudo-passkey flow.
    localStorage.removeItem(`passkey_token_${brand.slug}`);
    localStorage.removeItem(`passkey_registered_${brand.slug}`);

    // Detect if embedded in an iframe or preview mode to suppress OS scrollbars
    const isEmbedded =
      typeof window !== "undefined" &&
      (window.self !== window.top || window.location.search.includes("preview=1"));
    if (isEmbedded) {
      document.documentElement.classList.add("is-embedded", "scrollbar-none");
      document.body.classList.add("is-embedded", "scrollbar-none");
    }
    return () => {
      document.documentElement.classList.remove("is-embedded", "scrollbar-none");
      document.body.classList.remove("is-embedded", "scrollbar-none");
    };
  }, [brand.slug]);

  const [localRadius, setLocalRadius] = useState<string | null>(null);
  const [localGlass, setLocalGlass] = useState<boolean | null>(null);
  const [localBadge, setLocalBadge] = useState<string | null>(null);

  useEffect(() => {
    try {
      const storedR = localStorage.getItem("boutq_storefront_radius");
      if (storedR && ["0px", "0.375rem", "1rem", "1.5rem"].includes(storedR)) {
        setLocalRadius(storedR);
      }
      const storedG = localStorage.getItem("boutq_header_glass");
      if (storedG !== null) {
        setLocalGlass(storedG === "true");
      }
      const storedB = localStorage.getItem("boutq_badge_accent");
      if (storedB) {
        setLocalBadge(storedB);
      }
    } catch (e) {
      // localStorage fallback
    }
  }, []);

  const rawRadius = localRadius || settings.storefront_radius || "0.5rem";
  const radiusSf = ["0px", "0.375rem", "1rem", "1.5rem"].includes(rawRadius) ? rawRadius : "0.5rem";
  const isGlass = localGlass !== null ? localGlass : (settings.header_glass ?? true);
  const badgeAccent = localBadge || settings.badge_accent || "maroon";

  const badgeBg =
    badgeAccent === "crimson"
      ? "#dc2626"
      : badgeAccent === "slate"
        ? "#334155"
        : badgeAccent === "emerald"
          ? "#059669"
          : "#330a0a";

  const baseHeaderBg = settings.header_bg || "#ffffff";
  const dynamicHeaderBg = isGlass ? hexToRgba(baseHeaderBg, 0.85) : baseHeaderBg;
  const isDarkHeader = isColorDark(baseHeaderBg);
  const dynamicHeaderFg = settings.header_fg || (isDarkHeader ? "#ffffff" : "#111111");

  return (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      className="storefront-shell min-h-screen flex flex-col w-full max-w-full overflow-x-clip"
      style={
        {
          backgroundColor: settings.background_color,
          color: settings.text_color,
          ["--primary" as any]: primary || "#3f121a",
          ["--primary-foreground" as any]: btnPrimaryFg,
          ["--radius" as any]: radiusSf,
          ["--radius-sf" as any]: radiusSf,
          ["--badge-accent-bg" as any]: badgeBg,
          ["--sf-header-bg" as any]: dynamicHeaderBg,
          ["--sf-header-fg" as any]: dynamicHeaderFg,
          ["--sf-footer-bg" as any]: footerBg,
          ["--sf-footer-fg" as any]: footerFg,
          ["--sf-btn-primary-bg" as any]: btnPrimaryBg,
          ["--sf-btn-primary-fg" as any]: btnPrimaryFg,
          ["--sf-btn-secondary-bg" as any]: btnSecondaryBg,
          ["--sf-btn-secondary-fg" as any]: btnSecondaryFg,
          ["--sf-btn-checkout-bg" as any]: btnCheckoutBg,
          ["--sf-btn-checkout-fg" as any]: btnCheckoutFg,
          ["--sf-cart-checkout-bg" as any]: cartDrawerCheckoutBg,
          ["--sf-cart-checkout-fg" as any]: cartDrawerCheckoutFg,
          ["--sf-heading" as any]: headingColor,
          ["--sf-link" as any]: linkColor,
          ["--sf-product-title" as any]: productTitleColor,
          ["--sf-price" as any]: priceColor,
          ...typographyVars,
          ["--sf-font" as any]: typographyVars["--type-body"],
          ["--font-sans" as any]: typographyVars["--type-body"],
          ["--font-display" as any]: typographyVars["--type-display"],
          fontFamily: typographyVars["--type-body"],
        } as React.CSSProperties
      }
    >
      {typographyFaces && <style>{typographyFaces}</style>}
      <div
        className={`sticky top-0 z-40 ${isGlass ? "backdrop-blur-md" : ""}`}
        style={{
          backgroundColor: "var(--sf-header-bg)",
          color: "var(--sf-header-fg)",
          borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
        }}
      >
        <AnnouncementBar />
        <StoreHeader />
        <DesktopStoreNavigation />
      </div>
      <main className="flex-1">
        <Outlet />
      </main>
      <StorefrontFooter />
      <WhatsAppFab />
    </div>
  );
}

function WhatsAppFab() {
  const { settings, lang, brand } = useStorefront();
  const { pathname } = useLocation();
  const isEmbedded =
    typeof window !== "undefined" &&
    (window.self !== window.top || window.location.search.includes("preview=1"));
  if (isEmbedded) return null;
  if (!settings.whatsapp_enabled) return null;
  const digits = (settings.whatsapp_number ?? "").replace(/\D/g, "");
  if (!digits) return null;

  // Detect pages that render a sticky mobile bottom action bar
  const hasStickyBottom = pathname.includes("/product/") || pathname.endsWith("/checkout");

  const text =
    lang === "ar"
      ? `مرحباً! لدي استفسار عن متجر ${brand.name_ar || brand.name_en}`
      : `Hi! I have a question about ${brand.name_en}`;
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp"
      className={`fixed z-50 ${
        hasStickyBottom ? "bottom-[84px] md:bottom-6" : "bottom-6 md:bottom-6"
      } end-5 h-14 w-14 rounded-full grid place-items-center shadow-lg hover:scale-110 active:scale-95`}
      style={{
        backgroundColor: "#25D366",
        color: "#fff",
        transition:
          "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s ease, bottom 0.4s cubic-bezier(0.25, 1, 0.5, 1)",
        willChange: "transform",
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-7 w-7"
        aria-hidden="true"
      >
        <path d="M20.52 3.48A11.94 11.94 0 0 0 12.06 0C5.5 0 .2 5.3.2 11.86c0 2.09.55 4.13 1.6 5.93L0 24l6.38-1.67a11.86 11.86 0 0 0 5.68 1.45h.01c6.56 0 11.86-5.3 11.86-11.86 0-3.17-1.23-6.15-3.41-8.44ZM12.07 21.5h-.01a9.63 9.63 0 0 1-4.9-1.34l-.35-.21-3.79.99 1.01-3.7-.23-.38a9.63 9.63 0 0 1-1.48-5.15c0-5.32 4.33-9.65 9.66-9.65 2.58 0 5 1 6.83 2.83a9.6 9.6 0 0 1 2.82 6.82c0 5.32-4.33 9.65-9.66 9.65Zm5.29-7.23c-.29-.15-1.71-.85-1.98-.94-.27-.1-.46-.15-.66.14-.19.29-.75.94-.92 1.13-.17.19-.34.22-.63.07-.29-.14-1.23-.45-2.35-1.44-.87-.77-1.46-1.72-1.63-2.01-.17-.29-.02-.44.13-.59.13-.13.29-.34.44-.51.14-.17.19-.29.29-.48.1-.19.05-.36-.02-.51-.07-.14-.66-1.58-.9-2.17-.24-.58-.48-.5-.66-.51h-.56c-.19 0-.51.07-.77.36-.27.29-1.02 1-1.02 2.44 0 1.44 1.05 2.83 1.2 3.02.14.19 2.07 3.15 5.02 4.42.7.3 1.24.48 1.66.62.7.22 1.33.19 1.83.11.56-.08 1.71-.7 1.96-1.38.24-.68.24-1.26.17-1.38-.07-.12-.26-.19-.55-.34Z" />
      </svg>
    </a>
  );
}

// Modularized storefront components
import { AnnouncementBar, StoreHeader } from "@/components/storefront/StorefrontHeader";
import { DesktopStoreNavigation, StorefrontMenu } from "@/components/storefront/StorefrontNavigation";
import { CartDrawer } from "@/components/storefront/StorefrontCartDrawer";

export { StorefrontMenu, CartDrawer };

function StorefrontSocialIcon({ platform }: { platform: string }) {
  const name = platform.toLowerCase();
  if (name.includes("instagram")) {
    return (
      <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 2.156 4.919 5.406.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-2.199-4.919-5.409-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    );
  }
  if (name.includes("whatsapp")) {
    return (
      <svg className="h-5 w-5 fill-current text-emerald-400" viewBox="0 0 24 24">
        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.396-.883-.726-1.48-1.623-1.653-1.92-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
      </svg>
    );
  }
  if (name.includes("facebook")) {
    return (
      <svg className="h-5 w-5 fill-current text-blue-500" viewBox="0 0 24 24">
        <path d="M9 8H6v4h3v12h5V12h3.642L18 8h-4V6.333C14 5.374 14.5 5 15.5 5H18V0h-3.808C10.592 0 9 1.812 9 4.885V8z" />
      </svg>
    );
  }
  if (name.includes("tiktok")) {
    return (
      <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.82.56-1.36 1.53-1.37 2.53-.02 1.05.51 2.07 1.38 2.62.87.56 2.01.62 2.96.22 1.04-.42 1.77-1.42 1.83-2.54.04-3.69.01-7.38.02-11.07z" />
      </svg>
    );
  }
  if (name.includes("snapchat")) {
    return (
      <svg className="h-5 w-5 fill-current text-yellow-400" viewBox="0 0 24 24">
        <path d="M12 2.163c-3.12 0-5.717 2.022-6.297 4.908-.182.906-.118 1.884-.118 2.802 0 .428.029.98-.293 1.341-.351.396-1.026.541-1.503.784-.428.218-.838.583-.758 1.112.083.551.629.782 1.109.967 1.042.403 2.12.637 2.71 1.674.322.568.17 1.258.077 1.862-.128.835-.615 1.542-1.332 2.017-.502.333-1.109.529-1.636.837-.361.21-.762.535-.668 1.002.091.503.626.657 1.077.747 2.193.438 4.5.385 6.702.385 2.202 0 4.51.053 6.703-.385.451-.09.986-.244 1.076-.747.095-.467-.306-.792-.667-1.002-.527-.308-1.134-.504-1.637-.837-.717-.475-1.203-1.182-1.331-2.017-.093-.604-.245-1.294.077-1.862.59-1.037 1.668-1.271 2.71-1.674.48-.185 1.026-.416 1.109-.967.08-.529-.33-.894-.758-1.112-.477-.243-1.152-.388-1.503-.784-.322-.361-.293-.913-.293-1.341 0-.918.064-1.896-.118-2.802C17.717 4.185 15.12 2.163 12 2.163z" />
      </svg>
    );
  }
  if (name.includes("x") || name.includes("twitter")) {
    return (
      <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }
  return <Sparkles className="h-5 w-5" />;
}

function StorefrontFooter() {
  const { brand, settings, lang, t } = useStorefront();
  const isAr = lang === "ar";
  const [openCompany, setOpenCompany] = useState(false);
  const [openHelp, setOpenHelp] = useState(false);

  const rawTrustBadges = (settings as any).trust_badges;
  const trustBadgesConfig: TrustBadgesConfig =
    rawTrustBadges && typeof rawTrustBadges === "object" && Array.isArray(rawTrustBadges.items)
      ? rawTrustBadges
      : DEFAULT_TRUST_BADGES;

  const activeBadges = (trustBadgesConfig.enabled ?? true)
    ? (trustBadgesConfig.items || []).filter((b) => b.enabled)
    : [];

  const pages = settings.pages ?? [];
  const pageLinks = pages
    .map((p, idx) => {
      const titleEn = p.title_en || p.title_ar || "";
      const titleAr = p.title_ar || p.title_en || "";
      const title = isAr ? titleAr : titleEn;
      const slug = p.slug;

      const isCompanyKeyword =
        titleEn.toLowerCase().includes("about") ||
        titleEn.toLowerCase().includes("contact") ||
        titleEn.toLowerCase().includes("company") ||
        titleAr.includes("من نحن") ||
        titleAr.includes("تواصل") ||
        titleAr.includes("الشركة") ||
        slug.toLowerCase().includes("about") ||
        slug.toLowerCase().includes("contact");

      const group =
        p.group === "company" || p.group === "help"
          ? p.group
          : isCompanyKeyword
            ? "company"
            : "help";

      return {
        idx: idx + 1,
        slug,
        title,
        group,
        hasContent: Boolean(p.title_ar || p.title_en),
      };
    })
    .filter((p) => p.hasContent && p.title);

  const companyPages = pageLinks.filter((p) => p.group === "company");
  const helpPages = pageLinks.filter((p) => p.group === "help");
  const socials = settings.socials ?? [];

  const companyTitle = isAr
    ? settings.footer_company_title_ar?.trim() || "الشركة"
    : settings.footer_company_title_en?.trim() || "Company";

  const helpTitle = isAr
    ? settings.footer_help_title_ar?.trim() || "المساعدة"
    : settings.footer_help_title_en?.trim() || "Help";

  const footerLogoSize = Math.max(16, Math.min(120, Number(settings.footer_logo_size ?? 28)));

  return (
    <footer
      className="border-t py-5 sm:py-6"
      style={{
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "var(--sf-footer-bg)",
        color: "var(--sf-footer-fg)",
      }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* =========================================================================
            DESKTOP FOOTER (md:flex) — Unchanged Layout
            ========================================================================= */}
        <div className="hidden md:flex flex-col items-center gap-3 text-center text-xs">
          {settings.logo_url && (
            <div className="pb-1">
              <img
                src={settings.logo_url}
                alt={brand.name_en || "Logo"}
                style={{ height: `${footerLogoSize}px`, width: "auto" }}
                className="object-contain"
              />
            </div>
          )}
          {pageLinks.length > 0 && (
            <nav className="flex flex-wrap justify-center items-center gap-x-5 gap-y-1 text-xs font-medium tracking-wide">
              {pageLinks.map((p) => (
                <Link
                  key={p.idx}
                  to="/$slug/$category"
                  params={{ slug: brand.slug, category: p.slug }}
                  className="inline-flex min-h-11 items-center py-0.5 hover:opacity-100 opacity-85 transition-opacity sm:min-h-0"
                  style={{ color: "var(--sf-footer-fg)" }}
                >
                  {p.title}
                </Link>
              ))}
            </nav>
          )}

          {socials.length > 0 && (
            <nav className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 text-xs opacity-75 uppercase tracking-widest">
              {socials.map((s, i) => (
                <a
                  key={`${s.name}-${i}`}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center py-0.5 hover:opacity-100 transition-opacity sm:min-h-0"
                  style={{ color: "var(--sf-footer-fg)" }}
                >
                  {s.name}
                </a>
              ))}
            </nav>
          )}

          {/* Custom Boutique Trust & Security Reassurance Bar */}
          {activeBadges.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 my-2 py-2.5 px-4 text-xs font-medium opacity-90 border-y border-white/10 rounded-xl bg-white/5 backdrop-blur-xs max-w-3xl w-full">
              {activeBadges.map((badge, idx) => (
                <React.Fragment key={badge.id || idx}>
                  {idx > 0 && <div className="hidden sm:inline text-white/20">•</div>}
                  <div className="inline-flex items-center gap-1.5">
                    {renderTrustBadgeIcon(badge.icon, "h-3.5 w-3.5", badge.color)}
                    <span>{isAr ? badge.text_ar || badge.text_en : badge.text_en || badge.text_ar}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs opacity-70 border-t border-border pt-2 w-full max-w-2xl">
            {settings.show_footer_name && (
              <span className="font-semibold" style={{ color: "var(--sf-footer-fg)" }}>
                {lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en}
              </span>
            )}
            <span>
              © {new Date().getFullYear()} — {t("جميع الحقوق محفوظة", "All rights reserved")}
            </span>
            {settings.analytics_consent_required && (
              <Button
                type="button"
                variant="link"
                className="inline-flex min-h-11 items-center hover:opacity-100 py-0.5 sm:min-h-0 h-auto p-0 font-normal underline underline-offset-2"
                style={{ color: "var(--sf-footer-fg)" }}
                onClick={() => window.dispatchEvent(new Event("boutq:privacy-preferences"))}
              >
                {t("خيارات الخصوصية", "Privacy choices")}
              </Button>
            )}
          </div>
        </div>

        {/* =========================================================================
            MOBILE FOOTER (md:hidden) — Structured Accordions & Scannable Layout
            ========================================================================= */}
        <div className="block md:hidden space-y-4 text-center">
          {/* Section 1: Logo Header */}
          <div className="flex flex-col items-center pb-3 border-b border-white/10">
            {settings.logo_url ? (
              <img
                src={settings.logo_url}
                alt={brand.name_en || "Logo"}
                style={{ height: `${footerLogoSize}px`, width: "auto" }}
                className="object-contain"
              />
            ) : (
              <span
                className="font-heading text-base font-bold tracking-tight"
                style={{ color: "var(--sf-footer-fg)" }}
              >
                {lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en}
              </span>
            )}
          </div>

          {/* Section 2: Accordion Link Groups */}
          <div className="space-y-1.5 border-b border-white/10 pb-3 text-start">
            {/* Group A: Company */}
            {companyPages.length > 0 && (
              <div className="border-b border-white/10 last:border-0">
                <button
                  type="button"
                  onClick={() => setOpenCompany(!openCompany)}
                  className="w-full min-h-[44px] flex items-center justify-between py-2.5 px-1 text-sm font-semibold tracking-wide"
                  style={{ color: "var(--sf-footer-fg)" }}
                  aria-expanded={openCompany}
                >
                  <span>{companyTitle}</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      openCompany ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div
                  className={`grid transition-all duration-200 ease-in-out ${
                    openCompany ? "grid-rows-[1fr] opacity-100 mb-2" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden space-y-1 px-1">
                    {companyPages.map((p) => (
                      <Link
                        key={p.idx}
                        to="/$slug/$category"
                        params={{ slug: brand.slug, category: p.slug }}
                        className="flex min-h-[44px] items-center text-xs opacity-85 hover:opacity-100 py-1"
                        style={{ color: "var(--sf-footer-fg)" }}
                      >
                        {p.title}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Group B: Help */}
            {helpPages.length > 0 && (
              <div className="border-b border-white/10 last:border-0">
                <button
                  type="button"
                  onClick={() => setOpenHelp(!openHelp)}
                  className="w-full min-h-[44px] flex items-center justify-between py-2.5 px-1 text-sm font-semibold tracking-wide"
                  style={{ color: "var(--sf-footer-fg)" }}
                  aria-expanded={openHelp}
                >
                  <span>{helpTitle}</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      openHelp ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div
                  className={`grid transition-all duration-200 ease-in-out ${
                    openHelp ? "grid-rows-[1fr] opacity-100 mb-2" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden space-y-1 px-1">
                    {helpPages.map((p) => (
                      <Link
                        key={p.idx}
                        to="/$slug/$category"
                        params={{ slug: brand.slug, category: p.slug }}
                        className="flex min-h-[44px] items-center text-xs opacity-85 hover:opacity-100 py-1"
                        style={{ color: "var(--sf-footer-fg)" }}
                      >
                        {p.title}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Social Icons Row */}
          {socials.length > 0 && (
            <div className="flex flex-wrap justify-center items-center gap-3 py-1">
              {socials.map((s, i) => (
                <a
                  key={`${s.name}-${i}`}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.name}
                  className="h-11 w-11 rounded-full border border-white/15 bg-white/5 flex items-center justify-center hover:bg-white/15 transition-all active:scale-95"
                  style={{ color: "var(--sf-footer-fg)" }}
                >
                  <StorefrontSocialIcon platform={s.name} />
                </a>
              ))}
            </div>
          )}

          {/* Section 4: Trust Badges Grid */}
          {activeBadges.length > 0 && (
            <div className="grid grid-cols-2 gap-2 my-3 text-xs">
              {activeBadges.map((badge, idx) => (
                <div
                  key={badge.id || idx}
                  className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xs p-3 flex flex-col items-center justify-center text-center gap-1.5 min-h-[72px]"
                >
                  {renderTrustBadgeIcon(badge.icon, "h-5 w-5", badge.color)}
                  <span className="font-medium text-xs leading-tight">
                    {isAr ? badge.text_ar || badge.text_en : badge.text_en || badge.text_ar}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Section 5: Bottom Bar */}
          <div className="pt-3 border-t border-white/10 flex flex-col items-center gap-1.5 text-xs opacity-75">
            {settings.show_footer_name && (
              <span className="font-semibold" style={{ color: "var(--sf-footer-fg)" }}>
                {lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en}
              </span>
            )}
            <span>
              © {new Date().getFullYear()} — {t("جميع الحقوق محفوظة", "All rights reserved")}
            </span>
            {settings.analytics_consent_required && (
              <Button
                type="button"
                variant="link"
                className="inline-flex min-h-11 items-center hover:opacity-100 py-0.5 sm:min-h-0 h-auto p-0 font-normal underline underline-offset-2"
                style={{ color: "var(--sf-footer-fg)" }}
                onClick={() => window.dispatchEvent(new Event("boutq:privacy-preferences"))}
              >
                {t("خيارات الخصوصية", "Privacy choices")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}

function StorefrontError({ error }: { error?: any }) {
  useEffect(() => {
    if (error) {
      console.error("STOREFRONT_ERROR:", error);
    }
  }, [error]);

  const errorMsg =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null
        ? error.message || JSON.stringify(error)
        : String(error || "");

  return (
    <div className="min-h-screen grid place-items-center p-8">
      <Card className="p-8 text-center max-w-md">
        <div className="mx-auto mb-4 h-10 w-10 rounded-full bg-muted grid place-items-center">
          <X className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-display mb-2">Storefront unavailable</h1>
        <p className="text-muted-foreground mb-2">
          This brand doesn't have an active storefront yet.
        </p>
        {error && (
          <div className="mt-4 p-3 bg-destructive/10 text-xs font-mono text-start rounded overflow-auto max-h-40 text-destructive border border-destructive/20 select-all">
            <div className="font-bold mb-1">Diagnostic Info:</div>
            {errorMsg}
          </div>
        )}
      </Card>
    </div>
  );
}
