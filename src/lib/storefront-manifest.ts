import type { ImageFacts } from "./image-size";
import { storefrontThemeColor } from "./theme-color";

/**
 * A store's web app manifest: what a shopper's phone installs when they add the store to their
 * home screen (`src/routes/$slug.manifest[.webmanifest].ts`). Pure: the route reads the store and
 * measures its icon. The PWA review of 2026-11-05 found it declaring a 512px icon that was 192px
 * (a blurry splash), a start address outside its own scope, no identity, a portrait lock on
 * tablets, one store's maroon as every store's fallback, and an Arabic short name for English
 * readers.
 */

type IconSources = {
  favicon_url?: string | null;
  logo_url?: string | null;
};

export type ManifestIcon = {
  src: string;
  sizes: string;
  type: string;
  purpose: "any";
};

const PLATFORM = "https://boutq.store";
const PLACEHOLDER = `${PLATFORM}/placeholder.svg`;
/** The least size a browser installs from (Chrome asks 144px). */
const LEAST_ICON = 144;

const absolute = (url: string) =>
  url.startsWith("http://") || url.startsWith("https://")
    ? url
    : `${PLATFORM}${url.startsWith("/") ? "" : "/"}${url}`;

const isSvg = (src: string) => /\.svg(\?.*)?$/i.test(src);

/**
 * The pictures a store's home-screen icon may be, best first: its favicon (a square drawn for small
 * sizes: Pura's is its letters on a maroon tile), its logo, the brand's logo.
 */
export function iconCandidates(
  settings: IconSources | null | undefined,
  brand: IconSources | null | undefined,
): string[] {
  const all = [settings?.favicon_url, settings?.logo_url, brand?.logo_url]
    .map((u) => u?.trim())
    .filter((u): u is string => Boolean(u))
    .map(absolute);
  return [...new Set(all)];
}

/**
 * The icon, with its size and kind as they really are (`facts`, read from the picture; null when it
 * could not be read). The first square picture a browser installs from, else the first square
 * one, else the first that could be read; an SVG is any size. Never "maskable": Android crops a
 * maskable icon to its middle circle, and a store's picture is not drawn for that.
 */
export function manifestIcon(
  candidates: ReadonlyArray<{ src: string; facts: ImageFacts | null }>,
): ManifestIcon {
  const svg = (src: string): ManifestIcon => ({
    src,
    sizes: "any",
    type: "image/svg+xml",
    purpose: "any",
  });
  const sized = (src: string, f: ImageFacts): ManifestIcon => ({
    src,
    sizes: `${f.width}x${f.height}`,
    type: f.type,
    purpose: "any",
  });
  const square = (f: ImageFacts | null): f is ImageFacts => Boolean(f && f.width === f.height);
  const big = candidates.find(
    (c) => isSvg(c.src) || (square(c.facts) && c.facts.width >= LEAST_ICON),
  );
  const pick =
    big ?? candidates.find((c) => square(c.facts)) ?? candidates.find((c) => c.facts !== null);
  if (!pick) return svg(PLACEHOLDER);
  return isSvg(pick.src) ? svg(pick.src) : sized(pick.src, pick.facts as ImageFacts);
}

type StoreFacts = {
  slug: string;
  name_ar?: string | null;
  name_en?: string | null;
  primary_color?: string | null;
};
type SettingsFacts = {
  business_name?: string | null;
  storefront_background_color?: string | null;
  header_bg?: string | null;
};

const filled = (value: string | null | undefined) => value?.trim() || "";

/**
 * The manifest in the page's language: its name and direction, the store's address as its identity
 * and scope, the colours its pages wear (the status bar is the header's colour, as on the page).
 */
export function storefrontManifest({
  brand,
  settings,
  icon,
  lang,
}: {
  brand: StoreFacts;
  settings: SettingsFacts | null | undefined;
  icon: ManifestIcon;
  lang: "ar" | "en";
}) {
  const ar = filled(brand.name_ar);
  const en = filled(brand.name_en);
  const own = lang === "ar" ? ar || en : en || ar;
  const name = own || filled(settings?.business_name) || brand.slug;
  const home = `/${brand.slug}`;
  const background = filled(settings?.storefront_background_color);
  return {
    id: home,
    name,
    short_name: name,
    lang,
    dir: lang === "ar" ? "rtl" : "ltr",
    start_url: lang === "en" ? `${home}?lang=en` : home,
    scope: home,
    display: "standalone",
    background_color: /^#[0-9a-f]{3,8}$/i.test(background) ? background : "#ffffff",
    theme_color: storefrontThemeColor(settings?.header_bg),
    icons: [icon],
  };
}
