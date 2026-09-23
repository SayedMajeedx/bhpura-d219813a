import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { DirectionProvider } from "@radix-ui/react-direction";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { trackStorefrontEvent } from "@/lib/storefront-analytics";
import { westernNumeralLocale } from "@/lib/format";
import { decodeCartSharePayload, fetchSharedCartByCode } from "@/lib/cart-sharing";
import { toast } from "sonner";
import { syncStorefrontCartActivity } from "@/lib/abandoned-carts.functions";
import { getExistingCartSessionId, getOrCreateCartSessionId } from "@/lib/abandoned-cart-session";
import { isCatalogMode, type StorefrontMode } from "@/lib/storefront-mode";
import {
  resolveStoreModules,
  type StoreVertical,
  type StoreModuleOverrides,
} from "@/lib/store-profile";
import type { ShippingZone } from "@/lib/shipping";
import type { TrustBadgesConfig } from "@/lib/trust-badges";
import {
  resolveFitProfiles,
  type FitProfileDefinition,
  type SizeGuide,
} from "@/lib/addons/addon-presets";
import { AddonsProvider } from "@/components/addons/AddonsProvider";
import { modulesFromAddons } from "@/lib/addons/addon-compat";
import type { BrandAddonRow } from "@/lib/addons/addon-types";

export type StoreLang = "ar" | "en";
export type HomePromoCard = {
  title_en: string;
  title_ar: string;
  subtitle_en: string;
  subtitle_ar: string;
  image_url: string;
  href: string;
  background_color: string;
  text_color: string;
};

export type EditorialSectionConfig = {
  enabled: boolean;
  banner_image_url: string;
  background_color: string;
  background_image_url: string;
};

export type HomepageEditorialSections = Record<
  "best" | "sale" | "trending",
  EditorialSectionConfig
>;
export type HeroMediaItem = {
  type: "image" | "video";
  url: string;
  posterUrl?: string;
  /** Intrinsic width / height, recorded at upload. */
  aspect?: number;
  /** Optional phone-specific cut, shown below 640px instead of `url`. */
  mobileUrl?: string;
  mobilePosterUrl?: string;
  mobileAspect?: number;
};
export type HeroContentSlide = {
  id: string;
  type: "text" | "image" | "video";
  title_en: string;
  title_ar: string;
  body_en: string;
  body_ar: string;
  media_url: string;
  media_url_en?: string;
  media_url_ar?: string;
  media_stream_uid_en?: string;
  media_stream_uid_ar?: string;
  media_iframe_url_en?: string;
  media_iframe_url_ar?: string;
  media_poster_url?: string;
  media_poster_url_en?: string;
  media_poster_url_ar?: string;
  /** Intrinsic width / height of each language's media, recorded at upload. */
  media_aspect?: number;
  media_aspect_en?: number;
  media_aspect_ar?: number;
  /** Optional phone-specific cut, shown below 640px instead of the main media. */
  media_url_mobile_en?: string;
  media_url_mobile_ar?: string;
  media_poster_url_mobile_en?: string;
  media_poster_url_mobile_ar?: string;
  media_aspect_mobile_en?: number;
  media_aspect_mobile_ar?: number;
  /** Focal point (0–100 %) kept in view whenever the media has to be cropped. */
  focal_x?: number;
  focal_y?: number;
  button_en: string;
  button_ar: string;
  button_href: string;
  title_size?: number;
  align?: "start" | "center" | "end";
};
export type HeroMediaConfig = { background: HeroMediaItem | null; slides: HeroContentSlide[] };

export type Brand = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string | null;
  logo_url: string | null;
  hero_media: HeroMediaConfig;
  primary_color: string | null;
  about_ar: string | null;
  about_en: string | null;
  meta_title: string | null;
  meta_description: string | null;
};

export type PublicSettings = {
  brand_id: string;
  business_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  currency: string;
  primary_color: string;
  storefront_accent_color: string;
  text_color: string;
  background_color: string;
  cod_enabled: boolean;
  card_enabled: boolean;
  benefit_enabled: boolean;
  benefit_qr_url: string | null;
  benefit_account_number: string | null;
  footer_note: string | null;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  digital_delivery_enabled: boolean;
  delivery_fee: number;
  delivery_estimate_enabled?: boolean;
  delivery_estimate_ar?: string | null;
  delivery_estimate_en?: string | null;
  // Theme customizer
  logo_size: number;
  footer_logo_size?: number;
  logo_align: "left" | "center" | "right";
  show_header_name: boolean;
  show_hero_title: boolean;
  show_hero_about: boolean;
  show_footer_name: boolean;
  storefront_font_en: string;
  storefront_font_ar: string;
  storefront_font_en_url: string | null;
  storefront_font_ar_url: string | null;
  storefront_typography: import("@/lib/typography").TypographyConfig;
  storefront_radius?: string | null;
  header_glass?: boolean | null;
  badge_accent?: string | null;
  secondary_banner_parallax_enabled: boolean;
  secondary_banner_parallax_mobile_enabled: boolean;
  secondary_banner_parallax_breakpoint: number;
  trending_banner_background_url: string | null;
  category_banner_background_url: string | null;
  hero_title_en: string | null;
  hero_title_ar: string | null;
  hero_title_size: number;
  hero_title_color: string | null;
  hero_title_align: "start" | "center" | "end";
  header_bg: string | null;
  header_fg: string | null;
  footer_bg: string | null;
  footer_fg: string | null;
  footer_company_title_en?: string | null;
  footer_company_title_ar?: string | null;
  footer_help_title_en?: string | null;
  footer_help_title_ar?: string | null;
  heading_color: string | null;
  link_color: string | null;
  price_color?: string | null;
  product_title_color?: string | null;
  btn_primary_bg: string | null;
  btn_primary_fg: string | null;
  btn_secondary_bg: string | null;
  btn_secondary_fg: string | null;
  btn_checkout_bg: string | null;
  btn_checkout_fg: string | null;
  pages: Array<{
    slug: string;
    title_ar: string | null;
    title_en: string | null;
    content_ar: string | null;
    content_en: string | null;
    image_url: string | null;
    menu_icon_url: string | null;
    image_position: "top" | "bottom";
    meta_title: string | null;
    meta_description: string | null;
    group?: "company" | "help" | null;
  }>;
  socials: Array<{ name: string; url: string }>;
  whatsapp_enabled: boolean;
  whatsapp_number: string | null;
  storefront_mode?: StorefrontMode;
  catalog_show_prices?: boolean;
  catalog_inquiry_message_en?: string | null;
  catalog_inquiry_message_ar?: string | null;
  store_vertical?: StoreVertical;
  store_modules?: StoreModuleOverrides;
  fit_profiles?: FitProfileDefinition[];
  menu_bg: string | null;
  menu_fg: string | null;
  menu_title_en: string | null;
  menu_title_ar: string | null;
  menu_show_home: boolean;
  menu_show_account: boolean;
  menu_show_orders: boolean;
  menu_show_pages: boolean;
  home_promo_cards: HomePromoCard[];
  homepage_editorial_sections: HomepageEditorialSections;
  show_new_arrivals: boolean;
  show_best_sellers: boolean;
  new_arrivals_title_en: string | null;
  new_arrivals_title_ar: string | null;
  best_sellers_title_en: string | null;
  best_sellers_title_ar: string | null;
  announcement_enabled: boolean;
  announcement_text_en: string | null;
  announcement_text_ar: string | null;
  announcement_bg: string;
  announcement_fg: string;
  announcement_bold: boolean;
  announcement_italic: boolean;
  announcement_dismissible: boolean;
  announcement_scope: "all" | "home" | "catalog" | "checkout";
  announcement_audience: "all" | "guest" | "authenticated";
  global_sale_badges_enabled: boolean;
  cart_drawer_checkout_bg: string | null;
  cart_drawer_checkout_fg: string | null;
  vat_inclusive?: boolean;
  shipping_zones?: ShippingZone[];
  google_analytics_enabled: boolean;
  google_analytics_id: string | null;
  meta_pixel_enabled: boolean;
  meta_pixel_id: string | null;
  analytics_consent_required: boolean;
  storefront_loader_text_ar?: string | null;
  storefront_loader_text_en?: string | null;
  shipping_policy_ar?: string | null;
  shipping_policy_en?: string | null;
  brand_story_title_ar?: string | null;
  brand_story_title_en?: string | null;
  brand_story_subtitle_ar?: string | null;
  brand_story_subtitle_en?: string | null;
  brand_story_description_ar?: string | null;
  brand_story_description_en?: string | null;
  brand_story_image_url?: string | null;
  trust_badges?: TrustBadgesConfig | null;
  trust_bar_enabled?: boolean;
  trust_bar_position?: "above_footer" | "below_header" | "both" | string;
  storefront_design_version?: number | null;
  newsletter_enabled?: boolean;
  newsletter_title_ar?: string | null;
  newsletter_title_en?: string | null;
  footer_show_payment_methods?: boolean;
  footer_layout?: "columns" | "minimal" | "classic" | string;
  new_badge_days?: number;
  recent_views_enabled?: boolean;
  recently_viewed_enabled?: boolean;
  social_proof_threshold?: number;
  motion_enabled?: boolean;
  hero_overlay_strength?: number | null;
  hero_title_color_v2?: string | null;
  brand_story_enabled?: boolean;
  social_proof_enabled?: boolean;
  product_card_hover_image?: boolean;
  product_card_color_dots?: boolean;
  product_card_quick_add?: boolean;
  quick_view_enabled?: boolean;
  pdp_image_zoom?: boolean;
  category_filters_enabled?: boolean;
  back_in_stock_enabled?: boolean;
  fabric_care_ar?: string | null;
  fabric_care_en?: string | null;
  shipping_returns_ar?: string | null;
  shipping_returns_en?: string | null;
  pdp_layout?: string | null;
  bundle_discount_percent?: number | null;
  hero_layout?: "full_bleed" | "contained" | string | null;
  hero_height_desktop?: "compact" | "standard" | "cinematic" | string | null;
  hero_aspect_mobile?:
    "portrait_4_5" | "story_9_16" | "square_1_1" | "landscape_4_3" | string | null;
  hero_show_arrows?: boolean | null;
  pdp_gallery_aspect_ratio?: "3:4" | "1:1" | "4:5" | string | null;
  hero_video_fit?: "contain_ambient" | "cover" | "top" | string | null;
};

export type CustomFieldValue = {
  key: string;
  label_ar: string | null;
  label_en: string | null;
  value: string;
};

export type CartItem = {
  cart_line_id: string;
  variant_id: string | null;
  product_id: string;
  name: string;
  name_ar?: string | null;
  name_en?: string | null;
  image: string | null;
  price: number;
  original_price?: number | null;
  size: string | null;
  size_unit?: string | null;
  color: string | null;
  fabric?: string | null;
  qty: number;
  max_stock: number;
  custom_fields?: CustomFieldValue[];
};

/** Pick the localized product name, falling back through en → ar → base name. */
export function pickName(
  lang: StoreLang,
  p: { name?: string | null; name_ar?: string | null; name_en?: string | null },
): string {
  if (lang === "ar") return p.name_ar || p.name_en || p.name || "";
  return p.name_en || p.name_ar || p.name || "";
}

/** Pick the localized product description with the same fallback chain. */
export function pickDescription(
  lang: StoreLang,
  p: {
    description?: string | null;
    description_ar?: string | null;
    description_en?: string | null;
  },
): string {
  if (lang === "ar") return p.description_ar || p.description_en || p.description || "";
  return p.description_en || p.description_ar || p.description || "";
}

type StoreCtx = {
  brand: Brand;
  settings: PublicSettings;
  lang: StoreLang;
  setLang: (l: StoreLang) => void;
  dir: "rtl" | "ltr";
  t: (ar: string, en: string) => string;
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (cart_line_id: string) => void;
  updateQty: (cart_line_id: string, qty: number) => void;
  clearCart: () => void;
  cartCount: number;
  cartTotal: number;
  wishlist: string[];
  wishlistCount: number;
  isWishlisted: (productId: string) => boolean;
  toggleWishlist: (productId: string) => void;
  currency: string;
  session: Session | null;
  isStoreMember: boolean;
  membershipLoading: boolean;
  refreshMembership: () => Promise<boolean>;
  signOut: () => Promise<void>;
  sizeGuides: SizeGuide[];
  addons: Array<{ addon_id: string; status: string; public_settings: Record<string, unknown> }>;
  isAddonInstalled: (addonId: string) => boolean;
};

const Ctx = createContext<StoreCtx | null>(null);

function cartLineId(
  item: Pick<CartItem, "variant_id" | "size" | "color" | "fabric" | "custom_fields">,
): string {
  const fields = [...(item.custom_fields ?? [])]
    .map((field) => ({ key: field.key, value: field.value }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return JSON.stringify({
    variant: item.variant_id,
    size: item.size ?? "",
    color: item.color ?? "",
    fabric: item.fabric ?? "",
    fields,
  });
}

export function StorefrontProvider({
  brand,
  settings,
  sizeGuides = [],
  addons = [],
  initialLang,
  children,
}: {
  brand: Brand;
  settings: PublicSettings;
  sizeGuides?: SizeGuide[];
  addons?: Array<{ addon_id: string; status: string; public_settings: Record<string, unknown> }>;
  initialLang?: StoreLang;
  children: ReactNode;
}) {
  const cartKey = `storefront-cart:${brand.slug}`;
  const langKey = `storefront-lang:${brand.slug}`;
  const wishlistKey = `storefront-wishlist:${brand.slug}`;

  // Instant zero-flicker language initialization:
  // Uses SSR loader's initialLang (derived from cookie/URL) or browser storage synchronously.
  const [lang, setLangState] = useState<StoreLang>(() => {
    if (initialLang === "ar" || initialLang === "en") {
      return initialLang;
    }
    if (typeof window !== "undefined") {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlLang = urlParams.get("lang");
        if (urlLang === "en" || urlLang === "ar") return urlLang;

        const cookieMatch =
          document.cookie.match(new RegExp(`(?:^|; )boutq_lang_${brand.slug}=([^;]*)`)) ||
          document.cookie.match(/(?:^|; )boutq_lang=([^;]*)/);
        if (cookieMatch && (cookieMatch[1] === "en" || cookieMatch[1] === "ar")) {
          return cookieMatch[1] as StoreLang;
        }

        const stored = localStorage.getItem(langKey);
        if (stored === "en" || stored === "ar") return stored;
      } catch {
        /* ignore */
      }
    }
    return "ar";
  });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [storageHydrated, setStorageHydrated] = useState(false);

  const [session, setSession] = useState<Session | null>(null);
  const [trackingCustomer, setTrackingCustomer] = useState<{
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
  } | null>(null);
  const [isStoreMember, setIsStoreMember] = useState(false);
  const [membershipLoading, setMembershipLoading] = useState(true);

  useEffect(() => {
    try {
      const urlParams =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const urlLang = urlParams?.get("lang");
      // Declared at effect scope: the shared-cart callbacks below read this to
      // pick a toast language, and they run after this block has returned.
      let storedLang: string | null = null;
      if (urlLang === "en" || urlLang === "ar") {
        storedLang = urlLang;
        if (urlLang !== lang) setLangState(urlLang);
        try {
          localStorage.setItem(langKey, urlLang);
          const cookieFlags = "; path=/; max-age=31536000; SameSite=Lax";
          document.cookie = `boutq_lang_${brand.slug}=${urlLang}${cookieFlags}`;
          document.cookie = `boutq_lang=${urlLang}${cookieFlags}`;
        } catch {
          /* ignore */
        }
      } else {
        storedLang = localStorage.getItem(langKey);
        if (storedLang === "en" || storedLang === "ar") {
          if (storedLang !== lang) setLangState(storedLang);
          try {
            const cookieFlags = "; path=/; max-age=31536000; SameSite=Lax";
            document.cookie = `boutq_lang_${brand.slug}=${storedLang}${cookieFlags}`;
            document.cookie = `boutq_lang=${storedLang}${cookieFlags}`;
          } catch {
            /* ignore */
          }
        }
      }

      // 1. Check for shared cart in URL: ?c=... or ?cart=... (short code) OR ?share_cart=... (payload)
      let sharedCartLoaded = false;
      if (typeof window !== "undefined") {
        try {
          const urlParams = new URLSearchParams(window.location.search);
          const shortCode = urlParams.get("c") || urlParams.get("cart");
          const sharePayload = urlParams.get("share_cart") || urlParams.get("shared_cart");

          if (shortCode) {
            sharedCartLoaded = true;
            fetchSharedCartByCode(shortCode).then((items) => {
              if (items && items.length > 0) {
                setCart(items);
                urlParams.delete("c");
                urlParams.delete("cart");
                const newSearch = urlParams.toString();
                const newUrl =
                  window.location.pathname +
                  (newSearch ? `?${newSearch}` : "") +
                  window.location.hash;
                window.history.replaceState({}, document.title, newUrl);
                setTimeout(() => {
                  toast.success(
                    (storedLang || "ar") === "en"
                      ? `Shared cart loaded (${items.length} ${items.length === 1 ? "item" : "items"}) 🛒`
                      : `تم تحميل سلة المشتريات المشتركة بنجاح (${items.length} ${items.length === 1 ? "منتج" : "منتجات"}) 🛒`,
                  );
                }, 400);
              }
            });
          } else if (sharePayload) {
            const decoded = decodeCartSharePayload(sharePayload);
            if (decoded && decoded.length > 0) {
              setCart(decoded);
              sharedCartLoaded = true;
              urlParams.delete("share_cart");
              urlParams.delete("shared_cart");
              const newSearch = urlParams.toString();
              const newUrl =
                window.location.pathname +
                (newSearch ? `?${newSearch}` : "") +
                window.location.hash;
              window.history.replaceState({}, document.title, newUrl);
              setTimeout(() => {
                toast.success(
                  (storedLang || "ar") === "en"
                    ? `Shared cart loaded (${decoded.length} ${decoded.length === 1 ? "item" : "items"}) 🛒`
                    : `تم تحميل سلة المشتريات المشتركة بنجاح (${decoded.length} ${decoded.length === 1 ? "منتج" : "منتجات"}) 🛒`,
                );
              }, 400);
            }
          }
        } catch (e) {
          console.warn("Shared cart parse failed:", e);
        }
      }

      const isThankYouPage =
        typeof window !== "undefined" && window.location.pathname.includes("/thank-you/");
      if (isThankYouPage) {
        localStorage.removeItem(cartKey);
        setCart([]);
      } else if (!sharedCartLoaded) {
        const storedCart = localStorage.getItem(cartKey);
        if (storedCart) {
          const parsed = JSON.parse(storedCart) as Array<
            Partial<CartItem> & { variant_id: string }
          >;
          setCart(
            parsed.map((item) => ({
              ...item,
              cart_line_id: item.cart_line_id || cartLineId(item as CartItem),
            })) as CartItem[],
          );
        }
      }

      const storedWishlist = localStorage.getItem(wishlistKey);
      if (storedWishlist) setWishlist(Array.from(new Set(JSON.parse(storedWishlist) as string[])));
    } catch {
      /* ignore invalid or unavailable browser storage */
    } finally {
      setStorageHydrated(true);
    }
  }, [cartKey, langKey, wishlistKey]);

  useEffect(() => {
    if (!storageHydrated) return;
    try {
      localStorage.setItem(cartKey, JSON.stringify(cart));
    } catch {
      /* ignore storage error */
    }
  }, [cart, cartKey, storageHydrated]);

  // Track the cart everywhere in the storefront, not only after the customer
  // reaches checkout. An empty cart closes an existing tracking session.
  useEffect(() => {
    if (!storageHydrated || isCatalogMode(settings)) return;
    const existingSessionId = getExistingCartSessionId(brand.id);
    if (cart.length === 0 && !existingSessionId) return;

    const timer = window.setTimeout(() => {
      const sessionId = existingSessionId || getOrCreateCartSessionId(brand.id);
      void syncStorefrontCartActivity({
        brandId: brand.id,
        sessionId,
        customerId: trackingCustomer?.id ?? null,
        guestName: trackingCustomer?.name ?? undefined,
        guestPhone: trackingCustomer?.phone ?? undefined,
        guestEmail: trackingCustomer?.email ?? session?.user.email ?? undefined,
        cartItems: cart.map((item) => ({
          cart_line_id: item.cart_line_id,
          product_id: item.product_id,
          variant_id: item.variant_id,
          title: item.name,
          name: item.name,
          price: item.price,
          unit_price: item.price,
          qty: item.qty,
          quantity: item.qty,
          line_total: Number((item.price * item.qty).toFixed(3)),
          image: item.image,
          image_url: item.image,
        })),
        subtotal: cart.reduce((sum, item) => sum + item.price * item.qty, 0),
        currency: settings.currency || "BHD",
      });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [brand.id, cart, session?.user.email, settings, storageHydrated, trackingCustomer]);

  useEffect(() => {
    if (!storageHydrated) return;
    try {
      localStorage.setItem(wishlistKey, JSON.stringify(wishlist));
    } catch {
      /* ignore storage error */
    }
  }, [wishlist, wishlistKey, storageHydrated]);

  const checkMembership = useCallback(
    async (activeSession: Session | null): Promise<boolean> => {
      if (!activeSession?.user) {
        setIsStoreMember(false);
        setMembershipLoading(false);
        return false;
      }
      setMembershipLoading(true);
      const { data, error } = await supabase.rpc("has_storefront_membership", {
        p_brand_slug: brand.slug,
      });
      const member = !error && data === true;
      if (error) console.error("Storefront membership check failed", error);
      setIsStoreMember(member);
      setMembershipLoading(false);
      return member;
    },
    [brand.slug],
  );

  const refreshMembership = useCallback(async (): Promise<boolean> => {
    const { data } = await supabase.auth.getSession();
    const activeSession = data.session ?? null;
    setSession(activeSession);
    return checkMembership(activeSession);
  }, [checkMembership]);

  useEffect(() => {
    let active = true;
    if (!session?.user) {
      setTrackingCustomer(null);
      return () => {
        active = false;
      };
    }

    void supabase
      .from("customers")
      .select("id, name, phone, email")
      .eq("brand_id", brand.id)
      .eq("auth_user_id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.warn("Storefront customer lookup failed", error.message);
          setTrackingCustomer(null);
          return;
        }
        setTrackingCustomer(data ?? null);
      });

    return () => {
      active = false;
    };
  }, [brand.id, session?.user]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const nextSession = data.session ?? null;
      setSession(nextSession);
      void checkMembership(nextSession);
    });
    const { data } = supabase.auth.onAuthStateChange((_evt, nextSession) => {
      // Run auth updates outside the synchronous callback to prevent pre-mount setState
      window.setTimeout(() => {
        if (active) {
          setSession(nextSession);
          void checkMembership(nextSession);
        }
      }, 0);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [checkMembership]);

  const setLang = useCallback(
    (l: StoreLang) => {
      setLangState(l);
      try {
        localStorage.setItem(langKey, l);
      } catch {
        /* ignore storage error */
      }
      try {
        const cookieFlags = "; path=/; max-age=31536000; SameSite=Lax";
        document.cookie = `boutq_lang_${brand.slug}=${l}${cookieFlags}`;
        document.cookie = `boutq_lang=${l}${cookieFlags}`;
      } catch {
        /* ignore cookie error */
      }
    },
    [brand.slug, langKey],
  );

  const dir: "rtl" | "ltr" = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", dir);
  }, [lang, dir]);

  const t = useCallback((ar: string, en: string) => (lang === "ar" ? ar : en), [lang]);

  const addToCart = useCallback(
    (item: CartItem) => {
      if (isCatalogMode(settings)) {
        return;
      }
      setCart((prev) => {
        const lineId = cartLineId(item);
        const existing = prev.find((c) => c.cart_line_id === lineId);
        const isCustomLine = Boolean(
          (Array.isArray(item.custom_fields) && item.custom_fields.length > 0) ||
          item.max_stock >= 999,
        );
        const usedByOtherConfigurations = isCustomLine
          ? 0
          : prev
              .filter(
                (c) =>
                  c.variant_id === item.variant_id &&
                  c.cart_line_id !== lineId &&
                  !(Array.isArray(c.custom_fields) && c.custom_fields.length > 0),
              )
              .reduce((sum, c) => sum + c.qty, 0);
        const effectiveMax = isCustomLine ? 999 : item.max_stock;
        const availableForLine = Math.max(0, effectiveMax - usedByOtherConfigurations);
        if (existing) {
          if (availableForLine === 0) {
            return prev.filter((c) => c.cart_line_id !== lineId);
          }
          return prev.map((c) =>
            c.cart_line_id === lineId
              ? { ...c, qty: Math.min(availableForLine, c.qty + item.qty) }
              : c,
          );
        }
        if (availableForLine <= 0) return prev;
        return [
          ...prev,
          { ...item, cart_line_id: lineId, qty: Math.min(item.qty, availableForLine) },
        ];
      });
      trackStorefrontEvent("add_to_cart", {
        currency: settings.currency,
        value: Number((item.price * item.qty).toFixed(3)),
        content_ids: [item.product_id],
        content_type: "product",
        items: [
          { item_id: item.product_id, item_name: item.name, price: item.price, quantity: item.qty },
        ],
      });
    },
    [settings],
  );

  const removeFromCart = useCallback((cart_line_id: string) => {
    setCart((prev) => prev.filter((c) => c.cart_line_id !== cart_line_id));
  }, []);

  const updateQty = useCallback((cart_line_id: string, qty: number) => {
    setCart((prev) => {
      const target = prev.find((c) => c.cart_line_id === cart_line_id);
      if (!target) return prev;
      const isCustomLine = Boolean(
        (Array.isArray(target.custom_fields) && target.custom_fields.length > 0) ||
        target.max_stock >= 999,
      );
      const usedByOthers = isCustomLine
        ? 0
        : prev
            .filter(
              (c) =>
                c.variant_id === target.variant_id &&
                c.cart_line_id !== cart_line_id &&
                !(Array.isArray(c.custom_fields) && c.custom_fields.length > 0),
            )
            .reduce((sum, c) => sum + c.qty, 0);
      const effectiveMax = isCustomLine ? 999 : target.max_stock;
      const availableForLine = Math.max(0, effectiveMax - usedByOthers);
      if (qty <= 0 || availableForLine <= 0) {
        return prev.filter((c) => c.cart_line_id !== cart_line_id);
      }
      return prev.map((c) =>
        c.cart_line_id === cart_line_id ? { ...c, qty: Math.min(availableForLine, qty) } : c,
      );
    });
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    try {
      localStorage.setItem(cartKey, "[]");
    } catch {
      /* ignore storage error */
    }
  }, [cartKey]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setIsStoreMember(false);
  }, []);

  const cartCount = useMemo(() => cart.reduce((s, c) => s + c.qty, 0), [cart]);
  const cartTotal = useMemo(() => cart.reduce((s, c) => s + c.qty * c.price, 0), [cart]);
  const toggleWishlist = useCallback((productId: string) => {
    setWishlist((items) =>
      items.includes(productId) ? items.filter((id) => id !== productId) : [...items, productId],
    );
  }, []);
  const isWishlisted = useCallback((productId: string) => wishlist.includes(productId), [wishlist]);

  const addonRows = useMemo<BrandAddonRow[]>(() => {
    return (addons || []).map((a) => ({
      brand_id: brand.id,
      addon_id: a.addon_id as any,
      status: (a.status || "installed") as any,
      version: 1,
      settings: {},
      public_settings: a.public_settings || {},
      seeded_keys: [],
      source: "onboarding",
      installed_at: "",
      updated_at: "",
    }));
  }, [addons, brand.id]);

  const isAddonInstalled = useCallback(
    (addonId: string) =>
      (addons || []).some((a) => a.addon_id === addonId && a.status === "installed"),
    [addons],
  );

  const value: StoreCtx = {
    brand,
    settings,
    lang,
    setLang,
    dir,
    t,
    cart,
    addToCart,
    removeFromCart,
    updateQty,
    clearCart,
    cartCount,
    cartTotal,
    wishlist,
    wishlistCount: wishlist.length,
    isWishlisted,
    toggleWishlist,
    currency: settings.currency || "BHD",
    session,
    isStoreMember,
    membershipLoading,
    refreshMembership,
    signOut,
    sizeGuides,
    addons,
    isAddonInstalled,
  };

  return (
    <Ctx.Provider value={value}>
      <AddonsProvider addons={addonRows}>
        <DirectionProvider dir={dir}>{children}</DirectionProvider>
      </AddonsProvider>
    </Ctx.Provider>
  );
}

export function useStorefront() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStorefront must be used within StorefrontProvider");
  return v;
}

export function useStoreModules() {
  const { settings, addons } = useStorefront();
  const storeVertical = settings?.store_vertical;
  const storeModules = settings?.store_modules;
  return useMemo(() => {
    if (addons && addons.length > 0) {
      const rows: BrandAddonRow[] = addons.map((a) => ({
        brand_id: "",
        addon_id: a.addon_id as any,
        status: (a.status || "installed") as any,
        version: 1,
        settings: {},
        public_settings: a.public_settings || {},
        seeded_keys: [],
        source: "onboarding",
        installed_at: "",
        updated_at: "",
      }));
      return modulesFromAddons(rows);
    }
    return resolveStoreModules({
      store_vertical: storeVertical,
      store_modules: storeModules,
    });
  }, [storeVertical, storeModules, addons]);
}

export function useFitProfiles(): FitProfileDefinition[] {
  const { settings } = useStorefront();
  return useMemo(() => resolveFitProfiles(settings?.fit_profiles), [settings?.fit_profiles]);
}

export function formatPrice(amount: number, currency: string, lang: StoreLang = "ar") {
  const normalizedCurrency = (currency || "").toUpperCase();
  const isThreeDecimals = ["BHD", "KWD", "OMR", "IQD", "LYD"].includes(normalizedCurrency);
  const fractionDigits = isThreeDecimals ? 3 : 2;
  const n = new Intl.NumberFormat(
    westernNumeralLocale(lang === "ar" ? "ar-BH-u-nu-latn" : "en-BH"),
    {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    },
  );
  try {
    return n.format(amount);
  } catch {
    return `${amount.toFixed(fractionDigits)} ${normalizedCurrency}`;
  }
}

/** Pick a readable foreground (#000 or #fff) for a given hex background. */
export function readableOn(hex: string | null | undefined, fallback = "#111111"): string {
  if (!hex) return fallback;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  // Relative luminance approximation
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l > 0.6 ? "#111111" : "#ffffff";
}
