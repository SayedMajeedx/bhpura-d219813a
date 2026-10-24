import { jsonForScript } from "@/lib/seo/json-for-script";
import { availabilityOf } from "@/lib/product-availability";
import { cardPrice, type PricedProduct, type PricedVariant } from "@/lib/product-price";
import { factLines } from "@/lib/product-facts";
import {
  buildBreadcrumbsSchema,
  buildProductSchema,
  type SeoBrandInfo,
} from "@/lib/seo/structured-data";

type HeadProduct = PricedProduct & {
  id: string;
  name?: string | null;
  name_ar?: string | null;
  name_en?: string | null;
  description?: string | null;
  description_ar?: string | null;
  description_en?: string | null;
  base_price?: number | null;
  image_url?: string | null;
  media?: unknown;
  /** Its facts (`product-facts.ts`), read by the store's vertical. */
  details?: unknown;
  product_variants?: Array<PricedVariant & { id: string }> | null;
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
  loaderData?: {
    product?: unknown;
    brand?: unknown;
    initialLang?: unknown;
    currency?: unknown;
    showPrices?: unknown;
    vertical?: unknown;
    productReviews?: { count?: unknown; average?: unknown } | null;
  };
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

  // The price and availability the cards and the shopping feed say, so Google reads one story:
  // the cheapest size a shopper can buy now (and the dearest, when they differ).
  const variants = product.product_variants ?? [];
  const price = cardPrice(product, variants);
  const productSchema = buildProductSchema(
    {
      id: product.id,
      name_en: product.name_en || product.name || undefined,
      name_ar: product.name_ar || product.name || undefined,
      description_en: product.description_en || product.description,
      description_ar: product.description_ar || product.description,
      price: price.from,
      high_price: price.to,
      in_stock: availabilityOf(product, variants).sellable,
      currency: typeof loaderData?.currency === "string" ? loaderData.currency : null,
      show_price: loaderData?.showPrices !== false,
      rating: loaderData?.productReviews
        ? {
            average: Number(loaderData.productReviews.average),
            count: Number(loaderData.productReviews.count),
          }
        : null,
      sku: variants[0]?.id || product.id,
      // The facts its page shows, in the same words.
      properties: factLines(
        product.details,
        typeof loaderData?.vertical === "string" ? loaderData.vertical : null,
        lang,
      ).map((line) => ({ name: line.label, value: line.value })),
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
        children: jsonForScript(productSchema),
      },
      {
        type: "application/ld+json",
        children: jsonForScript(breadcrumbsSchema),
      },
    ],
  };
}
