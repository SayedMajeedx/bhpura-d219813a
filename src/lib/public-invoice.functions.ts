import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({ id: z.string().uuid() });

export const getPublicInvoice = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*, customers(name, phone, email), order_items(*, products(name), product_variants(size, color, fabric))")
      .eq("public_invoice_token", data.id)
      .maybeSingle();
    if (error) {
      console.error("[getPublicInvoice] order query failed", error);
      throw new Error("Unable to load invoice");
    }
    if (!order) return null;

    // Never serialize the one-purpose email capability to an invoice viewer.
    const { confirmation_email_token: _emailToken, ...publicOrder } = order as any;

    const { data: settings } = await supabaseAdmin
      .from("business_settings")
      .select("business_name, logo_url, address, phone, email, vat_number, currency, footer_note, primary_color, background_color, text_color")
      .eq("user_id", order.user_id)
      .maybeSingle();

    let shippingAddress: any = null;
    if (order.shipping_address_id) {
      const { data: addr } = await supabaseAdmin
        .from("customer_addresses")
        .select("label, region, road, house, flat, is_default")
        .eq("id", order.shipping_address_id)
        .maybeSingle();
      shippingAddress = addr ?? null;
    }

    return { order: publicOrder, settings, shippingAddress };
  });
