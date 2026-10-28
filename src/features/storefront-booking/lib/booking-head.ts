import { pageAddressLinks, storefrontCanonical } from "@/lib/seo/canonical";

type BookingBrand = {
  slug?: string;
  name_en?: string | null;
  name_ar?: string | null;
  custom_domain?: string | null;
};

/**
 * The booking page's own head: a title and description that say what the page is (it took the
 * home page's, so Google saw two pages with one title), its own address, and the same page in the
 * other language. The store comes from the layout's data (`/$slug`), the language too.
 */
export function bookingHead({ matches }: { matches: ReadonlyArray<unknown> }) {
  const layout = (matches as ReadonlyArray<{ routeId?: string; loaderData?: unknown }>).find(
    (match) => match.routeId === "/$slug",
  )?.loaderData as
    | {
        brand?: BookingBrand;
        settings?: { business_name?: string | null } | null;
        initialLang?: "ar" | "en";
      }
    | undefined;
  const brand = layout?.brand;
  if (!brand?.slug) return {};
  const lang = layout?.initialLang === "en" ? "en" : "ar";
  const name =
    (lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en || brand.name_ar) ||
    layout?.settings?.business_name ||
    brand.slug;

  const title = lang === "ar" ? `احجز موعدك | ${name}` : `Book online | ${name}`;
  const description =
    lang === "ar"
      ? `احجز مع ${name} أونلاين: شاهد التواريخ المتاحة وخدماتنا وعروضنا.`
      : `Book ${name} online: see the free dates, our services and offers.`;
  const url = storefrontCanonical(brand as { slug: string }, "book", lang);

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    links: pageAddressLinks(brand as { slug: string }, "book", lang),
  };
}
