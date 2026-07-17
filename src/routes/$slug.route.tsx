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
import { faviconType, resolveBrandFavicon, useDynamicFavicon } from "@/lib/favicon";
import { StorefrontAnalytics } from "@/components/storefront-analytics";

export const Route = createFileRoute("/$slug")({
  staleTime: 5 * 60_000,
  preloadStaleTime: 5 * 60_000,
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
      vat_percentage: Number(s?.vat_percentage ?? 10),
      home_promo_cards: Array.isArray(s?.home_promo_cards) ? s.home_promo_cards : [],
      pages: normalizedPages,
      socials: normalizedSocials,
      show_footer_name: s?.show_footer_name ?? true,
      show_hero_title: s?.show_hero_title ?? true,
      show_hero_about: s?.show_hero_about ?? true,
      hero_title_color: s?.hero_title_color ?? null,
      hero_title_size: Number(s?.hero_title_size ?? 40),
      hero_title_align: s?.hero_title_align === "center" ? "center" : s?.hero_title_align === "right" ? "right" : "left",
      hero_title_ar: s?.hero_title_ar ?? null,
      hero_title_en: s?.hero_title_en ?? null,
      font_family_storefront: s?.font_family_storefront ?? "system-ui",
      menu_bg: s?.menu_bg ?? null,
      menu_fg: s?.menu_fg ?? null,
      menu_show_pages: s?.menu_show_pages ?? true,
      footer_bg: s?.footer_bg ?? null,
      footer_fg: s?.footer_fg ?? null,
      announcements: Array.isArray(s?.announcements) ? s.announcements : [],
      show_best_sellers: s?.show_best_sellers ?? true,
      show_new_arrivals: s?.show_new_arrivals ?? true,
      new_arrivals_title_ar: s?.new_arrivals_title_ar ?? null,
      new_arrivals_title_en: s?.new_arrivals_title_en ?? null,
      best_sellers_title_ar: s?.best_sellers_title_ar ?? null,
      best_sellers_title_en: s?.best_sellers_title_en ?? null,
      global_sale_badges_enabled: s?.global_sale_badges_enabled ?? true,
      google_analytics_enabled: Boolean(trackingSettings?.google_analytics_enabled),
      google_analytics_id: trackingSettings?.google_analytics_id || null,
      meta_pixel_enabled: Boolean(trackingSettings?.meta_pixel_enabled),
      meta_pixel_id: trackingSettings?.meta_pixel_id || null,
      analytics_consent_required: Boolean(trackingSettings?.consent_required),
    };

    return {
      brand: brand as Brand,
      settings: safeSettings,
      faviconUrl: resolveBrandFavicon(brand as Brand, safeSettings),
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const brand = loaderData.brand;
    const title = brand.meta_title || brand.name_en;
    const description = brand.meta_description || brand.about_en || `Explore the ${brand.name_en} storefront.`;
    const image = brand.logo_url || undefined;
    const favicon = loaderData.faviconUrl;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        ...(image ? [{ property: "og:image", content: image }] : []),
        { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        ...(image ? [{ name: "twitter:image", content: image }] : []),
      ],
      links: favicon ? [{ rel: "icon", href: favicon, ...(faviconType(favicon) ? { type: faviconType(favicon) } : {}) }] : [],
    };
  },
  component: StorefrontLayout,
});

function StorefrontLayout() {
  const { brand, settings } = Route.useLoaderData();
  const location = useLocation();
  const isSearch = location.pathname.endsWith("/search") || location.pathname.includes("/search/");
  useDynamicFavicon(resolveBrandFavicon(brand, settings));

  const accent = settings.primary_color;
  const text = settings.text_color;
  const bg = settings.background_color;
  const headerBg = settings.menu_bg ?? bg;
  const headerFg = settings.menu_fg ?? text;
  const footerBg = settings.footer_bg ?? settings.background_color ?? "#ffffff";
  const footerFg = settings.footer_fg ?? readableOn(footerBg, settings.text_color);

  const fontStyle = settings.font_family_storefront && settings.font_family_storefront !== "system-ui"
    ? `@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(settings.font_family_storefront)}:wght@300;400;500;600;700;800&display=swap');
       :root { --sf-font: '${settings.font_family_storefront}', sans-serif; }`
    : `:root { --sf-font: system-ui, -apple-system, sans-serif; }`;

  return (
    <StorefrontProvider brand={brand} settings={settings}>
      <style dangerouslySetInnerHTML={{ __html: fontStyle }} />
      <div
        className="min-h-screen flex flex-col font-sans selection:bg-neutral-900/10"
        style={{
          backgroundColor: bg,
          color: text,
          fontFamily: "var(--sf-font)",
          ["--sf-brand" as any]: accent,
          ["--sf-text" as any]: text,
          ["--sf-bg" as any]: bg,
          ["--sf-heading" as any]: text,
          ["--sf-link" as any]: accent,
          ["--sf-btn-primary-bg" as any]: accent,
          ["--sf-btn-primary-fg" as any]: readableOn(accent),
          ["--sf-header-bg" as any]: headerBg,
          ["--sf-header-fg" as any]: headerFg,
          ["--sf-footer-bg" as any]: footerBg,
          ["--sf-footer-fg" as any]: footerFg,
        }}
      >
        <StorefrontAnalytics />
        <StoreAnnouncementBar />
        <StoreHeader />
        <main className="flex-1">
          <Outlet />
        </main>
        {!isSearch && <StoreFooter />}
        <StoreNavigationMobile />
      </div>
    </StorefrontProvider>
  );
}

function StoreAnnouncementBar() {
  const { settings, lang } = useStorefront();
  const visible = settings.announcements.filter(x => x && x.is_active && (x.text_ar || x.text_en));
  if (!visible.length) return null;

  return (
    <div className="bg-neutral-900 text-white text-center py-2 px-4 text-xs font-medium tracking-wide">
      <div className="mx-auto max-w-7xl">
        {visible.map((item, index) => {
          const text = lang === "ar" ? item.text_ar || item.text_en : item.text_en || item.text_ar;
          return (
            <div key={index} className={index === 0 ? "block" : "hidden"}>
              {text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StoreHeader() {
  const { brand, settings, cart, t, lang } = useStorefront();
  const [cartOpen, setCartOpen] = useState(false);
  const totalItems = cart.reduce((total, item) => total + item.quantity, 0);

  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-md bg-opacity-90"
      style={{
        backgroundColor: "var(--sf-header-bg)",
        color: "var(--sf-header-fg)",
        borderColor: "rgba(0,0,0,0.06)",
      }}
    >
      <div className="mx-auto max-w-7xl px-4 h-16 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/$slug" params={{ slug: brand.slug }} className="flex items-center gap-3">
            {settings.logo_url ? (
              <img src={settings.logo_url} alt={brand.name_en} className="h-10 w-10 rounded-lg object-contain" />
            ) : (
              <span className="font-display text-lg font-bold" style={{ color: "var(--sf-heading)" }}>
                {lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en}
              </span>
            )}
          </Link>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <StoreSearchDropdown />

          <Link
            to="/$slug/wishlist"
            params={{ slug: brand.slug }}
            aria-label={t("المفضلة", "Wishlist")}
            className="p-2 hover:opacity-85"
          >
            <Heart className="h-5 w-5" />
          </Link>

          <StoreLanguageToggle />

          <Sheet open={cartOpen} onOpenChange={setCartOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="p-2 relative hover:opacity-85"
                aria-label={t("سلة التسوق", "Shopping cart")}
              >
                <ShoppingBag className="h-5 w-5" />
                {totalItems > 0 && (
                  <span className="absolute -top-1 -end-1 bg-neutral-900 text-white rounded-full text-[10px] font-bold h-4 w-4 flex items-center justify-center">
                    {totalItems}
                  </span>
                )}
              </button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md p-0 flex flex-col h-full bg-background" side={lang === "ar" ? "left" : "right"}>
              <SheetHeader className="px-6 py-4 border-b">
                <SheetTitle className="text-lg font-semibold flex items-center justify-between">
                  <span>{t("سلة التسوق", "Your Cart")}</span>
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <StoreCartList onClose={() => setCartOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function StoreLanguageToggle() {
  const { lang, setLang } = useStorefront();
  const toggle = () => setLang(lang === "ar" ? "en" : "ar");

  return (
    <button
      type="button"
      onClick={toggle}
      className="p-2 flex items-center gap-1.5 hover:opacity-85 text-xs font-semibold uppercase tracking-wider"
      aria-label={lang === "ar" ? "Switch to English" : "تغيير اللغة للعربية"}
    >
      <Languages className="h-4 w-4" />
      <span className="hidden sm:inline">{lang === "ar" ? "EN" : "العربية"}</span>
    </button>
  );
}

function StoreNavigationMobile() {
  const { brand, t, cart } = useStorefront();
  const location = useLocation();
  const totalItems = cart.reduce((total, item) => total + item.quantity, 0);

  const navItems = [
    {
      to: "/$slug",
      params: { slug: brand.slug },
      label: t("الرئيسية", "Home"),
      icon: Home,
      exact: true,
    },
    {
      to: "/$slug/search",
      params: { slug: brand.slug },
      label: t("البحث", "Search"),
      icon: Search,
    },
    {
      to: "/$slug/wishlist",
      params: { slug: brand.slug },
      label: t("المفضلة", "Wishlist"),
      icon: Heart,
    },
    {
      to: "/$slug/account",
      params: { slug: brand.slug },
      label: t("حسابي", "Account"),
      icon: User,
    },
  ];

  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur-md border-t h-16 z-30 grid grid-cols-4 items-center justify-items-center text-neutral-600 shadow-lg">
      {navItems.map((item, index) => {
        const Icon = item.icon;
        const active = item.exact
          ? location.pathname === `/${brand.slug}` || location.pathname === `/${brand.slug}/`
          : location.pathname.includes(item.to.replace("/$slug", `/${brand.slug}`));

        return (
          <Link
            key={index}
            to={item.to as any}
            params={item.params as any}
            className={`flex flex-col items-center gap-1 text-[10px] font-medium transition-all ${
              active ? "text-neutral-950 scale-105" : "hover:text-neutral-900"
            }`}
          >
            <div className="relative">
              <Icon className="h-5 w-5" />
              {item.label === t("السلة", "Cart") && totalItems > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-neutral-950 text-white rounded-full text-[8px] font-extrabold h-3.5 w-3.5 flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </div>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function StoreCartList({ onClose }: { onClose: () => void }) {
  const { cart, updateQuantity, removeFromCart, currency, lang, t, settings, brand } = useStorefront();
  const router = useRouter();

  const subtotal = cart.reduce((sum, item) => {
    const price = item.variant.selling_price;
    return sum + price * item.quantity;
  }, 0);

  if (cart.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground space-y-4">
        <div className="h-16 w-16 rounded-full bg-neutral-100 flex items-center justify-center">
          <ShoppingBag className="h-8 w-8 text-neutral-400" />
        </div>
        <p className="text-sm">{t("سلتك فارغة حالياً.", "Your cart is currently empty.")}</p>
        <Button onClick={onClose} variant="outline" className="w-full">
          {t("تصفح المنتجات", "Browse products")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full justify-between pb-8">
      <div className="flex-1 divide-y max-h-[50vh] overflow-y-auto pr-1">
        {cart.map((item) => {
          const displayName = pickName(lang, item.product);
          const price = item.variant.selling_price;
          const originalPrice = item.variant.original_price;
          const size = item.variant.size;
          const color = item.variant.color;

          return (
            <div key={item.variant.id} className="py-4 flex gap-4">
              <div className="h-20 w-16 shrink-0 rounded-lg bg-neutral-100 overflow-hidden">
                {item.product.image_url && (
                  <img src={item.product.image_url} alt={displayName} className="h-full w-full object-cover" />
                )}
              </div>
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="text-sm font-semibold line-clamp-1">{displayName}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-2">
                    {size && <span>{t("المقاس", "Size")}: {size}</span>}
                    {color && <span>{t("اللون", "Color")}: {color}</span>}
                  </p>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center border rounded-lg h-8">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.variant.id, item.quantity - 1)}
                      className="px-2 h-full flex items-center justify-center hover:bg-neutral-50 active:bg-neutral-100"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="px-3 text-sm font-semibold select-none">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.variant.id, item.quantity + 1)}
                      className="px-2 h-full flex items-center justify-center hover:bg-neutral-50 active:bg-neutral-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.variant.id)}
                    className="p-1 text-neutral-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="text-end shrink-0">
                <span className="text-sm font-semibold block">{formatPrice(price * item.quantity, currency, lang)}</span>
                {originalPrice && originalPrice > price && (
                  <span className="text-xs text-muted-foreground line-through block">
                    {formatPrice(originalPrice * item.quantity, currency, lang)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t pt-4 space-y-4 bg-background mt-4">
        <div className="flex items-center justify-between text-sm font-semibold">
          <span>{t("المجموع الفرعي", "Subtotal")}</span>
          <span className="text-base font-bold">{formatPrice(subtotal, currency, lang)}</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-normal">
          {settings.vat_inclusive 
            ? t(`شامل ضريبة القيمة المضافة (${settings.vat_percentage}%).`, `VAT inclusive (${settings.vat_percentage}%).`)
            : t("الأسعار لا تشمل رسوم التوصيل والضرائب الأخرى.", "Prices exclude delivery fees and additional duties.")}
        </p>
        <Button
          onClick={() => {
            onClose();
            void router.navigate({ to: "/$slug/checkout", params: { slug: brand.slug } });
          }}
          className="w-full h-11 rounded-full font-semibold shadow-sm text-sm"
          style={{ backgroundColor: "var(--sf-btn-primary-bg)", color: "var(--sf-btn-primary-fg)" }}
        >
          {t("الاستمرار للدفع", "Proceed to checkout")}
        </Button>
      </div>
    </div>
  );
}

function StoreSearchDropdown() {
  const { brand, lang, t, currency } = useStorefront();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["storefront", brand.slug, "search-instant", q],
    queryFn: async () => {
      const value = q.trim();
      if (!value) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id, name, name_ar, name_en, image_url, media, product_variants(selling_price, original_price)")
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .or(`name.ilike.%${value}%,name_ar.ilike.%${value}%,name_en.ilike.%${value}%`)
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    enabled: q.trim().length > 1,
    staleTime: 60_000,
  });

  const showDropdown = open && q.trim().length > 1;

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!q.trim()) return;
          setOpen(false);
          void navigate({ to: "/$slug/search", params: { slug: brand.slug }, search: { q: q.trim() } });
        }}
        className="relative w-40 sm:w-56"
      >
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={t("بحث...", "Search...")}
          className="ps-9 h-9 rounded-full text-xs"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
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
                          <img src={imageUrl} alt={displayName} className="h-full w-full object-cover" />
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
      className="border-t mt-16 py-6 md:py-8"
      style={{
        borderColor: "rgba(0,0,0,0.08)",
        backgroundColor: "var(--sf-footer-bg)",
        color: "var(--sf-footer-fg)",
      }}
    >
      <div 
        className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col md:flex-row md:justify-between md:items-center gap-6 text-sm text-center md:text-start" 
        style={{ color: "var(--sf-footer-fg)" }}
      >
        {/* Brand, Copyright and Notes Section */}
        <div className="flex flex-col items-center md:items-start gap-2">
          {settings.show_footer_name && (
            <div className="font-semibold text-base" style={{ color: "var(--sf-footer-fg)" }}>
              {lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en}
            </div>
          )}
          {settings.footer_note && (
            <div className="text-xs opacity-80 max-w-md">{settings.footer_note}</div>
          )}
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-1 text-xs opacity-75">
            <span>© {new Date().getFullYear()} — {t("جميع الحقوق محفوظة", "All rights reserved")}</span>
            {settings.analytics_consent_required && (
              <button 
                type="button" 
                className="underline underline-offset-4 hover:opacity-100" 
                style={{ color: "var(--sf-footer-fg)" }} 
                onClick={() => window.dispatchEvent(new Event("boutq:privacy-preferences"))}
              >
                {t("خيارات الخصوصية", "Privacy choices")}
              </button>
            )}
          </div>
        </div>

        {/* Navigation Menus and Social Links Section */}
        {(socials.length > 0 || pageLinks.length > 0) && (
          <div className="flex flex-col items-center md:items-end gap-3">
            {pageLinks.length > 0 && (
              <nav className="flex flex-wrap justify-center md:justify-end gap-x-5 gap-y-1 text-xs font-medium uppercase tracking-wider">
                {pageLinks.map((p) => (
                  <Link
                    key={p.idx}
                    to="/$slug/$category"
                    params={{ slug: brand.slug, category: p.slug }}
                    className="inline-flex min-h-9 items-center hover:underline underline-offset-4 transition-colors"
                    style={{ color: "var(--sf-footer-fg)" }}
                  >
                    {p.title}
                  </Link>
                ))}
              </nav>
            )}
            {socials.length > 0 && (
              <nav className="flex flex-wrap justify-center md:justify-end gap-x-5 gap-y-1 text-xs opacity-80 uppercase tracking-widest">
                {socials.map((s, i) => (
                  <a
                    key={`${s.name}-${i}`}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 items-center hover:underline underline-offset-4 transition-colors"
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
    </footer>
  );
}

function StorefrontError() {
  return (
    <div className="min-h-screen grid place-items-center p-8">
      <Card className="p-8 text-center max-w-md">
        <div className="mx-auto mb-4 h-10 w-10 rounded-full bg-muted grid place-items-center">
          <X className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-display mb-2">Storefront unavailable</h1>
        <p className="text-muted-foreground">This brand doesn't have an active storefront yet.</p>
      </Card>
    </div>
  );
}
