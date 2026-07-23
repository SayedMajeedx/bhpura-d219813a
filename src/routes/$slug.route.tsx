import { createFileRoute, Outlet, Link, notFound, useNavigate, useLocation, useRouter } from "@tanstack/react-router";
import React, { useEffect, useRef, useState } from "react";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ShoppingBag, Languages, Minus, Plus, Trash2, X, User, Search, Menu, Home, PackageSearch, FileText, LogIn, Heart, Grid2X2, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cloudflareImageUrl } from "@/lib/media-delivery";
import { faviconType, resolveBrandFavicon, useDynamicFavicon } from "@/lib/favicon";
import { StorefrontAnalytics } from "@/components/storefront-analytics";

export const Route = createFileRoute("/$slug")({
  staleTime: 5 * 60_000,
  preloadStaleTime: 5 * 60_000,
  headers: () => ({
    "Cache-Control": "public, max-age=10, stale-while-revalidate=60",
  }),
  loader: async ({ params }) => {
    const { data: baseBrand, error: brandErr } = await supabase
      .from("brands")
      .select("id, slug, name_en, name_ar, logo_url, is_active, hero_media, primary_color, about_ar, about_en")
      .eq("slug", params.slug)
      .eq("is_active", true)
      .maybeSingle();
    if (brandErr || !baseBrand) throw notFound();

    // SEO is deliberately non-critical. An older PostgREST schema cache may
    // not know these additive columns yet, but that must never take a live
    // storefront offline.
    const [{ data: seoBrand }, { data: settings }, { data: benefitSettings }, { data: trackingSettings }] = await Promise.all([
      supabase
        .from("brands")
        .select("meta_title, meta_description")
        .eq("id", baseBrand.id)
        .maybeSingle(),
      supabase.from("brand_public_settings").select("*").eq("brand_id", baseBrand.id).maybeSingle(),
      supabase.rpc("get_public_benefit_settings" as any, { p_brand_id: baseBrand.id }),
      (supabase as any).from("brand_tracking_settings").select("google_analytics_enabled, google_analytics_id, meta_pixel_enabled, meta_pixel_id, consent_required").eq("brand_id", baseBrand.id).maybeSingle(),
    ]);
    const brand = {
      ...baseBrand,
      meta_title: (seoBrand as any)?.meta_title ?? null,
      meta_description: (seoBrand as any)?.meta_description ?? null,
    };

    const s = settings as any;
    const rawPages = Array.isArray(s?.pages) ? s.pages : [];
    const normalizedPages = rawPages.map((p: any, index: number) => ({
      slug: p?.slug ?? `page-${index + 1}`,
      title_ar: p?.title_ar ?? null,
      title_en: p?.title_en ?? null,
      content_ar: p?.content_ar ?? null,
      content_en: p?.content_en ?? null,
      image_url: p?.image_url ?? null,
      menu_icon_url: p?.menu_icon_url ?? null,
      // Preserve the legacy layout (image above content) until an admin explicitly changes it.
      image_position: p?.image_position === "bottom" ? "bottom" : "top",
      meta_title: p?.meta_title ?? null,
      meta_description: p?.meta_description ?? null,
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
      // Never inherit the invoice accent here. Storefront color is independent.
      primary_color: s?.storefront_accent_color ?? brand.primary_color ?? "#8b6f47",
      storefront_accent_color: s?.storefront_accent_color ?? brand.primary_color ?? "#8b6f47",
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
            fee: Number(z.fee ?? 0)
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
      background: rawHero && !Array.isArray(rawHero) && rawHero.background
        ? rawHero.background
        : legacyHero[0] ?? null,
      slides: rawHero && !Array.isArray(rawHero) && Array.isArray(rawHero.slides)
        ? rawHero.slides.slice(0, 5)
        : [],
    };
    return {
      brand: { ...brand, hero_media: heroConfig } as unknown as Brand,
      settings: safeSettings,
    };
  },
  head: ({ loaderData }) => {
    const b = loaderData?.brand;
    const settings = loaderData?.settings;
    if (!b) return { meta: [{ title: "Storefront" }] };
    const title = b.meta_title || settings?.business_name || `${b.name_en} — Online Store`;
    const desc = b.meta_description || `Shop ${b.name_en}${b.name_ar ? " / " + b.name_ar : ""} online.`;
    const img = settings?.logo_url || b.logo_url || "https://boutq.store/og-placeholder.png";
    const favicon = resolveBrandFavicon(settings?.favicon_url, settings?.logo_url ?? b.logo_url);
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
      links: [{ rel: "icon", href: favicon, ...(faviconType(favicon) ? { type: faviconType(favicon) } : {}) }],
    };
  },
  component: StorefrontLayout,
  errorComponent: StorefrontError,
  notFoundComponent: StorefrontError,
});

function StorefrontLayout() {
  const { brand, settings } = Route.useLoaderData();
  useDynamicFavicon(settings.favicon_url, settings.logo_url ?? brand.logo_url);
  return (
    <StorefrontProvider brand={brand} settings={settings}>
      <StorefrontAnalytics />
      <StoreShell />
    </StorefrontProvider>
  );
}

function StoreShell() {
  const { brand, settings, lang } = useStorefront();
  const qc = useQueryClient();
  const router = useRouter();

  // Realtime: refresh product / variant queries when inventory changes for this brand
  useEffect(() => {
    const channel = supabase
      .channel(`storefront:${brand.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products", filter: `brand_id=eq.${brand.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["storefront", brand.slug] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "product_variants", filter: `brand_id=eq.${brand.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["storefront", brand.slug] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "business_settings", filter: `brand_id=eq.${brand.id}` },
        () => {
          void router.invalidate();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [brand.id, brand.slug, qc, router]);

  const primary = settings.primary_color;
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
  const cartDrawerCheckoutFg = settings.cart_drawer_checkout_fg ?? readableOn(cartDrawerCheckoutBg, btnCheckoutFg);
  const headingColor = settings.heading_color ?? primary;
  const linkColor = settings.link_color ?? primary;
  const storefrontFont = lang === "ar" ? settings.storefront_font_ar : settings.storefront_font_en;
  const storefrontFontUrl = lang === "ar" ? settings.storefront_font_ar_url : settings.storefront_font_en_url;
  const storefrontFontFamily = storefrontFontUrl ? "StorefrontCustomFont" : storefrontFont;

  useEffect(() => {
    if (storefrontFontUrl || !storefrontFont) return;
    const globallyLoaded = new Set(["Inter", "Cormorant Garamond", "Tajawal"]);
    if (globallyLoaded.has(storefrontFont)) return;
    const id = `storefront-font-${storefrontFont.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(storefrontFont).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
  }, [storefrontFont, storefrontFontUrl]);

  return (
    <div
      className="storefront-shell min-h-screen flex flex-col"
      style={
        {
          backgroundColor: settings.background_color,
          color: settings.text_color,
          ["--brand" as any]: primary,
          ["--sf-header-bg" as any]: headerBg,
          ["--sf-header-fg" as any]: headerFg,
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
      {storefrontFontUrl && <style>{`@font-face { font-family: 'StorefrontCustomFont'; src: url('${storefrontFontUrl}'); font-display: swap; }`}</style>}
      <div className="sticky top-0 z-40">
        <AnnouncementBar />
        <StoreHeader />
        <DesktopStoreNavigation />
      </div>
      <main className="flex-1">
        <Outlet />
      </main>
      <StoreFooter />
      <WhatsAppFab />
    </div>
  );
}

function WhatsAppFab() {
  const { settings, lang, brand } = useStorefront();
  if (!settings.whatsapp_enabled) return null;
  const digits = (settings.whatsapp_number ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const text = lang === "ar"
    ? `مرحباً! لدي استفسار عن متجر ${brand.name_ar || brand.name_en}`
    : `Hi! I have a question about ${brand.name_en}`;
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp"
      className={`fixed z-50 bottom-24 md:bottom-5 ${lang === "ar" ? "left-5" : "right-5"} h-14 w-14 rounded-full grid place-items-center shadow-lg hover:scale-110 active:scale-95`}
      style={{
        backgroundColor: "#25D366",
        color: "#fff",
        transition: "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s ease, bottom 0.4s cubic-bezier(0.25, 1, 0.5, 1)",
        willChange: "transform",
      }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7" aria-hidden="true">
        <path d="M20.52 3.48A11.94 11.94 0 0 0 12.06 0C5.5 0 .2 5.3.2 11.86c0 2.09.55 4.13 1.6 5.93L0 24l6.38-1.67a11.86 11.86 0 0 0 5.68 1.45h.01c6.56 0 11.86-5.3 11.86-11.86 0-3.17-1.23-6.15-3.41-8.44ZM12.07 21.5h-.01a9.63 9.63 0 0 1-4.9-1.34l-.35-.21-3.79.99 1.01-3.7-.23-.38a9.63 9.63 0 0 1-1.48-5.15c0-5.32 4.33-9.65 9.66-9.65 2.58 0 5 1 6.83 2.83a9.6 9.6 0 0 1 2.82 6.82c0 5.32-4.33 9.65-9.66 9.65Zm5.29-7.23c-.29-.15-1.71-.85-1.98-.94-.27-.1-.46-.15-.66.14-.19.29-.75.94-.92 1.13-.17.19-.34.22-.63.07-.29-.14-1.23-.45-2.35-1.44-.87-.77-1.46-1.72-1.63-2.01-.17-.29-.02-.44.13-.59.13-.13.29-.34.44-.51.14-.17.19-.29.29-.48.1-.19.05-.36-.02-.51-.07-.14-.66-1.58-.9-2.17-.24-.58-.48-.5-.66-.51h-.56c-.19 0-.51.07-.77.36-.27.29-1.02 1-1.02 2.44 0 1.44 1.05 2.83 1.2 3.02.14.19 2.07 3.15 5.02 4.42.7.3 1.24.48 1.66.62.7.22 1.33.19 1.83.11.56-.08 1.71-.7 1.96-1.38.24-.68.24-1.26.17-1.38-.07-.12-.26-.19-.55-.34Z"/>
      </svg>
    </a>
  );
}

function StoreHeader() {
  const { brand, settings, lang, setLang, t, cartCount, session, isStoreMember, wishlistCount } = useStorefront();
  const displayName = lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en;
  const align = settings.logo_align ?? "left";
  const logoSize = settings.logo_size || 40;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header
      className="w-full border-b backdrop-blur"
      style={{
        backgroundColor: "var(--sf-header-bg)",
        color: "var(--sf-header-fg)",
        borderColor: "rgba(0,0,0,0.08)",
      }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2 flex flex-col gap-2">
        <div className="h-14 flex items-center gap-3 justify-between">
          <Link
            to="/$slug"
            params={{ slug: brand.slug }}
            className={`flex min-h-11 items-center gap-3 min-w-0 ${align === "center" ? "sm:mx-auto" : ""}`}
            style={{ color: "var(--sf-header-fg)" }}
          >
            {settings.logo_url && (
              <img
                src={cloudflareImageUrl(settings.logo_url, 320)}
                alt={displayName}
                className="shrink-0 object-contain"
                style={{
                  height: logoSize,
                  maxHeight: logoSize,
                  width: "auto",
                  maxWidth: logoSize * 3,
                }}
              />
            )}

            <Button asChild variant="ghost" size="sm" className="relative min-h-11 min-w-11 gap-1 hover:bg-black/5" style={{ color: "var(--sf-header-fg)" }}>
              <Link to="/$slug/wishlist" params={{ slug: brand.slug }}>
                <Heart className="h-5 w-5" />
                <span className="hidden sm:inline">{t("المفضلة", "Wishlist")}</span>
                {wishlistCount > 0 && <span className="absolute -top-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-semibold" style={{ backgroundColor: "var(--sf-btn-primary-bg)", color: "var(--sf-btn-primary-fg)" }}>{wishlistCount}</span>}
              </Link>
            </Button>
            {settings.show_header_name && <span
              className="font-display text-lg sm:text-xl truncate"
              style={{ color: "var(--sf-heading)" }}
            >
              {displayName}
            </span>}
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
              className="min-h-11 min-w-11 gap-1 hover:bg-black/5"
              style={{ color: "var(--sf-header-fg)" }}
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              aria-label="Language switch"
            >
              <Languages className="h-4 w-4" />
              <span className="hidden sm:inline">{lang === "ar" ? "English" : "العربية"}</span>
            </Button>

            {session && isStoreMember ? (
              <Button asChild variant="ghost" size="sm" className="min-h-11 min-w-11 gap-1 hover:bg-black/5" style={{ color: "var(--sf-header-fg)" }}>
                <Link to="/$slug/account" params={{ slug: brand.slug }} title={session.user?.email ?? ""}>
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline max-w-[120px] truncate">{t("لوحة التحكم", "Dashboard")}</span>
                </Link>
              </Button>
            ) : (
              <Button asChild variant="ghost" size="sm" className="min-h-11 min-w-11 gap-1 hover:bg-black/5" style={{ color: "var(--sf-header-fg)" }}>
                <Link to="/$slug/auth" params={{ slug: brand.slug }} search={{ redirect: mounted ? window.location.pathname + window.location.search : "" }}>
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("دخول", "Sign in")}</span>
                </Link>
              </Button>
            )}

            <CartDrawer>
              <Button variant="ghost" size="sm" className="relative min-h-11 min-w-11 gap-1 hover:bg-black/5" style={{ color: "var(--sf-header-fg)" }}>
                <ShoppingBag className="h-5 w-5" />
                <span className="hidden sm:inline">{t("السلة", "Cart")}</span>
                {cartCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold grid place-items-center"
                    style={{ backgroundColor: "var(--sf-btn-primary-bg)", color: "var(--sf-btn-primary-fg)" }}
                  >
                    {cartCount}
                  </span>
                )}
              </Button>
            </CartDrawer>
          </div>
        </div>

        {/* Mobile: keep Menu beside Search in the sticky header. */}
        <div dir="ltr" className="flex items-center gap-2 pb-1 md:hidden">
          <div className={lang === "ar" ? "order-2 shrink-0" : "order-1 shrink-0"}>
            <MobileStorefrontDropdown />
          </div>
          <div className={lang === "ar" ? "order-1 min-w-0 flex-1" : "order-2 min-w-0 flex-1"}>
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
  const text = lang === "ar" ? settings.announcement_text_ar || settings.announcement_text_en : settings.announcement_text_en || settings.announcement_text_ar;
  const key = `announcement-dismissed:${brand.id}:${text ?? ""}`;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(key) === "1") {
        setDismissed(true);
      }
    } catch {}
  }, [key]);
  const audienceOk = settings.announcement_audience === "all" || (settings.announcement_audience === "guest" ? !session : Boolean(session));
  const relative = pathname.replace(`/${brand.slug}`, "") || "/";
  const scopeOk = settings.announcement_scope === "all" || (settings.announcement_scope === "home" && relative === "/") || (settings.announcement_scope === "checkout" && relative.startsWith("/checkout")) || (settings.announcement_scope === "catalog" && !relative.startsWith("/checkout") && !relative.startsWith("/account") && !relative.startsWith("/auth"));
  if (!settings.announcement_enabled || !text || dismissed || !audienceOk || !scopeOk) return null;
  return <div className="relative px-12 py-2 text-center text-sm" style={{ backgroundColor: settings.announcement_bg, color: settings.announcement_fg, fontWeight: settings.announcement_bold ? 700 : 400, fontStyle: settings.announcement_italic ? "italic" : "normal" }}>
    <span>{text}</span>
    {settings.announcement_dismissible && <button type="button" className="absolute end-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full hover:bg-white/15" aria-label="Dismiss announcement" onClick={() => { try { sessionStorage.setItem(key, "1"); } catch {} setDismissed(true); }}><X className="h-4 w-4" /></button>}
  </div>;
}

function MobileStorefrontDropdown() {
  const { brand, settings, lang, t } = useStorefront();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const menuBackground = settings.menu_bg || settings.background_color || "#ffffff";
  const menuText = settings.menu_fg || settings.text_color || "#111111";
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
    if (detailsRef.current) detailsRef.current.open = false;
  };
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (detailsRef.current?.open && !detailsRef.current.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);
  const pages = settings.pages
    .map((page, index) => ({
      key: `${page.slug}-${index}`,
      slug: page.slug,
      title: lang === "ar" ? page.title_ar || page.title_en : page.title_en || page.title_ar,
      iconUrl: page.menu_icon_url,
    }))
    .filter((page) => settings.menu_show_pages && Boolean(page.title));

  return (
    <details
      ref={detailsRef}
      dir={lang === "ar" ? "rtl" : "ltr"}
      className="group relative"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-lg border px-3 font-medium shadow-sm transition-colors hover:bg-black/5 [&::-webkit-details-marker]:hidden">
        <Grid2X2 className="h-4 w-4" />
        <span>{t("القائمة", "Menu")}</span>
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div
        className={`absolute top-full z-50 mt-2 max-h-[min(58dvh,26rem)] w-[min(88vw,23rem)] touch-pan-y overflow-y-auto overscroll-contain rounded-2xl border p-3 shadow-2xl ${lang === "ar" ? "right-0" : "left-0"}`}
        style={{
          backgroundColor: menuBackground,
          color: menuText,
          WebkitOverflowScrolling: "touch",
          fontSize: "16px",
          lineHeight: "1.35",
        }}
      >
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-65">
          <Grid2X2 className="h-4 w-4" />
          {t("الأقسام", "Categories")}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {categories.filter((c: any) => !c.parent_id).map((category: any) => {
            const categorySlug = category.slug || category.name_en;
            const label = lang === "ar" ? category.name_ar || category.name_en : category.name_en || category.name_ar;
            const subs = categories.filter((sub: any) => sub.parent_id === category.id);
            const isExpanded = !!expandedCategories[category.id];

            const toggleExpand = (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              setExpandedCategories((prev) => ({ ...prev, [category.id]: !prev[category.id] }));
            };

            return (
              <div key={category.id} className="space-y-1.5">
                <div className="flex items-center gap-1 rounded-xl border bg-background transition-colors hover:bg-black/5 pr-1.5 rtl:pr-0 rtl:pl-1.5">
                  <Link
                    to="/$slug/$category"
                    params={{ slug: brand.slug, category: categorySlug }}
                    onClick={close}
                    className="flex min-h-12 flex-1 items-center gap-3 px-2.5 py-2"
                  >
                    <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                      {category.menu_icon_url ? <img src={cloudflareImageUrl(category.menu_icon_url, 80)} width={20} height={20} loading="lazy" decoding="async" alt="" className="h-5 w-5 object-contain" /> : <Grid2X2 className="h-4 w-4 opacity-50" />}
                    </div>
                    <span className="truncate font-medium text-start" style={{ fontSize: "0.95rem", lineHeight: "1.3rem" }}>{label}</span>
                  </Link>
                  {subs.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={toggleExpand}
                      className="h-9 px-2.5 shrink-0 rounded-lg hover:bg-black/5 font-mono text-sm font-bold tracking-tight"
                      aria-expanded={isExpanded}
                      aria-label={t("توسيع", "Expand")}
                    >
                      {isExpanded ? "[-]" : "[+]"}
                    </Button>
                  )}
                </div>

                {subs.length > 0 && isExpanded && (
                  <div className="ms-4 ps-3 border-s border-muted-foreground/20 space-y-1.5 animate-in slide-in-from-top-1 duration-200">
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
                    {subs.map((sub: any) => {
                      const subSlug = sub.slug || sub.name_en;
                      const subLabel = lang === "ar" ? sub.name_ar || sub.name_en : sub.name_en || sub.name_ar;
                      return (
                        <Link
                          key={sub.id}
                          to="/$slug/$category"
                          params={{ slug: brand.slug, category: subSlug }}
                          onClick={close}
                          className="flex min-h-10 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-black/5 text-muted-foreground hover:text-foreground"
                        >
                          <div className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md bg-muted/60">
                            {sub.menu_icon_url ? <img src={cloudflareImageUrl(sub.menu_icon_url, 80)} width={16} height={16} loading="lazy" decoding="async" alt="" className="h-4 w-4 object-contain" /> : <Grid2X2 className="h-3.5 w-3.5 opacity-40" />}
                          </div>
                          <span className="truncate text-xs font-medium">{subLabel}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {pages.length > 0 && (
          <>
            <div className="my-3 border-t" />
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-65">
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
                    {page.iconUrl ? <img src={cloudflareImageUrl(page.iconUrl, 80)} alt="" className="h-5 w-5 object-contain" /> : <FileText className="h-4 w-4 opacity-60" />}
                  </span>
                  <span className="truncate" style={{ fontSize: "0.95rem", lineHeight: "1.3rem" }}>{page.title}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </details>
  );
}

export function StorefrontMenu({ navigation = false }: { navigation?: boolean } = {}) {
  const { brand, settings, lang, t, session, isStoreMember } = useStorefront();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const displayName = lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en;
  const menuTitle = (lang === "ar" ? settings.menu_title_ar || settings.menu_title_en : settings.menu_title_en || settings.menu_title_ar) || displayName;
  const menuBg = settings.menu_bg || settings.header_bg || settings.background_color || "#ffffff";
  const menuFg = settings.menu_fg || readableOn(menuBg, settings.text_color);
  const pageLinks = settings.pages
    .map((page, index) => ({
      index: index + 1,
      slug: page.slug,
      title: lang === "ar" ? (page.title_ar || page.title_en) : (page.title_en || page.title_ar),
    }))
    .filter((page) => settings.menu_show_pages && Boolean(page.title));
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant={navigation ? "outline" : "ghost"} size={navigation ? "default" : "sm"} className={`${navigation ? "h-11 shrink-0 rounded-xl border-dashed px-5 font-semibold shadow-sm hover:-translate-y-0.5 hover:shadow-md" : "hover:bg-black/5"} gap-2 transition-all duration-200`} style={{ color: navigation ? undefined : "var(--sf-header-fg)" }} aria-label={t("القائمة", "Menu")}>
          <Menu className="h-5 w-5" />
          <span className={navigation ? "inline" : "hidden lg:inline"}>{navigation ? t("كل الأقسام", "All categories") : t("القائمة", "Menu")}</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side={lang === "ar" ? "right" : "left"}
        dir={lang === "ar" ? "rtl" : "ltr"}
        className={`flex h-full w-[min(90vw,400px)] flex-col overflow-hidden border-0 p-0 shadow-2xl [&>button]:top-5 [&>button]:grid [&>button]:h-10 [&>button]:w-10 [&>button]:place-items-center [&>button]:rounded-full [&>button]:border [&>button]:bg-background/90 [&>button]:opacity-100 [&>button]:shadow-sm ${lang === "ar" ? "[&>button]:left-5 [&>button]:right-auto" : "[&>button]:right-5"}`}
        style={{ backgroundColor: menuBg, color: menuFg, zIndex: 60 }}
      >
        {open && (
          <>
            <div className="relative shrink-0 overflow-hidden border-b px-6 pb-6 pt-7 pe-20" style={{ borderColor: "rgba(127,127,127,.18)" }}>
              <div className="pointer-events-none absolute -end-16 -top-24 h-52 w-52 rounded-full opacity-[0.08]" style={{ backgroundColor: settings.primary_color }} />
              <div className="relative flex min-w-0 items-center gap-4">
                {settings.logo_url && <div className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/5 p-1"><img src={cloudflareImageUrl(settings.logo_url, 320)} alt={displayName} className="block max-h-full max-w-full object-contain" style={{ width: "auto", height: "auto" }} /></div>}
                <div className="min-w-0 flex-1 text-start"><SheetTitle className="truncate text-2xl font-display" style={{ color: menuFg }}>{menuTitle}</SheetTitle><p className="mt-1 truncate text-xs opacity-65">{t("اكتشف المتجر", "Explore our store")}</p></div>
              </div>
            </div>
            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4" style={{ scrollbarWidth: "none" }}>
              {settings.menu_show_home && <Link to="/$slug" params={{ slug: brand.slug }} onClick={close} className="flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 text-start transition-colors hover:bg-black/5"><Home className="h-5 w-5 shrink-0" /><span className="min-w-0 truncate">{t("الرئيسية", "Home")}</span></Link>}
              {session && isStoreMember ? <>
                {settings.menu_show_account && <Link to="/$slug/account" params={{ slug: brand.slug }} onClick={close} className="flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 text-start transition-colors hover:bg-black/5"><User className="h-5 w-5 shrink-0" /><span className="min-w-0 truncate">{t("حسابي", "My account")}</span></Link>}
                {settings.menu_show_orders && <Link to="/$slug/account" params={{ slug: brand.slug }} onClick={close} className="flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 text-start transition-colors hover:bg-black/5"><PackageSearch className="h-5 w-5 shrink-0" /><span className="min-w-0 truncate">{t("طلباتي", "My orders")}</span></Link>}
              </> : settings.menu_show_account && <Link to="/$slug/auth" params={{ slug: brand.slug }} search={{ redirect: mounted ? window.location.pathname + window.location.search : "" }} onClick={close} className="flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 text-start transition-colors hover:bg-black/5"><LogIn className="h-5 w-5 shrink-0" /><span className="min-w-0 truncate">{t("تسجيل الدخول", "Sign in")}</span></Link>}
              {pageLinks.length > 0 && <div className="my-3 border-t" style={{ borderColor: "rgba(127,127,127,.18)" }} />}
              {pageLinks.map((page) => <Link key={page.index} to="/$slug/$category" params={{ slug: brand.slug, category: page.slug }} onClick={close} className="flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 text-start transition-colors hover:bg-black/5"><FileText className="h-5 w-5 shrink-0" /><span className="min-w-0 truncate">{page.title}</span></Link>)}
            </nav>
            <div className="m-4 mt-2 shrink-0 rounded-2xl border p-5 text-start text-sm" style={{ backgroundColor: menuBg, borderColor: `${settings.primary_color}55` }}>
              <p className="font-medium" style={{ color: menuFg }}>{t("تسوق بكل سهولة", "Shopping made simple")}</p>
              <p className="mt-1 opacity-65">{t("تصفح المنتجات وتابع طلباتك من مكان واحد.", "Browse products and follow your orders in one place.")}</p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
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

  const isSale = (c: any) => /sale|offers?|discount|تنزيل|عروض/i.test(`${c.slug ?? ""} ${c.name_en ?? ""} ${c.name_ar ?? ""}`);

  // Only direct top-level (parent) categories should be rendered as main navigation items
  const mainCategories = data.filter((c: any) => !c.parent_id);

  return (
    <nav className="hidden border-b bg-[var(--sf-header-bg)] text-[var(--sf-header-fg)] shadow-sm md:block overflow-visible">
      <div className="mx-auto flex min-h-14 max-w-7xl items-center justify-center gap-2 flex-wrap px-6 py-2 overflow-visible">
        <Link
          to="/$slug"
          params={{ slug: brand.slug }}
          className="shrink-0 rounded-xl border border-dashed px-5 py-2.5 font-semibold transition hover:-translate-y-0.5 hover:bg-black/5"
        >
          {t("الصفحة الرئيسية", "Home")}
        </Link>
        {mainCategories.map((c: any) => {
          const subs = data.filter((sub: any) => sub.parent_id === c.id);
          const name = lang === "ar" ? c.name_ar || c.name_en : c.name_en || c.name_ar;
          const url = c.slug || c.name_en;

          if (subs.length > 0) {
            return (
              <div key={c.id} className="relative group shrink-0 overflow-visible">
                <Link
                  to="/$slug/$category"
                  params={{ slug: brand.slug, category: url }}
                  className={`flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-base font-semibold transition hover:-translate-y-0.5 hover:bg-black/5 ${
                    isSale(c) ? "font-bold text-red-600" : ""
                  }`}
                >
                  <span>{name}</span>
                  <svg
                    className="h-3.5 w-3.5 opacity-70 transition-transform group-hover:rotate-180"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </Link>
                {/* Custom premium dropdown menu card with hover-friendly bridging padding */}
                <div className="absolute top-full left-1/2 z-50 pt-2 hidden min-w-[210px] -translate-x-1/2 group-hover:block">
                  <div className="rounded-xl border border-slate-100 bg-background p-2 shadow-lg transition-all duration-200 animate-in fade-in-0 slide-in-from-top-1">
                    {subs.map((sub: any) => {
                      const subName = lang === "ar" ? sub.name_ar || sub.name_en : sub.name_en || sub.name_ar;
                      const subUrl = sub.slug || sub.name_en;
                      return (
                        <Link
                          key={sub.id}
                          to="/$slug/$category"
                          params={{ slug: brand.slug, category: subUrl }}
                          className="block rounded-lg px-4 py-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-all hover:bg-muted"
                        >
                          {subName}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <Link
              key={c.id}
              to="/$slug/$category"
              params={{ slug: brand.slug, category: url }}
              className={`shrink-0 rounded-xl px-5 py-2.5 text-base transition hover:-translate-y-0.5 hover:bg-black/5 ${
                isSale(c) ? "font-bold text-red-600" : "font-semibold"
              }`}
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
  const drawerCheckoutBg = settings.cart_drawer_checkout_bg ?? settings.btn_checkout_bg ?? settings.btn_primary_bg ?? settings.primary_color;
  const drawerCheckoutFg = settings.cart_drawer_checkout_fg ?? settings.btn_checkout_fg ?? readableOn(drawerCheckoutBg, "#ffffff");

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
            <SheetHeader className={`${lang === "ar" ? "text-right sm:text-right pr-14" : "text-left sm:text-left pr-14"}`}>
              <SheetTitle>{t("سلة التسوق", "Your cart")}</SheetTitle>
            </SheetHeader>

            <div className="flex-1 overflow-auto py-4 space-y-3">
              {cart.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  {t("السلة فارغة", "Your cart is empty")}
                </div>
              ) : (
                cart.map((item) => {
                  const displayName = pickName(lang, { name: item.name, name_ar: item.name_ar, name_en: item.name_en });
                  return (
                  <div key={item.cart_line_id} className="flex gap-3 border rounded-lg p-2 items-center">
                    {item.image ? (
                      <img src={cloudflareImageUrl(item.image, 160)} alt={displayName} className="h-16 w-16 rounded object-cover shrink-0" />
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
                                {lang === "ar" ? (field.label_ar || field.label_en || field.key) : (field.label_en || field.label_ar || field.key)}:
                              </span>{" "}
                              {field.value.startsWith("http") ? (
                                <a href={field.value} target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium inline-flex items-center gap-0.5 mt-0.5">
                                  <span>📎 {lang === "ar" ? "تحميل/عرض الملف" : "View File"}</span>
                                </a>
                              ) : (
                                field.value
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="text-sm font-semibold mt-1" style={{ color: settings.primary_color }}>
                        <span className="flex flex-col items-end">
                          <span>{formatPrice(item.price * item.qty, currency, lang)}</span>
                          {Number(item.original_price || 0) > item.price && <span className="text-xs text-muted-foreground line-through">{formatPrice(Number(item.original_price) * item.qty, currency, lang)}</span>}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <div className="flex items-center border rounded">
                        <button
                          className="grid h-11 w-11 place-items-center"
                          onClick={() => updateQty(item.cart_line_id, item.qty - 1)}
                          aria-label="decrease"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="px-2 text-sm min-w-[24px] text-center">{item.qty}</span>
                        <button
                          className="grid h-11 w-11 place-items-center disabled:opacity-40"
                          disabled={item.qty >= item.max_stock}
                          onClick={() => updateQty(item.cart_line_id, item.qty + 1)}
                          aria-label="increase"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <button
                        className="flex min-h-11 items-center gap-1 px-2 text-xs text-red-600"
                        onClick={() => removeFromCart(item.cart_line_id)}
                      >
                        <Trash2 className="h-3 w-3" />
                        {t("حذف", "Remove")}
                      </button>
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
                  <span style={{ color: settings.primary_color }}>{formatPrice(cartTotal, currency, lang)}</span>
                </div>
                <Button
                  className="w-full h-12"
                  style={{ backgroundColor: drawerCheckoutBg, color: drawerCheckoutFg, borderColor: drawerCheckoutBg }}
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
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(id);
  }, [q]);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["storefront", brand.slug, "live-search", debounced],
    enabled: debounced.length >= 2,
    queryFn: async () => {
      const pattern = `%${debounced.replace(/[%_]/g, (m: string) => `\\${m}`)}%`;
      const { data, error } = await supabase
        .from("products")
        .select("id, name, name_ar, name_en, category, image_url, media, product_variants(selling_price, original_price)")
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .or(`name.ilike.${pattern},name_ar.ilike.${pattern},name_en.ilike.${pattern}`)
        .limit(8);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string; name: string; name_ar: string | null; name_en: string | null; category: string | null; image_url: string | null;
        media: Array<{ type: "image" | "video"; url: string }> | null;
        product_variants: Array<{ selling_price: number; original_price: number | null }>;
      }>;
    },
    staleTime: 15_000,
  });

  const results = data ?? [];
  const showDropdown = focused && open && debounced.length >= 2;

  return (
    <div ref={containerRef} className="relative w-full">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const query = q.trim();
          if (!query) return;
          setOpen(false);
          navigate({ to: "/$slug/search", params: { slug: brand.slug }, search: { q: query } });
        }}
        className="relative w-full"
      >
        <Search className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 opacity-60 ${lang === "ar" ? "right-3" : "left-3"}`} />
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { setFocused(true); setOpen(true); }}
          onBlur={() => setFocused(false)}
          placeholder={t("ابحث عن منتج...", "Search for products...")}
          className={`h-11 bg-white/70 dark:bg-black/20 border-black/10 ${lang === "ar" ? "pr-9" : "pl-9"}`}
          inputMode="search"
          enterKeyHint="search"
          aria-label={t("ابحث عن منتج", "Search products")}
        />
      </form>

      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-full mt-2 z-50 rounded-lg border shadow-xl bg-white dark:bg-neutral-900 max-h-[70vh] overflow-auto"
          style={{ borderColor: "rgba(0,0,0,0.08)" }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {isFetching && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t("جارٍ البحث...", "Searching...")}
            </div>
          )}
          {!isFetching && results.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t("لا توجد نتائج مطابقة", "No products found")}
            </div>
          )}
          {!isFetching && results.length > 0 && (
            <ul className="divide-y" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
              {results.map((p) => {
                const displayName = pickName(lang, p);
                const price = p.product_variants?.[0]?.selling_price ?? 0;
                const oldPrice = Number(p.product_variants?.[0]?.original_price ?? 0);
                const imageUrl = p.image_url || p.media?.find((item) => item.type === "image")?.url || null;
                return (
                  <li key={p.id}>
                    <Link
                      to="/$slug/product/$id"
                      params={{ slug: brand.slug, id: p.id }}
                      onClick={() => { setOpen(false); setQ(""); }}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <div className="h-12 w-12 shrink-0 rounded bg-muted overflow-hidden">
                        {imageUrl && (
                          <img src={cloudflareImageUrl(imageUrl, 120)} alt={displayName} className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{displayName}</div>
                        <div className="flex items-baseline gap-2 text-xs" style={{ color: "var(--sf-heading)" }}>
                          <span>{formatPrice(Number(price), currency, lang)}</span>{oldPrice > Number(price) && <span className="text-[10px] text-muted-foreground line-through">{formatPrice(oldPrice, currency, lang)}</span>}
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
  );
}

function StoreFooter() {
  const { settings, t, brand, lang } = useStorefront();
  const pageLinks = settings.pages
    .map((p, i) => ({
      idx: i + 1,
      slug: p.slug,
      title: lang === "ar" ? (p.title_ar || p.title_en) : (p.title_en || p.title_ar),
      hasContent: Boolean(p.title_ar || p.title_en),
    }))
    .filter((p) => p.hasContent && p.title);
  const socials = settings.socials ?? [];

  return (
    <footer
      className="border-t mt-16 pt-6 pb-[100px] md:py-8"
      style={{
        borderColor: "rgba(0,0,0,0.08)",
        backgroundColor: "var(--sf-footer-bg)",
        color: "var(--sf-footer-fg)",
      }}
    >
      <div 
        className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col gap-6 text-sm" 
        style={{ color: "var(--sf-footer-fg)" }}
      >
        {/* Row 1: Structural stacking where Navigation/Socials sit on top of Brand/Notes on mobile */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-6">
          
          {/* Brand & Footer Note (Bottom of Row 1 on mobile, Left/Start on desktop) */}
          <div className="flex flex-col items-center md:items-start gap-2 order-2 md:order-1 text-center md:text-start">
            {settings.show_footer_name && (
              <div className="font-semibold text-base" style={{ color: "var(--sf-footer-fg)" }}>
                {lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en}
              </div>
            )}
            {settings.footer_note && (
              <div className="text-xs opacity-80 max-w-md text-center md:text-start leading-relaxed">{settings.footer_note}</div>
            )}
          </div>

          {/* Navigation Menus and Social Links Section (Top of Row 1 on mobile, Right/End on desktop) */}
          {(socials.length > 0 || pageLinks.length > 0) && (
            <div className="flex flex-col items-center md:items-end gap-6 order-1 md:order-2 w-full md:w-auto">
              {pageLinks.length > 0 && (
                <nav className="grid grid-cols-2 md:flex md:flex-row gap-x-4 gap-y-3.5 md:gap-y-1 md:gap-x-5 text-sm font-medium tracking-wider w-full md:w-auto text-start rtl:text-right">
                  {pageLinks.map((p) => (
                    <Link
                      key={p.idx}
                      to="/$slug/$category"
                      params={{ slug: brand.slug, category: p.slug }}
                      className="inline-flex min-h-[44px] py-1 items-center justify-start md:justify-center hover:underline underline-offset-4 transition-colors w-full md:w-auto text-start rtl:text-right"
                      style={{ color: "var(--sf-footer-fg)" }}
                    >
                      {p.title}
                    </Link>
                  ))}
                </nav>
              )}
              {socials.length > 0 && (
                <nav className="grid grid-cols-2 md:flex md:flex-row gap-x-4 gap-y-3.5 md:gap-y-1 md:gap-x-5 text-xs opacity-80 uppercase tracking-widest w-full md:w-auto text-start rtl:text-right">
                  {socials.map((s, i) => (
                    <a
                      key={`${s.name}-${i}`}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[44px] py-1 items-center justify-start md:justify-center hover:underline underline-offset-4 transition-colors w-full md:w-auto text-start rtl:text-right"
                      style={{ color: "var(--sf-footer-fg)" }}
                    >
                      {s.name}
                    </a>
                  ))}
                </nav>
              )}
            </div>
          )}
        </div>

        {/* Separator Divider */}
        <hr className="opacity-10 border-current" />

        {/* Row 2: Bottom Copyright and Privacy Policy Links (Always sits at the absolute bottom of the footer container) */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs opacity-75 text-center md:text-start">
          <span>© {new Date().getFullYear()} — {t("جميع الحقوق محفوظة", "All rights reserved")}</span>
          {settings.analytics_consent_required && (
            <button 
              type="button" 
              className="underline underline-offset-4 hover:opacity-100 min-h-[44px] py-2 inline-flex items-center justify-center" 
              style={{ color: "var(--sf-footer-fg)" }} 
              onClick={() => window.dispatchEvent(new Event("boutq:privacy-preferences"))}
            >
              {t("خيارات الخصوصية", "Privacy choices")}
            </button>
          )}
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

  const errorMsg = error instanceof Error 
    ? error.message 
    : typeof error === "object" && error !== null 
      ? (error.message || JSON.stringify(error)) 
      : String(error || "");

  return (
    <div className="min-h-screen grid place-items-center p-8">
      <Card className="p-8 text-center max-w-md">
        <div className="mx-auto mb-4 h-10 w-10 rounded-full bg-muted grid place-items-center">
          <X className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-display mb-2">Storefront unavailable</h1>
        <p className="text-muted-foreground mb-2">This brand doesn't have an active storefront yet.</p>
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
