/**
 * Structured Data (JSON-LD) Generators for Boutq OS Storefronts.
 * Conforms to schema.org specifications and Google Merchant Center / Search requirements.
 */

export interface SeoBrandInfo {
  id?: string;
  slug?: string;
  name_en?: string | null;
  name_ar?: string | null;
  logo_url?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
}

export interface SeoPublicSettings {
  business_name?: string | null;
  logo_url?: string | null;
  currency?: string;
  whatsapp_number?: string | null;
  socials?: Record<string, string> | Array<{ name: string; url: string }> | null;
  custom_domain?: string | null;
}

export interface SeoProductInfo {
  id: string;
  name_en?: string;
  name_ar?: string;
  description_en?: string | null;
  description_ar?: string | null;
  price: number;
  sale_price?: number | null;
  sku?: string | null;
  primary_image_url?: string | null;
  images?: Array<string | { image_url: string }>;
  is_active?: boolean;
  stock?: number | null;
  manage_stock?: boolean;
}

export interface SeoBreadcrumbItem {
  name: string;
  url: string;
}

function resolveStoreUrl(brand?: SeoBrandInfo, settings?: SeoPublicSettings): string {
  if (settings?.custom_domain) {
    return `https://${settings.custom_domain.replace(/^https?:\/\//, "")}`;
  }
  const slug = brand?.slug || "";
  return `https://boutq.store/${slug}`;
}

function stripHtml(input?: string | null): string {
  if (!input) return "";
  return input.replace(/<[^>]*>?/gm, "").trim();
}

/**
 * Organization Schema (schema.org/Organization)
 */
export function buildOrganizationSchema(brand?: SeoBrandInfo, settings?: SeoPublicSettings) {
  const storeUrl = resolveStoreUrl(brand, settings);
  const name = settings?.business_name || brand?.name_ar || brand?.name_en || "Store";
  const logo = settings?.logo_url || brand?.logo_url || undefined;

  const sameAs: string[] = [];
  if (Array.isArray(settings?.socials)) {
    for (const item of settings.socials) {
      if (item?.url && typeof item.url === "string" && /^https?:\/\//i.test(item.url)) {
        sameAs.push(item.url);
      }
    }
  } else if (settings?.socials && typeof settings.socials === "object") {
    for (const val of Object.values(settings.socials)) {
      if (typeof val === "string" && /^https?:\/\//i.test(val)) {
        sameAs.push(val);
      }
    }
  }

  const schema: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    url: storeUrl,
    ...(logo ? { logo } : {}),
  };

  if (settings?.whatsapp_number) {
    schema.contactPoint = {
      "@type": "ContactPoint",
      telephone: settings.whatsapp_number,
      contactType: "customer service",
      availableLanguage: ["Arabic", "English"],
    };
  }

  if (sameAs.length > 0) {
    schema.sameAs = sameAs;
  }

  return schema;
}

/**
 * WebSite Schema (schema.org/WebSite) with SearchAction
 */
export function buildWebSiteSchema(brand?: SeoBrandInfo, settings?: SeoPublicSettings) {
  const storeUrl = resolveStoreUrl(brand, settings);
  const name = settings?.business_name || brand?.name_en || brand?.name_ar || "Store";

  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url: storeUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${storeUrl}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * Product Schema (schema.org/Product) with Offer
 */
export function buildProductSchema(
  product: SeoProductInfo,
  brand?: SeoBrandInfo,
  settings?: SeoPublicSettings,
  lang: "ar" | "en" = "ar",
) {
  const storeUrl = resolveStoreUrl(brand, settings);
  const productUrl = `${storeUrl}/product/${product.id}`;
  const name = (lang === "ar" ? product.name_ar || product.name_en : product.name_en || product.name_ar) || "Product";
  const rawDesc = lang === "ar" ? product.description_ar || product.description_en : product.description_en || product.description_ar;
  const description = stripHtml(rawDesc) || name;

  const imageList: string[] = [];
  if (product.primary_image_url) imageList.push(product.primary_image_url);
  if (Array.isArray(product.images)) {
    for (const item of product.images) {
      const url = typeof item === "string" ? item : item?.image_url;
      if (url && !imageList.includes(url)) imageList.push(url);
    }
  }

  const effectivePrice = product.sale_price !== null && product.sale_price !== undefined && product.sale_price > 0
    ? product.sale_price
    : product.price;

  const isOutOfStock = product.manage_stock && product.stock !== null && product.stock !== undefined && product.stock <= 0;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    url: productUrl,
    ...(imageList.length > 0 ? { image: imageList } : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    brand: {
      "@type": "Brand",
      name: settings?.business_name || brand?.name_ar || brand?.name_en || "Store",
    },
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: settings?.currency || "BHD",
      price: effectivePrice,
      priceValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      itemCondition: "https://schema.org/NewCondition",
      availability: isOutOfStock
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
      seller: {
        "@type": "Organization",
        name: settings?.business_name || brand?.name_ar || brand?.name_en || "Store",
      },
    },
  };
}

/**
 * BreadcrumbList Schema (schema.org/BreadcrumbList)
 */
export function buildBreadcrumbsSchema(items: SeoBreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * CollectionPage Schema (schema.org/CollectionPage)
 */
export function buildCollectionSchema(
  collectionName: string,
  products: SeoProductInfo[],
  brand?: SeoBrandInfo,
  settings?: SeoPublicSettings,
  categoryUrl?: string,
) {
  const storeUrl = resolveStoreUrl(brand, settings);
  const url = categoryUrl || storeUrl;

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: collectionName,
    url,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: products.slice(0, 24).map((p, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${storeUrl}/product/${p.id}`,
        name: p.name_ar || p.name_en || `Product ${p.id}`,
      })),
    },
  };
}
