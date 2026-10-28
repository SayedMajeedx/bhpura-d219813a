/**
 * The address search engines should treat as a storefront page's own, and the picture a link
 * preview should show.
 *
 * **A store has one main address.** Its own subdomain (`https://pura.boutq.store/pura/...`) or, when
 * it has one, its own domain (`https://pura.bh/pura/...`). The same pages also answer on
 * `boutq.store/pura/...`; the worker redirects that address to the main one (`storeHostRedirect`),
 * and every page, the sitemap and the structured data name the main one, so Google ranks one
 * address, not two. A page's path keeps the store's slug (the domain's root redirects to
 * `/{slug}`), the same shape the sitemap lists.
 *
 * **A page in English is its own page** (`?lang=en`; the language cookie is not something a crawler
 * has): it names itself as its canonical, and each language names the other (`languageLinks`).
 */

const PLATFORM_ORIGIN = "https://boutq.store";
const PLACEHOLDER_IMAGE = `${PLATFORM_ORIGIN}/og-placeholder.png`;

type StoreAddress = { slug: string; custom_domain?: string | null };
type PageLang = "ar" | "en";

/** `https://pura.boutq.store`, or `https://pura.bh` for a store with its own domain. */
export function storefrontOrigin(store: StoreAddress): string {
  const domain = store.custom_domain
    ?.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  return domain ? `https://${domain}` : `https://${store.slug.trim().toLowerCase()}.boutq.store`;
}

/** `https://pura.boutq.store/pura` or `https://pura.bh/pura`. */
export function storefrontBase(store: StoreAddress): string {
  return `${storefrontOrigin(store)}/${store.slug}`;
}

/**
 * A page's canonical address: the store's base plus a path ("" for the home page), and `?lang=en`
 * for the English page (the Arabic one is the address itself).
 */
export function storefrontCanonical(store: StoreAddress, path = "", lang: PageLang = "ar"): string {
  const clean = path ? `/${path.replace(/^\/+/, "")}` : "";
  return `${storefrontBase(store)}${clean}${lang === "en" ? "?lang=en" : ""}`;
}

/**
 * A page's `<link rel>` tags for search engines: its own address and the same page in the other
 * language (`hreflang`), Arabic being the default. `canonical` is the page in `lang`.
 */
export function pageAddressLinks(
  store: StoreAddress,
  path: string,
  lang: PageLang,
): Array<Record<string, string>> {
  const arabic = storefrontCanonical(store, path, "ar");
  return [
    { rel: "canonical", href: storefrontCanonical(store, path, lang) },
    { rel: "alternate", hrefLang: "ar", href: arabic },
    { rel: "alternate", hrefLang: "en", href: storefrontCanonical(store, path, "en") },
    { rel: "alternate", hrefLang: "x-default", href: arabic },
  ];
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
