import { readAll } from "@/lib/data/read-all";
import { storeAxisDefaults } from "@/lib/variant-axes";
import type { BrandAddonRow } from "@/lib/addons/addon-types";
import { resolveStoreBrand, storeOrigin } from "@/lib/seo/robots-sitemap.server";
import { feedItems, feedXml, type FeedProduct, type FeedVariant } from "@/lib/seo/product-feed";

/**
 * Serves /{slug}/products.xml (and /products.xml on a store's own host): the shopping feed
 * Google Merchant Center and Meta Commerce Manager fetch. `?lang=en` gives the English one;
 * Arabic is the default, as on the storefront. Built fresh from the catalog on every fetch,
 * cached for ten minutes at most, so a sold-out size stops being advertised within minutes.
 */

const FEED_CACHE = "public, max-age=600, s-maxage=600";

const PRODUCT_COLUMNS =
  "id, name, name_ar, name_en, description, description_ar, description_en, image_url, media, is_active, is_package, item_kind, is_made_to_order, made_to_order_available, made_to_order_paused_at, base_price, variant_label_size_ar, variant_label_size_en, variant_label_color_ar, variant_label_color_en, variant_label_fabric_ar, variant_label_fabric_en, variant_label_four_ar, variant_label_four_en, variant_label_five_ar, variant_label_five_en";
const VARIANT_COLUMNS =
  "id, product_id, size, size_unit, color, fabric, option_four, option_five, selling_price, original_price, stock_main, stock_incubator, image_url";

const text = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });

export async function handleProductFeedRequest(
  request: Request,
  explicitSlug: string | null = null,
): Promise<Response> {
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") === "en" ? "en" : "ar";
  const brand = await resolveStoreBrand(request, explicitSlug);
  if (!brand) return text("Not found", 404);

  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const [{ data: settings }, { data: addons }, products, variants] = await Promise.all([
    db
      .from("business_settings")
      .select("business_name, currency, storefront_mode, catalog_show_prices, store_vertical")
      .eq("brand_id", brand.id)
      .maybeSingle(),
    db.from("brand_addons").select("*").eq("brand_id", brand.id).limit(100),
    readAll((from, to) =>
      db
        .from("products")
        .select(PRODUCT_COLUMNS, { count: "exact" })
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    readAll((from, to) =>
      db
        .from("product_variants")
        .select(VARIANT_COLUMNS, { count: "exact" })
        .eq("brand_id", brand.id)
        .order("id")
        .range(from, to),
    ),
  ]);

  // Both services need a price: a store that shows none has no feed.
  if (settings?.storefront_mode === "catalog" && settings?.catalog_show_prices === false) {
    return text("This store does not show its prices, so it has no shopping feed.", 404);
  }

  const store = {
    base: `${storeOrigin(request)}/${brand.slug}`,
    name: settings?.business_name || brand.slug,
    currency: settings?.currency || "BHD",
    lang,
    axisDefaults: storeAxisDefaults(
      (addons ?? []) as BrandAddonRow[],
      settings?.store_vertical ?? null,
    ),
  } as const;

  const items = feedItems(
    store,
    products as unknown as FeedProduct[],
    variants as unknown as FeedVariant[],
  );
  return new Response(feedXml(store, items), {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": FEED_CACHE,
    },
  });
}
