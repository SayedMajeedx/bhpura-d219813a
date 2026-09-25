import type React from "react";
import { readableOn, type Brand, type PublicSettings } from "@/lib/storefront-context";
import { customFontFaces, typographyVariables } from "@/lib/typography";
import { hexToRgba, isColorDark } from "@/components/storefront/storefront-utils";

/**
 * The storefront's theme as CSS variables on the shell: brand colour,
 * readable text on each surface, buttons, cart and checkout colours, heading,
 * link, title and price colours, the allowed corner radii, the badge accent,
 * the (optionally glass) header and the typography, plus custom font faces.
 */
export function shellTheme({
  brand,
  settings,
  lang,
}: {
  brand: Pick<Brand, "primary_color">;
  settings: PublicSettings;
  lang: string;
}): { style: React.CSSProperties; isGlass: boolean; typographyFaces: string } {
  const primary = settings.primary_color || brand.primary_color || "#3f121a";
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

  const rawRadius = settings.storefront_radius || "0.5rem";
  const radiusSf = ["0px", "0.375rem", "1rem", "1.5rem"].includes(rawRadius) ? rawRadius : "0.5rem";
  const isGlass = settings.header_glass ?? true;
  const badgeAccent = settings.badge_accent || "maroon";

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

  const style = {
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
  } as React.CSSProperties;

  return { style, isGlass, typographyFaces };
}
