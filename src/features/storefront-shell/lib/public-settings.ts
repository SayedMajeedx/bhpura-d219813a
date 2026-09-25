import type { Brand, PublicSettings } from "@/lib/storefront-context";
import { defaultStorefrontTypography, normalizeTypography } from "@/lib/typography";
import type { TrustBadgesConfig } from "@/lib/trust-badges";
import { normalizeModuleOverrides, normalizeVertical } from "@/lib/store-profile";
import type { fetchStorefrontPageData } from "@/lib/data/storefront";

type PageData = NonNullable<Awaited<ReturnType<typeof fetchStorefrontPageData>>>;

/**
 * The storefront's public settings from the page data: every setting with
 * its default, pages and socials cleaned up, the editorial sections (with the
 * legacy trending banner), typography (legacy font columns win when set),
 * trust badges (stored as JSON text or an object), shipping zones, Benefit
 * and tracking settings.
 */
export function publicSettingsFromPageData(brand: Brand, pageData: PageData): PublicSettings {
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

  const rawTrustBadges = s?.trust_badges;
  let normalizedTrustBadges: TrustBadgesConfig | null = null;
  if (rawTrustBadges) {
    let parsed = rawTrustBadges;
    if (typeof rawTrustBadges === "string") {
      try {
        parsed = JSON.parse(rawTrustBadges);
      } catch {
        parsed = null;
      }
    }
    if (parsed && typeof parsed === "object") {
      normalizedTrustBadges = {
        enabled: parsed.enabled !== false,
        items: Array.isArray(parsed.items)
          ? parsed.items.map((item: any, idx: number) => ({
              id: String(item?.id ?? `badge-${idx}`),
              icon: String(item?.icon ?? "ShieldCheck"),
              text_ar: String(item?.text_ar ?? ""),
              text_en: String(item?.text_en ?? ""),
              color: String(item?.color ?? "amber"),
              enabled: item?.enabled !== false,
            }))
          : [],
      };
    }
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
          countries: Array.isArray(z.countries) ? z.countries : [],
          pricing_type: (z.pricing_type || "flat") as "flat" | "per_piece" | "bundle",
          fee: Number(z.fee ?? 0),
          bundle_size: Number(z.bundle_size || (z.pricing_type === "bundle" ? 2 : 1)),
          estimate_ar: String(z.estimate_ar || ""),
          estimate_en: String(z.estimate_en || ""),
          allowed_payment_methods: Array.isArray(z.allowed_payment_methods)
            ? (z.allowed_payment_methods as Array<"cod" | "card" | "benefit">)
            : ["card", "benefit"],
        }));
      } catch (_e) {
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
    storefront_mode: s?.storefront_mode === "catalog" ? "catalog" : "shop",
    catalog_show_prices: s?.catalog_show_prices ?? true,
    catalog_inquiry_message_en: s?.catalog_inquiry_message_en ?? null,
    catalog_inquiry_message_ar: s?.catalog_inquiry_message_ar ?? null,
    store_vertical: normalizeVertical(s?.store_vertical ?? "fashion"),
    store_modules: normalizeModuleOverrides(s?.store_modules),
    fit_profiles: s?.fit_profiles ?? null,
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
    trust_badges: normalizedTrustBadges,
    storefront_design_version: s?.storefront_design_version ?? 1,
    trust_bar_enabled: s?.trust_bar_enabled ?? true,
    trust_bar_position: s?.trust_bar_position ?? "below_hero",
    brand_story_enabled: s?.brand_story_enabled ?? true,
    brand_story_title_ar: s?.brand_story_title_ar ?? null,
    brand_story_title_en: s?.brand_story_title_en ?? null,
    brand_story_subtitle_ar: s?.brand_story_subtitle_ar ?? null,
    brand_story_subtitle_en: s?.brand_story_subtitle_en ?? null,
    brand_story_description_ar: s?.brand_story_description_ar ?? null,
    brand_story_description_en: s?.brand_story_description_en ?? null,
    brand_story_image_url: s?.brand_story_image_url ?? null,
    social_proof_enabled: s?.social_proof_enabled ?? true,
    recently_viewed_enabled: s?.recently_viewed_enabled ?? s?.recent_views_enabled ?? true,
    recent_views_enabled: s?.recently_viewed_enabled ?? s?.recent_views_enabled ?? true,
    product_card_hover_image: s?.product_card_hover_image ?? true,
    product_card_color_dots: s?.product_card_color_dots ?? true,
    product_card_quick_add: s?.product_card_quick_add ?? true,
    quick_view_enabled: s?.quick_view_enabled ?? true,
    pdp_image_zoom: s?.pdp_image_zoom ?? true,
    category_filters_enabled: s?.category_filters_enabled ?? true,
    back_in_stock_enabled: s?.back_in_stock_enabled ?? true,
    fabric_care_ar: s?.fabric_care_ar ?? null,
    fabric_care_en: s?.fabric_care_en ?? null,
    shipping_returns_ar: s?.shipping_returns_ar ?? null,
    shipping_returns_en: s?.shipping_returns_en ?? null,
    newsletter_enabled: s?.newsletter_enabled ?? true,
    newsletter_title_ar: s?.newsletter_title_ar ?? null,
    newsletter_title_en: s?.newsletter_title_en ?? null,
    footer_show_payment_methods: s?.footer_show_payment_methods ?? true,
    footer_layout: s?.footer_layout ?? "columns",
    motion_enabled: s?.motion_enabled ?? true,
    hero_overlay_strength: s?.hero_overlay_strength ?? 45,
    hero_title_color_v2: s?.hero_title_color_v2 ?? null,
    hero_layout: s?.hero_layout ?? "full_bleed",
    hero_height_desktop: s?.hero_height_desktop ?? "standard",
    hero_aspect_mobile: s?.hero_aspect_mobile ?? "portrait_4_5",
    hero_show_arrows: s?.hero_show_arrows ?? true,
    pdp_gallery_aspect_ratio: s?.pdp_gallery_aspect_ratio ?? "3:4",
    hero_video_fit: s?.hero_video_fit ?? "contain_ambient",
  };
  return safeSettings;
}

/**
 * The hero config: `{ background, slides }` (up to 5 slides), or the legacy
 * array whose first item is the background.
 */
export function heroConfigFrom(heroMedia: unknown) {
  const rawHero = heroMedia as any;
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
  return heroConfig;
}
