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

const absolute = (url: string) =>
  url.startsWith("http://") || url.startsWith("https://")
    ? url
    : `${PLATFORM}${url.startsWith("/") ? "" : "/"}${url}`;

/**
 * The icon a store's installed web app shows on a phone's home screen: the store's favicon (a
 * square drawn for small sizes: Pura's is its letters on a maroon tile), else its logo, else the
 * platform's placeholder. Never "maskable": Android crops a maskable icon to its middle circle, and
 * a store's picture is not drawn for that. Pura's home-screen icon was its wide cream wordmark on a
 * transparent ground, cropped, and nearly invisible on a light screen.
 */
export function manifestIcon(
  settings: IconSources | null | undefined,
  brand: IconSources | null | undefined,
): ManifestIcon {
  const raw =
    settings?.favicon_url?.trim() ||
    settings?.logo_url?.trim() ||
    brand?.logo_url?.trim() ||
    PLACEHOLDER;
  const src = absolute(raw);
  const isSvg = /\.svg(\?.*)?$/i.test(src);
  return {
    src,
    sizes: isSvg ? "any" : "192x192 512x512",
    type: isSvg ? "image/svg+xml" : "image/png",
    purpose: "any",
  };
}
