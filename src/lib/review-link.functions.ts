import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { storeShareImage, type ShareImageStore } from "@/lib/seo/share-image";
import type { ReviewHeadData } from "@/lib/review-head";

const inputSchema = z.object({ token: z.string().uuid() });

/**
 * For a review link's preview only (`reviewHead`): the store's name, its picture and the order's
 * number, read on the server by the link's token. Nothing about the customer leaves here; the page
 * itself reads its review through `get_public_order_review`.
 */
export const getReviewLinkHead = createServerFn({ method: "GET" })
  .validator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<ReviewHeadData | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: request } = await supabaseAdmin
      .from("order_review_requests")
      .select("brand_id, order_id")
      .eq("public_token", data.token)
      .maybeSingle();
    if (!request) return null;

    const [{ data: store }, { data: settings }, { data: order }] = await Promise.all([
      supabaseAdmin
        .from("brands")
        .select("name_en, name_ar, logo_url, hero_media")
        .eq("id", request.brand_id)
        .maybeSingle(),
      supabaseAdmin
        .from("business_settings")
        .select(
          "business_name, logo_url, homepage_editorial_sections, order_number_prefix, order_number_digits",
        )
        .eq("brand_id", request.brand_id)
        .maybeSingle(),
      supabaseAdmin
        .from("orders")
        .select("invoice_number")
        .eq("id", request.order_id)
        .maybeSingle(),
    ]);

    return {
      invoiceNumber: order?.invoice_number ?? null,
      settings: {
        business_name: settings?.business_name ?? null,
        order_number_prefix: settings?.order_number_prefix ?? null,
        order_number_digits: settings?.order_number_digits ?? null,
      },
      storeName: store?.name_ar || store?.name_en || null,
      shareImage: storeShareImage({
        brand: {
          logo_url: store?.logo_url,
          hero_media: store?.hero_media as ShareImageStore["brand"]["hero_media"],
        },
        settings: {
          logo_url: settings?.logo_url,
          homepage_editorial_sections: settings?.homepage_editorial_sections,
        },
      }),
    };
  });
