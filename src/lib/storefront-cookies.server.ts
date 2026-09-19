async function getVinxiHttp() {
  const importFn = new Function("m", "return import(m)");
  return importFn("vinxi/http");
}

/**
 * Reads the customer's preferred storefront language from the request cookies during SSR.
 * Checks brand-specific cookie first (`boutq_lang_${slug}`), then global fallback (`boutq_lang`).
 */
export async function readStorefrontLangCookie(slug: string): Promise<"ar" | "en" | undefined> {
  try {
    const { getEvent, getCookie } = await getVinxiHttp();
    const event = getEvent();
    if (!event) return undefined;
    const cookie = getCookie(event, `boutq_lang_${slug}`) || getCookie(event, "boutq_lang");
    if (cookie === "ar" || cookie === "en") return cookie;
    return undefined;
  } catch {
    return undefined;
  }
}
