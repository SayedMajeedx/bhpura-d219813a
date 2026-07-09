import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { SMTPClient } from "npm:denomailer@1.6.0";
import { renderOrderEmail, type OrderEmailData } from "./template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-webhook-secret",
};

const PLATFORM_NAME = Deno.env.get("PLATFORM_NAME") || "Boutq";
const FROM_ADDRESS = Deno.env.get("ORDER_EMAIL_FROM_ADDRESS") || "orders@boutq.store";
const SMTP_HOST = Deno.env.get("ZOHO_SMTP_HOST") || "smtp.zoho.com";
const SMTP_PORT = Number(Deno.env.get("ZOHO_SMTP_PORT") || "465");
const SMTP_USER = Deno.env.get("ZOHO_SMTP_USER") || FROM_ADDRESS;
const SMTP_PASS = Deno.env.get("ZOHO_SMTP_PASS") || "";
const WEBHOOK_SECRET = Deno.env.get("ORDER_EMAIL_WEBHOOK_SECRET") || "";

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if (bufA.length !== bufB.length) {
    // Still walk `a`'s length so short-secret guesses don't return faster.
    let dummy = 0;
    for (let i = 0; i < bufA.length; i++) dummy |= bufA[i];
    return false;
  }
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  let order_id: string | null = null;

  try {
    const providedSecret = req.headers.get("x-webhook-secret") || "";
    if (!WEBHOOK_SECRET || !timingSafeEqual(providedSecret, WEBHOOK_SECRET)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({ order_id: null }));
    order_id = body?.order_id || null;
    if (!order_id) return json({ error: "order_id is required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(
        `id, invoice_number, subtotal, discount, shipping, total, currency, notes,
         payment_method, payment_status, fulfillment_method, created_at, brand_id, customer_id,
         brands ( id, slug, name_en, name_ar, logo_url ),
         customers ( id, name, phone, email ),
         customer_addresses ( label, region, block, road, house, flat )`,
      )
      .eq("id", order_id)
      .single();

    if (orderErr || !order) {
      console.error("order fetch failed", orderErr);
      return json({ error: "ORDER_NOT_FOUND" }, 404);
    }

    const brand = (order as any).brands;
    const customer = (order as any).customers;
    const address = (order as any).customer_addresses;

    if (!brand) return json({ error: "BRAND_NOT_FOUND" }, 404);
    if (!customer?.email) {
      await supabase
        .from("orders")
        .update({ confirmation_email_status: "skipped" })
        .eq("id", order_id);
      return json({ skipped: true, reason: "NO_CUSTOMER_EMAIL" });
    }

    const { data: settings } = await supabase
      .from("business_settings")
      .select(
        "business_name, logo_url, primary_color, text_color, background_color, currency, email, phone, address",
      )
      .eq("brand_id", order.brand_id)
      .maybeSingle();

    const { data: items } = await supabase
      .from("order_items")
      .select(
        `id, description, quantity, unit_price, line_total,
         product_variants ( sku, size, color, fabric )`,
      )
      .eq("order_id", order_id)
      .order("created_at", { ascending: true });

    const brandDisplayName =
      brand.name_ar?.trim() || brand.name_en?.trim() || settings?.business_name || "Store";
    const fromHeader = `"${brandDisplayName} via ${PLATFORM_NAME}" <${FROM_ADDRESS}>`;

    const emailData: OrderEmailData = {
      brand: {
        nameEn: brand.name_en,
        nameAr: brand.name_ar,
        logoUrl: settings?.logo_url || brand.logo_url || null,
        primaryColor: settings?.primary_color || "#8b6f47",
        textColor: settings?.text_color || "#1a1a1a",
        backgroundColor: settings?.background_color || "#ffffff",
        contactEmail: settings?.email || null,
        contactPhone: settings?.phone || null,
      },
      order: {
        invoiceNumber: order.invoice_number,
        createdAt: order.created_at,
        currency: order.currency || settings?.currency || "BHD",
        subtotal: Number(order.subtotal || 0),
        discount: Number(order.discount || 0),
        shipping: Number(order.shipping || 0),
        total: Number(order.total || 0),
        paymentMethod: order.payment_method,
        paymentStatus: order.payment_status,
        fulfillmentMethod: order.fulfillment_method,
        notes: order.notes,
      },
      customer: {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
      },
      address: order.fulfillment_method === "delivery" && address
        ? {
            label: address.label,
            region: address.region,
            block: address.block,
            road: address.road,
            house: address.house,
            flat: address.flat,
          }
        : null,
      items: (items || []).map((it: any) => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: Number(it.unit_price || 0),
        lineTotal: Number(it.line_total || 0),
        sku: it.product_variants?.sku || null,
        size: it.product_variants?.size || null,
        color: it.product_variants?.color || null,
      })),
      storefrontUrl: `https://boutq.store/${brand.slug}`,
      platformName: PLATFORM_NAME,
    };

    const { subject, html } = renderOrderEmail(emailData);

    if (!SMTP_PASS) {
      throw new Error("ZOHO_SMTP_PASS is not configured on the Edge Function");
    }

    const client = new SMTPClient({
      connection: {
        hostname: SMTP_HOST,
        port: SMTP_PORT,
        tls: true,
        auth: { username: SMTP_USER, password: SMTP_PASS },
      },
    });

    try {
      await client.send({
        from: fromHeader,
        to: customer.email,
        replyTo: settings?.email || FROM_ADDRESS,
        subject,
        html,
      });
    } finally {
      await client.close();
    }

    await supabase
      .from("orders")
      .update({
        confirmation_email_status: "sent",
        confirmation_email_sent_at: new Date().toISOString(),
        confirmation_email_error: null,
      })
      .eq("id", order_id);

    return json({ sent: true });
  } catch (err) {
    console.error("send-order-email failed", err);
    try {
      if (order_id) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        await supabase
          .from("orders")
          .update({
            confirmation_email_status: "failed",
            confirmation_email_error: String((err as Error)?.message || err).slice(0, 500),
          })
          .eq("id", order_id);
      }
    } catch (_) {}
    return json({ error: "SEND_FAILED", message: String((err as Error)?.message || err) }, 500);
  }
});