import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({ id: z.string().uuid() });

export const getPublicInvoice = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error } = await (supabaseAdmin
      .from("orders") as any)
      .select(`
        id, invoice_number, order_date, status, payment_method, payment_status,
        currency, notes, fulfillment_method, subtotal, discount, tax_amount,
        tax_rate, shipping, total, advance_paid, shipping_address_id, user_id,
        customers(name, phone, email, region),
        order_items(description, quantity, unit_price, line_total, customization_total,
          customizations, custom_field_values, products(name), product_variants(size, color, fabric))
      `)
      .eq("public_invoice_token", data.id)
      .maybeSingle();
    if (error) {
      console.error("[getPublicInvoice] order query failed", error);
      throw new Error("Unable to load invoice");
    }
    if (!order) return null;

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

    // The query above is intentionally allowlisted. Never replace it with `*`:
    // new internal order fields must not become public automatically.
    return { order, settings, shippingAddress };
  });
