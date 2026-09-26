import {
  buildBreadcrumbsSchema,
  buildProductSchema,
  type SeoBrandInfo,
} from "@/lib/seo/structured-data";

type HeadProduct = {
  id: string;
  name?: string | null;
  name_ar?: string | null;
  name_en?: string | null;
  description?: string | null;
  description_ar?: string | null;
  description_en?: string | null;
  base_price?: number | null;
  original_price?: number | null;
  image_url?: string | null;
  media?: unknown;
  product_variants?: Array<{ id: string; selling_price?: number | null }> | null;
};

const mediaUrl = (item: unknown) =>
  typeof item === "string" ? item : (item as { url?: string } | null)?.url;

/**
 * The product page's document head: title and description in the shopper's
 * language, product Open Graph and Twitter cards, the canonical URL, and the
 * Product and Breadcrumb structured data.
 */
export function productHead({
  loaderData,
  params,
}: {
  loaderData?: { product?: unknown; brand?: unknown; initialLang?: unknown };
  params: { slug: string; id: string };
}) {
  const product = loaderData?.product as HeadProduct | null | undefined;
  if (!product) return {};
  const brand = loaderData?.brand as SeoBrandInfo | undefined;

  const lang: "ar" | "en" = loaderData?.initialLang === "en" ? "en" : "ar";
  const name = (lang === "ar" ? product.name_ar : product.name_en) || product.name || "";
  const rawDesc =
    (lang === "ar"
      ? product.description_ar || product.description || product.description_en
      : product.description_en || product.description || product.description_ar) || name;
  const description = rawDesc.replace(/\s+/g, " ").trim().slice(0, 160);
  const title = `${name} | ${String(params?.slug || "").toUpperCase()}`;
  const image = product.image_url || undefined;

  const productSchema = buildProductSchema(
    {
      id: product.id,
      name_en: product.name_en || product.name || undefined,
      name_ar: product.name_ar || product.name || undefined,
      description_en: product.description_en || product.description,
      description_ar: product.description_ar || product.description,
      price: Number(product.base_price ?? product.product_variants?.[0]?.selling_price ?? 0),
      sale_price: product.original_price ? Number(product.base_price) : undefined,
      sku: product.product_variants?.[0]?.id || product.id,
      primary_image_url: product.image_url,
      images: Array.isArray(product.media)
        ? product.media.map(mediaUrl).filter((url): url is string => Boolean(url))
        : product.image_url
          ? [product.image_url]
          : [],
      is_active: true,
    },
    brand || { slug: params.slug },
    undefined,
    lang,
  );

  const breadcrumbsSchema = buildBreadcrumbsSchema([
    { name: lang === "ar" ? "الرئيسية" : "Home", url: `https://boutq.store/${params.slug}` },
    { name, url: `https://boutq.store/${params.slug}/product/${params.id}` },
  ]);

  return {
    htmlAttrs: {
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
    },
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "product" },
      ...(image ? [{ property: "og:image", content: image }] : []),
      { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      ...(image ? [{ name: "twitter:image", content: image }] : []),
    ],
    links: [
      {
        rel: "canonical",
        href: `https://boutq.store/${params.slug}/product/${params.id}`,
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(productSchema),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(breadcrumbsSchema),
      },
    ],
  };
}
