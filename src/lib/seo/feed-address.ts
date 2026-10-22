import { getStorefrontUrl } from "@/lib/storefront-url";

/**
 * The address of a store's shopping feed in `lang`, absolute, as Meta and Google need it: on the
 * store's own domain or its boutq.store address (`/products.xml`, which the worker serves), with
 * `?lang=en` for the English one. `origin` makes a local address (development) absolute.
 */
export function feedAddress(
  brand: { slug: string; custom_domain?: string | null },
  lang: "ar" | "en",
  origin = "",
): string {
  const url = getStorefrontUrl(brand, "/products.xml");
  const absolute = url.startsWith("/") ? `${origin}${url}` : url;
  return lang === "en" ? `${absolute}?lang=en` : absolute;
}
