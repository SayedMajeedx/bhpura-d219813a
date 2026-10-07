/**
 * The address search engines should treat as a storefront page's own, and the picture a link
 * preview should show.
 *
 * A store's pages are `/{slug}/...`. A store with its own domain is reached at
 * `https://{domain}/{slug}/...` (the domain's root redirects to `/{slug}`, the same shape the
 * sitemap lists); any other store lives under the platform's address.
 */

const PLATFORM_ORIGIN = "https://boutq.store";
const PLACEHOLDER_IMAGE = `${PLATFORM_ORIGIN}/og-placeholder.png`;

type StoreAddress = { slug: string; custom_domain?: string | null };

/** `https://boutq.store/pura` or `https://pura.bh/pura`. */
export function storefrontBase(store: StoreAddress): string {
  const domain = store.custom_domain
    ?.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  return `${domain ? `https://${domain}` : PLATFORM_ORIGIN}/${store.slug}`;
}

/** A page's canonical address: the store's base plus a path ("" for the home page). */
export function storefrontCanonical(store: StoreAddress, path = ""): string {
  const clean = path ? `/${path.replace(/^\/+/, "")}` : "";
  return `${storefrontBase(store)}${clean}`;
}

/**
 * The picture for a link preview. WhatsApp, Facebook and X do not draw SVG, and a store's logo is
 * often one, so a vector (or missing) picture falls back to the platform's own raster image.
 */
export function socialImage(url: string | null | undefined): string {
  const clean = url?.trim();
  if (!clean) return PLACEHOLDER_IMAGE;
  const path = clean.split(/[?#]/)[0].toLowerCase();
  return path.endsWith(".svg") ? PLACEHOLDER_IMAGE : clean;
}

/** The page's language and direction from the loader data of the routes that matched. */
export function documentLanguage(matches: ReadonlyArray<{ loaderData?: unknown }>): {
  lang: "ar" | "en";
  dir: "rtl" | "ltr";
} {
  for (const match of matches) {
    const lang = (match.loaderData as { initialLang?: unknown } | undefined)?.initialLang;
    if (lang === "en") return { lang: "en", dir: "ltr" };
    if (lang === "ar") return { lang: "ar", dir: "rtl" };
  }
  return { lang: "ar", dir: "rtl" };
}
