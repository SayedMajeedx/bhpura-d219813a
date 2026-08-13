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
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Grid2X2,
  ChevronDown,
  Sparkles,
} from "lucide-react";
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
      logo_align: (s?.logo_align ?? "left") as "left" | "center" | "right",
      show_header_name: s?.show_header_name ?? true,
      show_hero_title: s?.show_hero_title ?? true,
      show_hero_about: s?.show_hero_about ?? true,
      show_footer_name: s?.show_footer_name ?? true,
      storefront_font_en: s?.storefront_font_en ?? "Inter",
      storefront_font_ar: s?.storefront_font_ar ?? "Tajawal",
      storefront_font_en_url: s?.storefront_font_en_url ?? null,
      storefront_font_ar_url: s?.storefront_font_ar_url ?? null,
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
    const heroBg = b.hero_media?.background;
    const firstSlide = b.hero_media?.slides?.[0];
    let lcpImageUrl: string | null = null;

    if (heroBg?.url && heroBg.type !== "video") {
      lcpImageUrl = cloudflareImageUrl(heroBg.url, 640);
    } else if (firstSlide && firstSlide.type === "image") {
      const slideMediaUrl =
        (firstSlide.media_url || firstSlide.media_url_ar || firstSlide.media_url_en) ?? "";
      if (slideMediaUrl) {
        lcpImageUrl = cloudflareImageUrl(slideMediaUrl, 640);
      }
    }

    const links: Array<Record<string, any>> = [
      {
        rel: "icon",
        href: favicon,
        ...(faviconType(favicon) ? { type: faviconType(favicon) } : {}),
      },
    ];

    if (lcpImageUrl) {
      links.push({
        rel: "preload",
        as: "image",
        href: lcpImageUrl,
        fetchpriority: "high",
        fetchPriority: "high",
      });
    }

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
  const { brand, settings } = Route.useLoaderData() as unknown as {
    brand: Brand;
    settings: PublicSettings;
  };
  useDynamicFavicon(settings.favicon_url, settings.logo_url ?? brand.logo_url);
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
  const storefrontFont = lang === "ar" ? settings.storefront_font_ar : settings.storefront_font_en;
  const storefrontFontUrl =
    lang === "ar" ? settings.storefront_font_ar_url : settings.storefront_font_en_url;
  const storefrontFontFamily = storefrontFontUrl ? "StorefrontCustomFont" : storefrontFont;

  useEffect(() => {
    // Clean up refresh tokens stored by the retired client-only pseudo-passkey flow.
    localStorage.removeItem(`passkey_token_${brand.slug}`);
    localStorage.removeItem(`passkey_registered_${brand.slug}`);
  }, [brand.slug]);

  useEffect(() => {
    if (storefrontFontUrl || !storefrontFont) return;
    const globallyLoaded = new Set([
      "Inter",
      "Cormorant Garamond",
      "Tajawal",
      "Cairo",
      "29LT Bukra",
      "29LT Zarid Display",
      "29LT Kaff",
      "29LT Azer",
    ]);
    if (globallyLoaded.has(storefrontFont)) return;
    const id = `storefront-font-${storefrontFont.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(storefrontFont).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
  }, [storefrontFont, storefrontFontUrl]);

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
      className="storefront-shell min-h-screen flex flex-col"
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
          ["--sf-font" as any]: `"${storefrontFontFamily}", sans-serif`,
          ["--font-sans" as any]: `"${storefrontFontFamily}", sans-serif`,
          ["--font-display" as any]: `"${storefrontFontFamily}", sans-serif`,
          fontFamily: `"${storefrontFontFamily}", sans-serif`,
        } as React.CSSProperties
      }
    >
      {storefrontFontUrl && (
        <style>{`@font-face { font-family: 'StorefrontCustomFont'; src: url('${storefrontFontUrl}'); font-display: swap; }`}</style>
      )}
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
      } ${lang === "ar" ? "left-5" : "right-5"} h-14 w-14 rounded-full grid place-items-center shadow-lg hover:scale-110 active:scale-95`}
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

function StoreHeader() {
  const { brand, settings, lang, setLang, t, cartCount, session, isStoreMember, wishlistCount } =
    useStorefront();
  const displayName = lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en;
  const align = settings.logo_align ?? "left";
  const logoSize = settings.logo_size || 40;
  const isDarkHeader = isColorDark(settings.header_bg);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="w-full">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2 flex flex-col gap-2">
        <div className="h-14 flex items-center gap-3 justify-between">
          <Link
            to="/$slug"
            params={{ slug: brand.slug }}
            className={`flex min-h-11 items-center gap-3 min-w-0 ${align === "center" ? "sm:mx-auto" : ""}`}
            style={{ color: "var(--sf-header-fg)" }}
            aria-label={displayName}
          >
            {settings.logo_url && (
              <img
                src={cloudflareImageUrl(settings.logo_url, 320)}
                alt={displayName}
                width={165}
                height={55}
                fetchPriority="high"
                decoding="async"
                className="shrink-0 object-contain"
                style={{
                  height: logoSize,
                  maxHeight: logoSize,
                  width: "auto",
                  maxWidth: logoSize * 3,
                }}
              />
            )}

            {settings.show_header_name && (
              <span
                className="font-display text-lg sm:text-xl truncate"
                style={{ color: "var(--sf-header-fg)" }}
              >
                {displayName}
              </span>
            )}
          </Link>
          {/* Desktop search */}
          <div className="hidden md:flex flex-1 max-w-md mx-4">
            <SearchBar />
          </div>

          <div
            className="flex items-center gap-1 sm:gap-2 shrink-0"
            style={{ color: "var(--sf-header-fg)" }}
          >
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 min-w-11 gap-1 bg-transparent hover:bg-white/10 active:bg-white/20 text-inherit border-0 shadow-none focus-visible:ring-1 focus-visible:ring-white/30"
              style={{ color: "var(--sf-header-fg)" }}
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              aria-label={
                lang === "ar" ? "تغيير اللغة إلى الإنجليزية" : "Switch language to Arabic"
              }
            >
              <Languages className="h-4 w-4" />
              <span className="hidden sm:inline">{lang === "ar" ? "English" : "العربية"}</span>
            </Button>

            {session && isStoreMember ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="min-h-11 min-w-11 gap-1 bg-transparent hover:bg-white/10 active:bg-white/20 text-inherit border-0 shadow-none focus-visible:ring-1 focus-visible:ring-white/30"
                style={{ color: "var(--sf-header-fg)" }}
              >
                <Link
                  to="/$slug/account"
                  params={{ slug: brand.slug }}
                  title={session.user?.email ?? ""}
                  aria-label={t("لوحة التحكم", "Dashboard")}
                >
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline max-w-[120px] truncate">
                    {t("لوحة التحكم", "Dashboard")}
                  </span>
                </Link>
              </Button>
            ) : (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="min-h-11 min-w-11 gap-1 bg-transparent hover:bg-white/10 active:bg-white/20 text-inherit border-0 shadow-none focus-visible:ring-1 focus-visible:ring-white/30"
                style={{ color: "var(--sf-header-fg)" }}
              >
                <Link
                  to="/$slug/auth"
                  params={{ slug: brand.slug }}
                  search={{
                    redirect: mounted ? window.location.pathname + window.location.search : "",
                  }}
                  aria-label={t("دخول", "Sign in")}
                >
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("دخول", "Sign in")}</span>
                </Link>
              </Button>
            )}

            <Button
              asChild
              variant="ghost"
              size="sm"
              className="relative min-h-11 min-w-11 gap-1 bg-transparent hover:bg-white/10 active:bg-white/20 text-inherit border-0 shadow-none focus-visible:ring-1 focus-visible:ring-white/30"
              style={{ color: "var(--sf-header-fg)" }}
            >
              <Link
                to="/$slug/wishlist"
                params={{ slug: brand.slug }}
                aria-label={t("المفضلة", "Wishlist")}
              >
                <Heart className="h-5 w-5" />
                <span className="hidden sm:inline">{t("المفضلة", "Wishlist")}</span>
                {wishlistCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-semibold"
                    style={{
                      backgroundColor: "var(--sf-btn-primary-bg)",
                      color: "var(--sf-btn-primary-fg)",
                    }}
                  >
                    {wishlistCount}
                  </span>
                )}
              </Link>
            </Button>

            <CartDrawer>
              <Button
                variant="ghost"
                size="sm"
                className="relative min-h-11 min-w-11 gap-1 bg-transparent hover:bg-white/10 active:bg-white/20 text-inherit border-0 shadow-none focus-visible:ring-1 focus-visible:ring-white/30"
                style={{ color: "var(--sf-header-fg)" }}
                aria-label={t("سلة التسوق", "Shopping cart")}
              >
                <ShoppingBag className="h-5 w-5" />
                <span className="hidden sm:inline">{t("السلة", "Cart")}</span>
                {cartCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold grid place-items-center"
                    style={{
                      backgroundColor: "var(--sf-btn-primary-bg)",
                      color: "var(--sf-btn-primary-fg)",
                    }}
                  >
                    {cartCount}
                  </span>
                )}
              </Button>
            </CartDrawer>
          </div>
        </div>

        {/* Mobile: keep Menu beside Search in the sticky header. */}
        <div dir={lang === "ar" ? "rtl" : "ltr"} className="flex items-center gap-2 pb-1 md:hidden">
          <div className="shrink-0">
            <MobileStorefrontDropdown />
          </div>
          <div className="min-w-0 flex-1">
            <SearchBar />
          </div>
        </div>
      </div>
    </header>
  );
}

function AnnouncementBar() {
  const { brand, settings, lang, session } = useStorefront();
  const { pathname } = useLocation();
  const text =
    lang === "ar"
      ? settings.announcement_text_ar || settings.announcement_text_en
      : settings.announcement_text_en || settings.announcement_text_ar;
  const key = `announcement-dismissed:${brand.id}:${text ?? ""}`;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(key) === "1") {
        setDismissed(true);
      }
    } catch {
      void 0;
    }
  }, [key]);
  const audienceOk =
    settings.announcement_audience === "all" ||
    (settings.announcement_audience === "guest" ? !session : Boolean(session));
  const relative = pathname.replace(`/${brand.slug}`, "") || "/";
  const scopeOk =
    settings.announcement_scope === "all" ||
    (settings.announcement_scope === "home" && relative === "/") ||
    (settings.announcement_scope === "checkout" && relative.startsWith("/checkout")) ||
    (settings.announcement_scope === "catalog" &&
      !relative.startsWith("/checkout") &&
      !relative.startsWith("/account") &&
      !relative.startsWith("/auth"));
  if (!settings.announcement_enabled || !text || dismissed || !audienceOk || !scopeOk) return null;
  return (
    <div
      className="relative px-12 py-2 text-center text-sm font-medium text-white"
      style={{
        backgroundColor: settings.announcement_bg || "#111111",
        color: settings.announcement_fg || "#ffffff",
        fontWeight: settings.announcement_bold ? 700 : 500,
        fontStyle: settings.announcement_italic ? "italic" : "normal",
      }}
    >
      <span>{text}</span>
      {settings.announcement_dismissible && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute end-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-md hover:bg-white/15 opacity-80 hover:opacity-100"
          aria-label="Dismiss announcement"
          onClick={() => {
            try {
              sessionStorage.setItem(key, "1");
            } catch {
              void 0;
            }
            setDismissed(true);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function NavCategoryItem({
  category,
  categories,
  expandedCategories,
  onToggleExpand,
  brand,
  lang,
  close,
  depth = 0,
}: {
  category: any;
  categories: any[];
  expandedCategories: Record<string, boolean>;
  onToggleExpand: (id: string) => void;
  brand: any;
  lang: string;
  close: () => void;
  depth?: number;
}) {
  const categorySlug = category.slug || category.name_en;
  const label =
    lang === "ar" ? category.name_ar || category.name_en : category.name_en || category.name_ar;
  const childCategories = categories.filter((sub: any) => sub.parent_id === category.id);
  const isExpanded = !!expandedCategories[category.id];

  const toggleExpand = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleExpand(category.id);
  };

  return (
    <div className="space-y-1.5 w-full">
      <div className="flex items-center gap-1 rounded-[var(--radius)] border border-white/15 bg-white/10 transition-colors hover:bg-white/20 active:bg-white/30 pr-1.5 rtl:pr-0 rtl:pl-1.5">
        <Link
          to="/$slug/$category"
          params={{ slug: brand.slug, category: categorySlug }}
          onClick={close}
          className="flex min-h-12 flex-1 items-center gap-3 px-2.5 py-2 min-w-0"
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/15">
            {category.menu_icon_url ? (
              <img
                src={cloudflareImageUrl(category.menu_icon_url, 80)}
                width={20}
                height={20}
                loading="lazy"
                decoding="async"
                alt=""
                className="h-5 w-5 object-contain"
              />
            ) : (
              <Grid2X2 className="h-4 w-4 opacity-50" />
            )}
          </div>
          <span className="truncate font-medium text-start text-sm">{label}</span>
        </Link>
        {childCategories.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleExpand}
            className="h-11 w-11 p-0 shrink-0 rounded-lg hover:bg-black/5 text-muted-foreground hover:text-foreground transition-all duration-200"
            aria-expanded={isExpanded}
            aria-label={lang === "ar" ? "توسيع" : "Expand"}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
            />
          </Button>
        )}
      </div>

      {childCategories.length > 0 && isExpanded && (
        <div className="ms-4 ps-3 border-s border-muted-foreground/15 space-y-1.5 animate-in slide-in-from-top-1 duration-200">
          <Link
            to="/$slug/$category"
            params={{ slug: brand.slug, category: categorySlug }}
            onClick={close}
            className="flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-black/5 text-muted-foreground hover:text-foreground font-semibold"
          >
            <div className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md bg-muted/30">
              <Grid2X2 className="h-3.5 w-3.5 opacity-30" />
            </div>
            <span className="truncate text-xs">{lang === "ar" ? "عرض الكل" : "View All"}</span>
          </Link>
          {childCategories.map((sub: any) => (
            <NavCategoryItem
              key={sub.id}
              category={sub}
              categories={categories}
              expandedCategories={expandedCategories}
              onToggleExpand={onToggleExpand}
              brand={brand}
              lang={lang}
              close={close}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MobileStorefrontDropdown() {
  const { brand, settings, lang, t } = useStorefront();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [localGlass, setLocalGlass] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const storedG = localStorage.getItem("boutq_header_glass");
      if (storedG !== null) {
        setLocalGlass(storedG === "true");
      }
    } catch (_ignored) {
      void 0;
    }
  }, []);

  const isGlass = localGlass !== null ? localGlass : (settings.header_glass ?? true);
  const menuBackground =
    settings.menu_bg || settings.header_bg || settings.background_color || "#ffffff";
  const isDarkMenu = isColorDark(menuBackground);
  const menuText = settings.menu_fg || (isDarkMenu ? "#ffffff" : "#111111");
  const drawerBg = isGlass ? hexToRgba(menuBackground, 0.65) : menuBackground;

  const { data: categories = [] } = useQuery({
    queryKey: ["storefront", brand.slug, "categories"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("categories") as any)
        .select("id, name_en, name_ar, parent_id, slug, image_url, menu_icon_url, sort_order")
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isOpen,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  const close = () => {
    setIsOpen(false);
  };

  const pages = settings.pages
    .map((page, index) => ({
      key: `${page.slug}-${index}`,
      slug: page.slug,
      title: lang === "ar" ? page.title_ar || page.title_en : page.title_en || page.title_ar,
      iconUrl: page.menu_icon_url,
    }))
    .filter((page) => settings.menu_show_pages && Boolean(page.title));

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          className="flex h-11 items-center gap-2 px-3 font-medium rounded-[var(--radius)] border border-white/20 bg-white/10 hover:bg-white/20 active:bg-white/30 text-inherit shadow-none transition-all duration-200"
          style={{ color: "var(--sf-header-fg)" }}
        >
          <Grid2X2 className="h-4 w-4" />
          <span>{t("القائمة", "Menu")}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side={lang === "ar" ? "right" : "left"}
        className={`w-[min(88vw,23rem)] border-r border-l border-white/20 p-0 flex flex-col h-full ${
          isGlass ? "backdrop-blur-2xl backdrop-saturate-150" : ""
        } [&>button]:top-4 [&>button]:grid [&>button]:h-9 [&>button]:w-9 [&>button]:place-items-center [&>button]:rounded-md [&>button]:text-inherit [&>button]:hover:bg-white/10 [&>button]:opacity-80 [&>button]:hover:opacity-100`}
        style={{
          backgroundColor: drawerBg,
          color: menuText,
        }}
      >
        <SheetHeader className="px-4 pt-5 pb-3 border-b border-border/10 shrink-0">
          <SheetTitle
            className="text-start text-base font-semibold flex items-center gap-2"
            style={{ color: menuText }}
          >
            <Grid2X2 className="h-5 w-5" />
            {t("القائمة", "Menu")}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 overscroll-contain">
          {/* Categories Block */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-65">
              <Grid2X2 className="h-4 w-4" />
              {t("الأقسام", "Categories")}
            </div>
            <div className="grid grid-cols-1 gap-3">
              {categories
                .filter((c: any) => !c.parent_id)
                .map((category: any) => (
                  <NavCategoryItem
                    key={category.id}
                    category={category}
                    categories={categories}
                    expandedCategories={expandedCategories}
                    onToggleExpand={(id) =>
                      setExpandedCategories((prev) => ({ ...prev, [id]: !prev[id] }))
                    }
                    brand={brand}
                    lang={lang}
                    close={close}
                  />
                ))}
            </div>
          </div>

          {/* Pages Block */}
          {pages.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-border/10">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-65">
                <FileText className="h-4 w-4" />
                {t("الصفحات", "Pages")}
              </div>
              <div className="space-y-1">
                {pages.map((page) => (
                  <Link
                    key={page.key}
                    to="/$slug/$category"
                    params={{ slug: brand.slug, category: page.slug }}
                    onClick={close}
                    className="flex min-h-11 items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-black/5"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-black/5">
                      {page.iconUrl ? (
                        <img
                          src={cloudflareImageUrl(page.iconUrl, 80)}
                          // Decorative icon next to visible title label
                          alt=""
                          className="h-5 w-5 object-contain"
                        />
                      ) : (
                        <FileText className="h-4 w-4 opacity-60" />
                      )}
                    </span>
                    <span className="truncate text-sm font-medium">{page.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function StorefrontMenu({ navigation = false }: { navigation?: boolean } = {}) {
  const { brand, settings, lang, t, session, isStoreMember } = useStorefront();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [localGlass, setLocalGlass] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const storedG = localStorage.getItem("boutq_header_glass");
      if (storedG !== null) {
        setLocalGlass(storedG === "true");
      }
    } catch {
      void 0;
    }
  }, []);

  const isGlass = localGlass !== null ? localGlass : (settings.header_glass ?? true);
  const displayName = lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en;
  const menuTitle =
    (lang === "ar"
      ? settings.menu_title_ar || settings.menu_title_en
      : settings.menu_title_en || settings.menu_title_ar) || displayName;
  const menuBg = settings.menu_bg || settings.header_bg || settings.background_color || "#ffffff";
  const isDarkMenu = isColorDark(menuBg);
  const menuFg = settings.menu_fg || (isDarkMenu ? "#ffffff" : "#111111");
  const drawerBg = isGlass ? hexToRgba(menuBg, 0.65) : menuBg;

  const pageLinks = settings.pages
    .map((page, index) => ({
      index: index + 1,
      slug: page.slug,
      title: lang === "ar" ? page.title_ar || page.title_en : page.title_en || page.title_ar,
    }))
    .filter((page) => settings.menu_show_pages && Boolean(page.title));
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size={navigation ? "default" : "sm"}
          className={`${
            navigation
              ? "h-11 shrink-0 rounded-[var(--radius)] border border-white/20 bg-white/10 hover:bg-white/20 active:bg-white/30 text-inherit font-semibold shadow-none"
              : "bg-transparent hover:bg-white/10 active:bg-white/20 text-inherit border-0 shadow-none"
          } gap-2 transition-all duration-200`}
          style={{ color: "var(--sf-header-fg)" }}
          aria-label={t("القائمة", "Menu")}
        >
          <Menu className="h-5 w-5" />
          <span className={navigation ? "inline" : "hidden lg:inline"}>
            {navigation ? t("كل الأقسام", "All categories") : t("القائمة", "Menu")}
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side={lang === "ar" ? "right" : "left"}
        dir={lang === "ar" ? "rtl" : "ltr"}
        className={`flex h-full w-[min(90vw,400px)] flex-col overflow-hidden border-r border-l border-white/20 p-0 shadow-2xl ${
          isGlass ? "backdrop-blur-2xl backdrop-saturate-150" : ""
        } [&>button]:top-5 [&>button]:grid [&>button]:h-9 [&>button]:w-9 [&>button]:place-items-center [&>button]:rounded-md [&>button]:text-inherit [&>button]:hover:bg-white/10 [&>button]:opacity-80 [&>button]:hover:opacity-100 ${
          lang === "ar" ? "[&>button]:left-5 [&>button]:right-auto" : "[&>button]:right-5"
        }`}
        style={{ backgroundColor: drawerBg, color: menuFg, zIndex: 60 }}
      >
        {open && (
          <>
            <div
              className="relative shrink-0 overflow-hidden border-b px-6 pb-6 pt-7 pe-20"
              style={{ borderColor: "rgba(127,127,127,.18)" }}
            >
              <div
                className="pointer-events-none absolute -end-16 -top-24 h-52 w-52 rounded-full opacity-[0.08]"
                style={{ backgroundColor: settings.primary_color }}
              />
              <div className="relative flex min-w-0 items-center gap-4">
                {settings.logo_url && (
                  <div className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/5 p-1">
                    <img
                      src={cloudflareImageUrl(settings.logo_url, 320)}
                      alt={displayName}
                      className="block max-h-full max-w-full object-contain"
                      style={{ width: "auto", height: "auto" }}
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1 text-start">
                  <SheetTitle className="truncate text-2xl font-display" style={{ color: menuFg }}>
                    {menuTitle}
                  </SheetTitle>
                  <p className="mt-1 truncate text-xs opacity-65">
                    {t("اكتشف المتجر", "Explore our store")}
                  </p>
                </div>
              </div>
            </div>
            <nav
              className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4"
              style={{ scrollbarWidth: "none" }}
            >
              {settings.menu_show_home && (
                <Link
                  to="/$slug"
                  params={{ slug: brand.slug }}
                  onClick={close}
                  className="flex min-h-12 items-center gap-3 rounded-[var(--radius)] px-4 py-3 text-start transition-colors hover:bg-white/10 active:bg-white/20"
                  style={{ color: menuFg }}
                >
                  <Home className="h-5 w-5 shrink-0" />
                  <span className="min-w-0 truncate">{t("الرئيسية", "Home")}</span>
                </Link>
              )}
              {session && isStoreMember ? (
                <>
                  {settings.menu_show_account && (
                    <Link
                      to="/$slug/account"
                      params={{ slug: brand.slug }}
                      onClick={close}
                      className="flex min-h-12 items-center gap-3 rounded-[var(--radius)] px-4 py-3 text-start transition-colors hover:bg-white/10 active:bg-white/20"
                      style={{ color: menuFg }}
                    >
                      <User className="h-5 w-5 shrink-0" />
                      <span className="min-w-0 truncate">{t("حسابي", "My account")}</span>
                    </Link>
                  )}
                  {settings.menu_show_orders && (
                    <Link
                      to="/$slug/account"
                      params={{ slug: brand.slug }}
                      onClick={close}
                      className="flex min-h-12 items-center gap-3 rounded-[var(--radius)] px-4 py-3 text-start transition-colors hover:bg-white/10 active:bg-white/20"
                      style={{ color: menuFg }}
                    >
                      <PackageSearch className="h-5 w-5 shrink-0" />
                      <span className="min-w-0 truncate">{t("طلباتي", "My orders")}</span>
                    </Link>
                  )}
                </>
              ) : (
                settings.menu_show_account && (
                  <Link
                    to="/$slug/auth"
                    params={{ slug: brand.slug }}
                    search={{
                      redirect: mounted ? window.location.pathname + window.location.search : "",
                    }}
                    onClick={close}
                    className="flex min-h-12 items-center gap-3 rounded-[var(--radius)] px-4 py-3 text-start transition-colors hover:bg-white/10 active:bg-white/20"
                    style={{ color: menuFg }}
                  >
                    <LogIn className="h-5 w-5 shrink-0" />
                    <span className="min-w-0 truncate">{t("تسجيل الدخول", "Sign in")}</span>
                  </Link>
                )
              )}
              {pageLinks.length > 0 && (
                <div className="my-3 border-t" style={{ borderColor: "rgba(127,127,127,.18)" }} />
              )}
              {pageLinks.map((page) => (
                <Link
                  key={page.index}
                  to="/$slug/$category"
                  params={{ slug: brand.slug, category: page.slug }}
                  onClick={close}
                  className="flex min-h-12 items-center gap-3 rounded-[var(--radius)] px-4 py-3 text-start transition-colors hover:bg-white/10 active:bg-white/20"
                  style={{ color: menuFg }}
                >
                  <FileText className="h-5 w-5 shrink-0" />
                  <span className="min-w-0 truncate">{page.title}</span>
                </Link>
              ))}
            </nav>
            <div
              className="m-4 mt-2 shrink-0 rounded-2xl border p-5 text-start text-sm"
              style={{ backgroundColor: menuBg, borderColor: `${settings.primary_color}55` }}
            >
              <p className="font-medium" style={{ color: menuFg }}>
                {t("تسوق بكل سهولة", "Shopping made simple")}
              </p>
              <p className="mt-1 opacity-65">
                {t(
                  "تصفح المنتجات وتابع طلباتك من مكان واحد.",
                  "Browse products and follow your orders in one place.",
                )}
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DesktopSubMenu({
  parentCategoryId,
  categories,
  brand,
  lang,
  close,
  depth = 0,
}: {
  parentCategoryId: string;
  categories: any[];
  brand: any;
  lang: string;
  close: () => void;
  depth?: number;
}) {
  const subs = categories.filter((sub) => sub.parent_id === parentCategoryId);
  const [activeId, setActiveId] = useState<string | null>(null);

  if (subs.length === 0) return null;

  return (
    <div className="space-y-1">
      {subs.map((sub) => {
        const name = lang === "ar" ? sub.name_ar || sub.name_en : sub.name_en || sub.name_ar;
        const url = sub.slug || sub.name_en;
        const children = categories.filter((c) => c.parent_id === sub.id);
        const hasChildren = children.length > 0;
        const isExpanded = activeId === sub.id;

        return (
          <div key={sub.id} className="w-full">
            <div className="flex items-center justify-between rounded-lg transition-all hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <Link
                to="/$slug/$category"
                params={{ slug: brand.slug, category: url }}
                onClick={(e) => {
                  if (hasChildren) {
                    if (!isExpanded) {
                      // First click: expand dropdown, prevent direct navigation
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveId(sub.id);
                    } else {
                      // Second click: navigate to URL and close entire menu
                      close();
                    }
                  } else {
                    // No children: navigate immediately and close
                    close();
                  }
                }}
                className="flex-1 px-3 py-1.5 text-xs font-semibold text-foreground/80 hover:text-foreground transition-colors truncate text-start"
              >
                {name}
              </Link>
              {hasChildren && (
                <div
                  className="p-1 me-1 text-muted-foreground/60 transition-all duration-200 shrink-0 cursor-pointer hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-md"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (isExpanded) {
                      setActiveId(null);
                    } else {
                      setActiveId(sub.id);
                    }
                  }}
                >
                  <ChevronDown
                    className={`h-3 w-3 transition-transform duration-200 ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </div>
              )}
            </div>

            {hasChildren && isExpanded && (
              <div className="vertical-submenu mt-0.5 ms-3 ps-3 border-s border-slate-100 dark:border-slate-800 animate-in fade-in duration-150">
                <DesktopSubMenu
                  parentCategoryId={sub.id}
                  categories={categories}
                  brand={brand}
                  lang={lang}
                  close={close}
                  depth={depth + 1}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DesktopStoreNavigation() {
  const { brand, lang, t } = useStorefront();
  const { data = [] } = useQuery({
    queryKey: ["storefront", brand.slug, "categories"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("categories") as any)
        .select("id, name_en, name_ar, parent_id, slug, sort_order")
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const timeoutRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const isSale = (c: any) =>
    /sale|offers?|discount|تنزيل|عروض/i.test(
      `${c.slug ?? ""} ${c.name_en ?? ""} ${c.name_ar ?? ""}`,
    );

  const handleMouseEnter = (id: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setActiveDropdownId(id);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setActiveDropdownId(null);
    }, 300); // 300ms hover-intent delay before unmounting dropdown completely on leave
  };

  // Only direct top-level (parent) categories should be rendered as main navigation items
  const mainCategories = data.filter((c: any) => !c.parent_id);

  return (
    <nav className="hidden border-t border-white/10 md:block overflow-visible">
      <div className="mx-auto flex min-h-14 max-w-7xl items-center justify-center gap-2 flex-wrap px-6 py-2 overflow-visible">
        <Link
          to="/$slug"
          params={{ slug: brand.slug }}
          className="shrink-0 rounded-[var(--radius)] border border-dashed border-current/30 px-5 py-2.5 font-semibold transition hover:-translate-y-0.5 hover:bg-current/10"
        >
          {t("الصفحة الرئيسية", "Home")}
        </Link>
        {mainCategories.map((c: any) => {
          const subs = data.filter((sub: any) => sub.parent_id === c.id);
          const name = lang === "ar" ? c.name_ar || c.name_en : c.name_en || c.name_ar;
          const url = c.slug || c.name_en;
          const hasDropdown = subs.length > 0;
          const isOpen = activeDropdownId === c.id;

          if (hasDropdown) {
            return (
              <div
                key={c.id}
                className="relative group shrink-0 overflow-visible"
                onMouseEnter={() => handleMouseEnter(c.id)}
                onMouseLeave={handleMouseLeave}
              >
                <Link
                  to="/$slug/$category"
                  params={{ slug: brand.slug, category: url }}
                  className={`flex items-center gap-1.5 rounded-[var(--radius)] px-5 py-2.5 text-base font-semibold transition hover:-translate-y-0.5 hover:bg-current/10 ${
                    isSale(c) ? "font-bold text-red-500" : ""
                  }`}
                >
                  <span>{name}</span>
                  <svg
                    className={`h-3.5 w-3.5 opacity-70 transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </Link>
                {/* State-controlled dropdown menu card with unmount-on-exit */}
                {isOpen && (
                  <div className="absolute top-full left-1/2 z-50 pt-2 min-w-[230px] -translate-x-1/2">
                    <div className="rounded-2xl border border-border bg-background p-3 shadow-xl transition-all duration-200 animate-in fade-in-0 slide-in-from-top-1 text-foreground">
                      <DesktopSubMenu
                        parentCategoryId={c.id}
                        categories={data}
                        brand={brand}
                        lang={lang}
                        close={() => setActiveDropdownId(null)}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={c.id}
              to="/$slug/$category"
              params={{ slug: brand.slug, category: url }}
              className={`shrink-0 rounded-[var(--radius)] px-5 py-2.5 text-base transition hover:-translate-y-0.5 hover:bg-current/10 ${
                isSale(c) ? "font-bold text-red-500" : "font-semibold"
              }`}
              onMouseEnter={() => {
                if (timeoutRef.current) {
                  clearTimeout(timeoutRef.current);
                }
                setActiveDropdownId(null);
              }}
            >
              {name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function CartDrawer({ children }: { children: React.ReactNode }) {
  const { cart, cartTotal, currency, lang, t, updateQty, removeFromCart, brand, settings } =
    useStorefront();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const drawerCheckoutBg =
    settings.cart_drawer_checkout_bg ??
    settings.btn_checkout_bg ??
    settings.btn_primary_bg ??
    settings.primary_color;
  const drawerCheckoutFg =
    settings.cart_drawer_checkout_fg ??
    settings.btn_checkout_fg ??
    readableOn(drawerCheckoutBg, "#ffffff");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        side={lang === "ar" ? "left" : "right"}
        dir={lang === "ar" ? "rtl" : "ltr"}
        className={`w-full sm:max-w-md flex flex-col ${lang === "ar" ? "[&>button]:left-auto [&>button]:right-4" : ""}`}
      >
        {open && (
          <>
            <SheetHeader
              className={`${lang === "ar" ? "text-right sm:text-right pr-14" : "text-left sm:text-left pr-14"}`}
            >
              <SheetTitle>{t("سلة التسوق", "Your cart")}</SheetTitle>
            </SheetHeader>

            <div className="flex-1 overflow-auto py-4 space-y-3">
              {cart.length === 0 ? (
                <div className="py-8">
                  <OsEmptyState
                    compact
                    icon={ShoppingBag}
                    title={t("السلة فارغة", "Your cart is empty")}
                    description={t(
                      "لم تقم بإضافة أية منتجات بعد.",
                      "You haven't added any products yet.",
                    )}
                  />
                </div>
              ) : (
                cart.map((item) => {
                  const displayName = pickName(lang, {
                    name: item.name,
                    name_ar: item.name_ar,
                    name_en: item.name_en,
                  });
                  return (
                    <div
                      key={item.cart_line_id}
                      className="flex gap-3 border rounded-lg p-2 items-center"
                    >
                      {item.image ? (
                        <img
                          src={cloudflareImageUrl(item.image, 160)}
                          alt={displayName}
                          className="h-16 w-16 rounded object-cover shrink-0"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded bg-muted shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{displayName}</div>
                        <div className="text-xs text-muted-foreground">
                          {[item.size, item.color, item.fabric].filter(Boolean).join(" · ")}
                        </div>
                        {(item.custom_fields ?? []).length > 0 && (
                          <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                            {item.custom_fields!.map((field) => (
                              <div key={field.key} className="break-words">
                                <span className="font-medium text-foreground/80">
                                  {lang === "ar"
                                    ? field.label_ar || field.label_en || field.key
                                    : field.label_en || field.label_ar || field.key}
                                  :
                                </span>{" "}
                                {field.value.startsWith("http") ? (
                                  <a
                                    href={field.value}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary hover:underline font-medium inline-flex items-center gap-0.5 mt-0.5"
                                  >
                                    <span>
                                      📎 {lang === "ar" ? "تحميل/عرض الملف" : "View File"}
                                    </span>
                                  </a>
                                ) : (
                                  field.value
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        <div
                          className="text-sm font-semibold mt-1"
                          style={{ color: settings.primary_color }}
                        >
                          <span className="flex flex-col items-end">
                            <span>{formatPrice(item.price * item.qty, currency, lang)}</span>
                            {Number(item.original_price || 0) > item.price && (
                              <span className="text-xs text-muted-foreground line-through">
                                {formatPrice(
                                  Number(item.original_price) * item.qty,
                                  currency,
                                  lang,
                                )}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <div className="flex items-center border rounded overflow-hidden">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 rounded-none"
                            onClick={() => updateQty(item.cart_line_id, item.qty - 1)}
                            aria-label="decrease"
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="px-2 text-sm min-w-[24px] text-center font-medium">
                            {item.qty}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 rounded-none"
                            disabled={item.qty >= item.max_stock}
                            onClick={() => updateQty(item.cart_line_id, item.qty + 1)}
                            aria-label="increase"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="flex min-h-11 items-center gap-1 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => removeFromCart(item.cart_line_id)}
                        >
                          <Trash2 className="h-3 w-3" />
                          {t("حذف", "Remove")}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t pt-4 space-y-3">
                <div className="flex justify-between text-lg font-semibold">
                  <span>{t("الإجمالي", "Total")}</span>
                  <span style={{ color: settings.primary_color }}>
                    {formatPrice(cartTotal, currency, lang)}
                  </span>
                </div>
                <Button
                  className="w-full h-12"
                  style={{
                    backgroundColor: drawerCheckoutBg,
                    color: drawerCheckoutFg,
                    borderColor: drawerCheckoutBg,
                  }}
                  onClick={() => {
                    setOpen(false);
                    navigate({ to: "/$slug/checkout", params: { slug: brand.slug } });
                  }}
                >
                  {t("إتمام الشراء", "Checkout")}
                </Button>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SearchBar() {
  const { brand, lang, t, currency } = useStorefront();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(id);
  }, [q]);

  const { data, isFetching } = useQuery({
    queryKey: ["storefront", brand.slug, "live-search", debounced],
    enabled: modalOpen && debounced.length >= 2,
    queryFn: async () => {
      const pattern = `%${debounced.replace(/[%_]/g, (m: string) => `\\${m}`)}%`;
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, name_ar, name_en, category, image_url, media, product_variants(selling_price, original_price)",
        )
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .or(`name.ilike.${pattern},name_ar.ilike.${pattern},name_en.ilike.${pattern}`)
        .limit(8);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        name: string;
        name_ar: string | null;
        name_en: string | null;
        category: string | null;
        image_url: string | null;
        media: Array<{ type: "image" | "video"; url: string }> | null;
        product_variants: Array<{ selling_price: number; original_price: number | null }>;
      }>;
    },
    staleTime: 15_000,
  });

  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ["storefront", brand.slug, "categories"],
    enabled: modalOpen,
  });

  const topCategories = useMemo(() => {
    return categories.filter((c: any) => !c.parent_id).slice(0, 6);
  }, [categories]);

  const results = data ?? [];
  const searchLabel = t("البحث في المتجر", "Search store");
  const searchPlaceholder = t("ابحث عن منتج...", "Search for products...");

  return (
    <>
      {/* Search Input Trigger inside the page headers */}
      <Button
        type="button"
        variant="outline"
        aria-label={searchLabel}
        aria-haspopup="dialog"
        className={`relative flex h-11 w-full justify-start font-normal rounded-[var(--radius)] border bg-background/80 text-foreground shadow-sm transition-colors hover:bg-background ${lang === "ar" ? "pr-9 pl-3" : "pl-9 pr-3"}`}
        style={{
          borderColor: "rgba(128, 128, 128, 0.25)",
        }}
        onClick={() => setModalOpen(true)}
      >
        <Search
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 h-4 w-4 opacity-70 ${lang === "ar" ? "right-3" : "left-3"}`}
        />
        <span className="truncate opacity-80">{searchPlaceholder}</span>
      </Button>

      {/* Premium backdrop-blurred modal dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="sm:max-w-2xl gap-0 p-0 overflow-hidden bg-white/95 dark:bg-neutral-950/95 backdrop-blur-md border border-border shadow-2xl rounded-2xl [&>button]:text-neutral-500 [&>button]:hover:text-neutral-800 [&>button]:dark:text-neutral-400 [&>button]:dark:hover:text-neutral-100 [&>button]:top-5"
          dir={lang === "ar" ? "rtl" : "ltr"}
        >
          <DialogHeader className="p-4 border-b border-border flex flex-row items-center gap-2">
            <Search className="h-5 w-5 opacity-60 shrink-0" />
            <DialogTitle className="sr-only">{t("البحث", "Search")}</DialogTitle>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const query = q.trim();
                if (!query) return;
                setModalOpen(false);
                navigate({
                  to: "/$slug/search",
                  params: { slug: brand.slug },
                  search: { q: query },
                });
              }}
              className="flex-1"
            >
              <input
                id="storefront-search"
                name="storefront-search"
                type="search"
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("اكتب اسم المنتج للبحث السريع...", "Type to search products...")}
                className="w-full bg-transparent border-0 focus:outline-none focus:ring-0 text-base py-1 px-1 font-medium"
              />
            </form>
            {q && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setQ("")}
                aria-label={t("مسح البحث", "Clear search")}
                className="h-8 w-8 rounded-md shrink-0 me-6"
              >
                <X className="h-4 w-4 opacity-70" />
              </Button>
            )}
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4">
            {/* suggestions if query is too short */}
            {debounced.length < 2 && (
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
                  <span>{t("اكتشف الأقسام المميزة", "Explore Featured Categories")}</span>
                </div>
                {topCategories.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {topCategories.map((cat: any) => {
                      const catName =
                        lang === "ar" ? cat.name_ar || cat.name_en : cat.name_en || cat.name_ar;
                      return (
                        <Link
                          key={cat.id}
                          to="/$slug/$category"
                          params={{ slug: brand.slug, category: cat.slug }}
                          onClick={() => setModalOpen(false)}
                          className="px-3.5 py-1.5 rounded-full border border-border text-xs font-medium bg-neutral-100 hover:bg-neutral-200/60 dark:bg-neutral-900 dark:hover:bg-neutral-800 transition-all cursor-pointer"
                        >
                          {catName}
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {t(
                      "ابدأ بكتابة حرفين أو أكثر لبدء البحث الفوري.",
                      "Type 2 or more characters to start instant searching.",
                    )}
                  </div>
                )}
              </div>
            )}

            {/* active search results or loader */}
            {debounced.length >= 2 && (
              <div className="space-y-2">
                {isFetching && (
                  <div className="space-y-3 py-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3 animate-pulse">
                        <div className="h-12 w-12 rounded bg-neutral-200 dark:bg-neutral-850 shrink-0" />
                        <div className="flex-1 space-y-2 min-w-0">
                          <div className="h-4 bg-neutral-200 dark:bg-neutral-850 rounded w-2/3" />
                          <div className="h-3 bg-neutral-200 dark:bg-neutral-850 rounded w-1/4" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!isFetching && results.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {t("لا توجد نتائج مطابقة", "No products found matching your query")}
                  </div>
                )}

                {!isFetching && results.length > 0 && (
                  <ul className="divide-y divide-border">
                    {results.map((p) => {
                      const displayName = pickName(lang, p);
                      const price = p.product_variants?.[0]?.selling_price ?? 0;
                      const oldPrice = Number(p.product_variants?.[0]?.original_price ?? 0);
                      const imageUrl =
                        p.image_url || p.media?.find((item) => item.type === "image")?.url || null;
                      const discount =
                        oldPrice > price ? Math.round((1 - price / oldPrice) * 100) : 0;

                      return (
                        <li key={p.id} className="first:pt-0 last:pb-0 py-2.5">
                          <Link
                            to="/$slug/product/$id"
                            params={{ slug: brand.slug, id: p.id }}
                            onClick={() => {
                              setModalOpen(false);
                              setQ("");
                            }}
                            className="flex items-center gap-3 group"
                          >
                            <div className="h-12 w-12 shrink-0 rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-border overflow-hidden relative">
                              {imageUrl && (
                                <img
                                  src={cloudflareImageUrl(imageUrl, 120)}
                                  alt={displayName}
                                  className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                              )}
                            </div>
                            <div className="flex-1 min-w-0 text-start">
                              <div
                                className="text-sm font-semibold truncate group-hover:text-amber-500 transition-colors"
                                style={{ color: "var(--sf-heading)" }}
                              >
                                {displayName}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                                  {formatPrice(Number(price), currency, lang)}
                                </span>
                                {oldPrice > Number(price) && (
                                  <>
                                    <span className="line-through text-[10px]">
                                      {formatPrice(oldPrice, currency, lang)}
                                    </span>
                                    {discount > 0 && (
                                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-red-100 text-red-700 dark:bg-red-950/45 dark:text-red-400 font-medium">
                                        {discount}% {t("خصم", "OFF")}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

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

  const companyTitle =
    (isAr ? settings.footer_company_title_ar : settings.footer_company_title_en) ||
    (isAr ? settings.footer_company_title_en : settings.footer_company_title_ar) ||
    (isAr ? "الشركة" : "Company");

  const helpTitle =
    (isAr ? settings.footer_help_title_ar : settings.footer_help_title_en) ||
    (isAr ? settings.footer_help_title_en : settings.footer_help_title_ar) ||
    (isAr ? "المساعدة" : "Help");

  return (
    <footer
      className="border-t mt-8 sm:mt-10 py-5 sm:py-6"
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
            <nav className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 text-[11px] opacity-75 uppercase tracking-widest">
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
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 my-2 py-2.5 px-4 text-[11px] font-medium opacity-90 border-y border-white/10 rounded-xl bg-white/5 backdrop-blur-xs max-w-3xl w-full">
            <div className="inline-flex items-center gap-1.5">
              <span className="text-amber-500/90">✨</span>
              <span>{t("تصاميم حصرية خاصّة بنا", "Exclusive In-House Designs")}</span>
            </div>
            <div className="hidden sm:inline text-white/20">•</div>
            <div className="inline-flex items-center gap-1.5">
              <span className="text-emerald-500/90">💸</span>
              <span>{t("الدفع كاش عند الاستلام أو بنفت بي", "Cash on Arrival & BenefitPay")}</span>
            </div>
            <div className="hidden sm:inline text-white/20">•</div>
            <div className="inline-flex items-center gap-1.5">
              <span className="text-sky-500/90">🔒</span>
              <span>{t("موقع آمن ومشفّر 256-Bit", "256-Bit SSL Encrypted")}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] opacity-70 border-t border-border pt-2 w-full max-w-2xl">
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
                className="h-7 w-auto object-contain"
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
          <div className="grid grid-cols-2 gap-2 my-3 text-xs">
            <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xs p-3 flex flex-col items-center justify-center text-center gap-1.5 min-h-[72px]">
              <span className="text-amber-400 text-base">✨</span>
              <span className="font-medium text-[11px] leading-tight">
                {t("تصاميم حصرية خاصّة بنا", "Exclusive In-House Designs")}
              </span>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xs p-3 flex flex-col items-center justify-center text-center gap-1.5 min-h-[72px]">
              <span className="text-emerald-400 text-base">💸</span>
              <span className="font-medium text-[11px] leading-tight">
                {t("الدفع كاش عند الاستلام أو بنفت بي", "Cash on Arrival & BenefitPay")}
              </span>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xs p-3 flex flex-col items-center justify-center text-center gap-1.5 min-h-[72px]">
              <span className="text-sky-400 text-base">🔒</span>
              <span className="font-medium text-[11px] leading-tight">
                {t("موقع آمن ومشفّر 256-Bit", "256-Bit SSL Encrypted")}
              </span>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xs p-3 flex flex-col items-center justify-center text-center gap-1.5 min-h-[72px]">
              <span className="text-purple-400 text-base">🚚</span>
              <span className="font-medium text-[11px] leading-tight">
                {t("توصيل سريع ومباشر", "Fast Local Delivery")}
              </span>
            </div>
          </div>

          {/* Section 5: Bottom Bar */}
          <div className="pt-3 border-t border-white/10 flex flex-col items-center gap-1.5 text-[11px] opacity-75">
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
          <div className="mt-4 p-3 bg-destructive/10 text-xs font-mono text-left rounded overflow-auto max-h-40 text-destructive border border-destructive/20 select-all">
            <div className="font-bold mb-1">Diagnostic Info:</div>
            {errorMsg}
          </div>
        )}
      </Card>
    </div>
  );
}
