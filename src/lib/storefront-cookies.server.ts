import { getCookie } from "@tanstack/react-start/server";

/**
 * Reads the customer's preferred storefront language from the request cookies during SSR.
 * Checks brand-specific cookie first (`boutq_lang_${slug}`), then global fallback (`boutq_lang`).
 *
 * Read through Start's own request helpers: it once asked `vinxi/http`, which is not installed, so
 * every shopper who chose English was sent the Arabic page first (bug #52).
 */
export async function readStorefrontLangCookie(slug: string): Promise<"ar" | "en" | undefined> {
  try {
    for (const name of slug ? [`boutq_lang_${slug}`, "boutq_lang"] : ["boutq_lang"]) {
      const cookie = getCookie(name);
      if (cookie === "ar" || cookie === "en") return cookie;
    }
    return undefined;
  } catch {
    // No request being answered (a test, a scheduled run): no preference.
    return undefined;
  }
}
