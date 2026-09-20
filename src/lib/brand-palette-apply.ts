import {
  ensureContrast,
  getContrastRatio,
  hexToRgb,
  hslToHex,
  normalizeHex,
  rgbToHsl,
  type ExtractedPalette,
} from "@/lib/logo-palette";

/**
 * Columns of `business_settings` that a brand palette is allowed to write.
 * Shared by the settings "extract from logo" action, the brand wizard and the
 * server-side finalize step (which whitelists against this list).
 */
export const PALETTE_SETTINGS_COLUMNS = [
  "storefront_accent_color",
  "storefront_background_color",
  "storefront_text_color",
  "heading_color",
  "link_color",
  "price_color",
  "product_title_color",
  "btn_primary_bg",
  "btn_primary_fg",
  "btn_secondary_bg",
  "btn_secondary_fg",
  "btn_checkout_bg",
  "btn_checkout_fg",
  "cart_drawer_checkout_bg",
  "cart_drawer_checkout_fg",
  "header_bg",
  "header_fg",
  "footer_bg",
  "footer_fg",
  "menu_bg",
  "menu_fg",
  "brand_palette",
] as const;

export type PaletteSettingsPatch = Partial<
  Record<(typeof PALETTE_SETTINGS_COLUMNS)[number], unknown>
>;

export function readableOn(background: string, preferredDark = "#111111"): string {
  const bg = normalizeHex(background);
  return getContrastRatio("#ffffff", bg) >= getContrastRatio(preferredDark, bg)
    ? "#ffffff"
    : preferredDark;
}

export function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(normalizeHex(hex));
  const { h, s, l } = rgbToHsl(r, g, b);
  return hslToHex(h, s, Math.max(0, l - amount));
}

/**
 * Turns an extracted/derived palette into explicit `business_settings` values.
 * The storefront keeps its `?? primary` fallbacks, so writing explicit values is
 * purely additive and never changes how untouched brands render.
 */
export function paletteToSettingsPatch(
  palette: ExtractedPalette,
  source: "logo" | "manual",
): PaletteSettingsPatch {
  const primary = normalizeHex(palette.accent || palette.primary);
  const secondary = normalizeHex(palette.secondary || "#111111");
  const background = normalizeHex(palette.background || "#ffffff");
  const text = normalizeHex(palette.text || "#111111");
  const heading = ensureContrast(primary, background, 4.5);
  const footerBg = darken(primary, 0.35);
  const btnPrimaryFg = readableOn(primary);
  const btnSecondaryFg = readableOn(secondary);

  return {
    storefront_accent_color: primary,
    storefront_background_color: background,
    storefront_text_color: text,
    heading_color: heading,
    link_color: heading,
    price_color: heading,
    product_title_color: text,
    btn_primary_bg: primary,
    btn_primary_fg: btnPrimaryFg,
    btn_secondary_bg: secondary,
    btn_secondary_fg: btnSecondaryFg,
    btn_checkout_bg: primary,
    btn_checkout_fg: btnPrimaryFg,
    cart_drawer_checkout_bg: primary,
    cart_drawer_checkout_fg: btnPrimaryFg,
    header_bg: background,
    header_fg: text,
    footer_bg: footerBg,
    footer_fg: readableOn(footerBg),
    menu_bg: background,
    menu_fg: text,
    brand_palette: {
      source,
      mood: palette.mood,
      primary,
      secondary,
      background,
      text,
      swatches: palette.swatches ?? [],
      extracted_at: new Date().toISOString(),
      meta: { source, chosen: source === "logo" ? palette.mood : "manual" },
    },
  };
}
