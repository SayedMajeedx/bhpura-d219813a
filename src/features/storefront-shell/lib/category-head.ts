import { faviconType } from "@/lib/favicon";
import { META_DESCRIPTION_LIMIT, sanitizeMetaText } from "@/lib/seo";
import { smartKindOf } from "@/lib/smart-categories";
import { jsonForScript } from "@/lib/seo/json-for-script";
import { pageAddressLinks, socialImage, storefrontCanonical } from "@/lib/seo/canonical";
import { categoryListing } from "@/lib/seo/listing";
import { buildBreadcrumbsSchema } from "@/lib/seo/structured-data";

/** The collections that are not rows in `categories` (see CategoryPage). */
/** The built-in collections' names, for the page heading and the browser's title. */
export const SMART_NAMES: Record<string, { ar: string; en: string }> = {
  all: { ar: "كل المنتجات", en: "All products" },
  new: { ar: "وصل حديثاً", en: "New arrivals" },
  best: { ar: "الأكثر مبيعاً", en: "Most selling" },
  offers: { ar: "تنزيلات", en: "Sale" },
};

/** A services store's whole listing is its services, not its products. */
const ALL_SERVICES = { ar: "كل الخدمات", en: "All services" };

/** A built-in collection's name, in a services store's words where they differ. */
export function smartName(kind: string, lang: "ar" | "en", servicesStore: boolean): string {
  if (kind === "all" && servicesStore) return ALL_SERVICES[lang];
  return SMART_NAMES[kind][lang];
}

export { smartKindOf };

type Brand = {
  slug?: string;
  name_en: string;
  name_ar: string | null;
  logo_url: string | null;
  custom_domain?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
};
type CmsPage = {
  slug: string;
  title_en?: string | null;
  title_ar?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  content_ar?: string | null;
  content_en?: string | null;
  image_url?: string | null;
};
type CategoryRow = {
  name_en: string;
  name_ar: string | null;
  image_url: string | null;
  seo_title_ar?: string | null;
  seo_title_en?: string | null;
  seo_description_ar?: string | null;
  seo_description_en?: string | null;
};

/**
 * The head of `/{store}/{category}`: a CMS page keeps its own title and description; a category
 * or a smart collection (new arrivals, best sellers, sale) gets its own title, description, address
 * and breadcrumbs instead of repeating the home page's. Without those, every category told search
 * engines it was the home page.
 */
export function categoryHead({
  loaderData,
  slug,
  category: categorySlug,
}: {
  loaderData:
    | {
        page?: unknown;
        category?: unknown;
        brand?: unknown;
        faviconUrl?: string | null;
        initialLang?: "ar" | "en";
        servicesStore?: boolean;
        /** The store's picture for a shared link (`storeShareImage`), set by the loader. */
        shareImage?: string | null;
      }
    | undefined;
  slug: string;
  category: string;
}) {
  const brand = loaderData?.brand as Brand | null | undefined;
  if (!brand) return {};
  const lang = loaderData?.initialLang === "en" ? "en" : "ar";
  const store = { slug, custom_domain: brand.custom_domain };
  const storeName = (lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en) || slug;
  const page = loaderData?.page as CmsPage | null | undefined;
  const category = loaderData?.category as CategoryRow | null | undefined;
  const smart = smartKindOf(categorySlug);
  const servicesStore = Boolean(loaderData?.servicesStore);

  let title: string;
  let description: string;
  let image: string | null | undefined;
  let name: string;
  if (page) {
    // In the page's language, named with the store like a category: Pura's Arabic terms page was
    // titled "Terms & Conditions" and described as "Learn more about PURA LINE."
    name =
      (lang === "ar" ? page.title_ar || page.title_en : page.title_en || page.title_ar) ||
      storeName;
    title = page.meta_title || `${name} | ${storeName}`;
    const content = lang === "ar" ? page.content_ar || page.content_en : page.content_en;
    description =
      page.meta_description ||
      sanitizeMetaText(content, META_DESCRIPTION_LIMIT) ||
      (lang === "ar" ? `${name} في ${storeName}.` : `${name} at ${storeName}.`);
    image = page.image_url || loaderData?.shareImage || brand.logo_url;
  } else if (category || smart) {
    name = category
      ? (lang === "ar" ? category.name_ar || category.name_en : category.name_en) || categorySlug
      : smartName(smart!, lang, servicesStore);
    // The store's own words for this category, else one sentence that is true of every store
    // (it once also promised every store's prices and speed of delivery, a catalog with no
    // prices and a store that makes to order included; a services store is booked, not shopped).
    ({ title, description } = categoryListing(category, lang, { name, storeName, servicesStore }));
    image = category?.image_url || loaderData?.shareImage || brand.logo_url;
  } else {
    return {};
  }

  const path = encodeURIComponent(categorySlug);
  const url = storefrontCanonical(store, path, lang);
  const picture = socialImage(image);
  const favicon = loaderData?.faviconUrl;
  const breadcrumbs = buildBreadcrumbsSchema([
    { name: lang === "ar" ? "الرئيسية" : "Home", url: storefrontCanonical(store, "", lang) },
    { name, url },
  ]);

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { property: "og:image", content: picture },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: picture },
    ],
    links: [
      ...pageAddressLinks(store, path, lang),
      ...(favicon
        ? [
            {
              rel: "icon",
              href: favicon,
              ...(faviconType(favicon) ? { type: faviconType(favicon) } : {}),
            },
          ]
        : []),
    ],
    scripts: [{ type: "application/ld+json", children: jsonForScript(breadcrumbs) }],
  };
}
