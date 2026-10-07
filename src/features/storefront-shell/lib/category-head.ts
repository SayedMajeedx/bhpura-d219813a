import { faviconType } from "@/lib/favicon";
import { jsonForScript } from "@/lib/seo/json-for-script";
import { socialImage, storefrontCanonical } from "@/lib/seo/canonical";
import { buildBreadcrumbsSchema } from "@/lib/seo/structured-data";

/** The collections that are not rows in `categories` (see CategoryPage). */
const SMART_NAMES: Record<string, { ar: string; en: string }> = {
  new: { ar: "وصل حديثاً", en: "New arrivals" },
  best: { ar: "الأكثر مبيعاً", en: "Most selling" },
  offers: { ar: "تنزيلات", en: "Sale" },
};

export function smartKindOf(slug: string): "new" | "best" | "offers" | null {
  if (["new-arrivals", "new"].includes(slug)) return "new";
  if (["most-selling", "best-sellers", "best-selling"].includes(slug)) return "best";
  if (["offers", "sale", "discounts"].includes(slug)) return "offers";
  return null;
}

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
  image_url?: string | null;
};
type CategoryRow = { name_en: string; name_ar: string | null; image_url: string | null };

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

  let title: string;
  let description: string;
  let image: string | null | undefined;
  let name: string;
  if (page) {
    name = page.title_en || page.title_ar || storeName;
    title = page.meta_title || page.title_en || page.title_ar || brand.meta_title || brand.name_en;
    description =
      page.meta_description || brand.meta_description || `Learn more about ${brand.name_en}.`;
    image = page.image_url || brand.logo_url;
  } else if (category || smart) {
    name = category
      ? (lang === "ar" ? category.name_ar || category.name_en : category.name_en) || categorySlug
      : SMART_NAMES[smart!][lang];
    title = `${name} | ${storeName}`;
    description =
      lang === "ar"
        ? `تسوّق ${name} من ${storeName}، بأسعار واضحة وتوصيل سريع.`
        : `Shop ${name} at ${storeName}: clear prices and fast delivery.`;
    image = category?.image_url || brand.logo_url;
  } else {
    return {};
  }

  const url = storefrontCanonical(store, encodeURIComponent(categorySlug));
  const picture = socialImage(image);
  const favicon = loaderData?.faviconUrl;
  const breadcrumbs = buildBreadcrumbsSchema([
    { name: lang === "ar" ? "الرئيسية" : "Home", url: storefrontCanonical(store) },
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
      { rel: "canonical", href: url },
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
