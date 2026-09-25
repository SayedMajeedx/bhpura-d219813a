/**
 * The storefront's first language: ?lang=, else the language cookie (read
 * on the server, or from document.cookie and then localStorage in the
 * browser), else Arabic.
 */
export async function resolveInitialLang(slug: string, search: unknown): Promise<"ar" | "en"> {
  let initialLang: "ar" | "en" = "ar";
  const searchParams = search as any;
  const queryLang = searchParams?.lang;
  if (queryLang === "en" || queryLang === "ar") {
    initialLang = queryLang;
  } else if (typeof window === "undefined") {
    try {
      const { getStorefrontInitialLang } = await import("@/lib/storefront-cookies.functions");
      const cookieLang = await getStorefrontInitialLang({ data: { slug } });
      if (cookieLang === "en" || cookieLang === "ar") {
        initialLang = cookieLang;
      }
    } catch {
      /* fallback to default */
    }
  } else {
    try {
      const cookieMatch =
        document.cookie.match(new RegExp(`(?:^|; )boutq_lang_${slug}=([^;]*)`)) ||
        document.cookie.match(/(?:^|; )boutq_lang=([^;]*)/);
      if (cookieMatch && (cookieMatch[1] === "en" || cookieMatch[1] === "ar")) {
        initialLang = cookieMatch[1] as "ar" | "en";
      } else {
        const stored = localStorage.getItem(`storefront-lang:${slug}`);
        if (stored === "en" || stored === "ar") {
          initialLang = stored;
        }
      }
    } catch {
      /* fallback */
    }
  }
  return initialLang;
}
