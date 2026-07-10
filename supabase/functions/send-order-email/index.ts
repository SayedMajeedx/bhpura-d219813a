// Send order confirmation email via Zoho SMTP.
// Optimized for Supabase Edge Runtime CPU limits:
//   - Fast auth check (webhook secret OR Supabase JWT)
//   - ONE consolidated DB query (joins on order_items, customer, business_settings)
//   - SMTP work executed inside EdgeRuntime.waitUntil() so the HTTP response
//     returns immediately (202 Accepted) — the client no longer waits on the
//     ~1-3s Zoho SMTPS handshake, avoiding "CPU Time exceeded".

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = { order_id?: string; lang?: "ar" | "en" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SMTP_HOST = Deno.env.get("ZOHO_SMTP_HOST") ?? "smtp.zoho.com";
const SMTP_PORT = Number(Deno.env.get("ZOHO_SMTP_PORT") ?? "465");
const SMTP_USER = Deno.env.get("ZOHO_SMTP_USER") ?? "";
const SMTP_PASS = Deno.env.get("ZOHO_SMTP_PASS") ?? "";
const FROM_ADDRESS = Deno.env.get("ORDER_EMAIL_FROM_ADDRESS") ?? "no-reply@boutq.store";
const WEBHOOK_SECRET = Deno.env.get("ORDER_EMAIL_WEBHOOK_SECRET") ?? "";

// deno-lint-ignore no-explicit-any
const admin: any = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function escapeHtml(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function fmt(n: number, currency: string, isAr: boolean) {
  try {
    return new Intl.NumberFormat(isAr ? "ar-BH" : "en-US", {
      style: "currency", currency, maximumFractionDigits: 3,
    }).format(Number(n || 0));
  } catch {
    return `${Number(n || 0).toFixed(3)} ${currency}`;
  }
}

function renderHtml(o: any, items: any[], brandName: string, primary: string, isAr: boolean) {
  const dir = isAr ? "rtl" : "ltr";
  const L = isAr
    ? { greet: "شكراً لطلبك", intro: "تم استلام طلبك بنجاح. تفاصيله أدناه:", inv: "رقم الفاتورة", date: "التاريخ",
        item: "الصنف", qty: "الكمية", price: "السعر", total: "الإجمالي", subtotal: "المجموع الفرعي",
        shipping: "الشحن", grand: "الإجمالي النهائي", regards: "مع أطيب التحيات", footer: "هذه رسالة تلقائية، الرجاء عدم الرد." }
    : { greet: "Thanks for your order", intro: "We received your order. Details below:", inv: "Invoice #", date: "Date",
        item: "Item", qty: "Qty", price: "Price", total: "Total", subtotal: "Subtotal",
        shipping: "Shipping", grand: "Grand total", regards: "Warm regards", footer: "This is an automated message, please do not reply." };
  const cur = o.currency ?? "BHD";
  const align = isAr ? "left" : "right";
  const rows = items.map((i: any) =>
    `<tr><td style="padding:10px 8px;border-bottom:1px solid #eee">${escapeHtml(i.description)}</td>` +
    `<td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>` +
    `<td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:${align}">${fmt(Number(i.unit_price), cur, isAr)}</td>` +
    `<td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:${align}">${fmt(Number(i.line_total), cur, isAr)}</td></tr>`
  ).join("");
  return `<!doctype html><html lang="${isAr ? "ar" : "en"}" dir="${dir}"><head><meta charset="utf-8"><title>${escapeHtml(brandName)} — ${L.inv} ${escapeHtml(o.invoice_number)}</title></head>
<body style="margin:0;background:#f7f7f8;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111">
<div style="max-width:640px;margin:0 auto;background:#fff">
<div style="padding:24px 28px;background:${primary};color:#fff"><h1 style="margin:0;font-size:22px">${escapeHtml(brandName)}</h1><p style="margin:6px 0 0;opacity:.9">${L.greet}</p></div>
<div style="padding:24px 28px">
<p style="margin:0 0 16px">${L.intro}</p>
<p style="margin:0 0 4px"><strong>${L.inv}:</strong> ${escapeHtml(o.invoice_number)}</p>
<p style="margin:0 0 16px"><strong>${L.date}:</strong> ${new Date(o.order_date).toLocaleDateString(isAr ? "ar-BH" : "en-US")}</p>
<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:14px"><thead><tr>
<th style="padding:10px 8px;border-bottom:2px solid #111;text-align:${isAr ? "right" : "left"}">${L.item}</th>
<th style="padding:10px 8px;border-bottom:2px solid #111;text-align:center">${L.qty}</th>
<th style="padding:10px 8px;border-bottom:2px solid #111;text-align:${align}">${L.price}</th>
<th style="padding:10px 8px;border-bottom:2px solid #111;text-align:${align}">${L.total}</th>
</tr></thead><tbody>${rows}</tbody></table>
<table style="width:100%;margin-top:16px;font-size:14px">
<tr><td style="padding:4px 8px">${L.subtotal}</td><td style="padding:4px 8px;text-align:${align}">${fmt(Number(o.subtotal), cur, isAr)}</td></tr>
${Number(o.shipping) ? `<tr><td style="padding:4px 8px">${L.shipping}</td><td style="padding:4px 8px;text-align:${align}">${fmt(Number(o.shipping), cur, isAr)}</td></tr>` : ""}
<tr><td style="padding:8px;font-weight:700;border-top:1px solid #ddd">${L.grand}</td><td style="padding:8px;font-weight:700;text-align:${align};border-top:1px solid #ddd">${fmt(Number(o.total), cur, isAr)}</td></tr>
</table>
<p style="margin:24px 0 0">${L.regards},<br/><strong>${escapeHtml(brandName)}</strong></p>
</div>
<div style="padding:14px 28px;background:#fafafa;color:#888;font-size:12px;text-align:center">${L.footer}</div>
</div></body></html>`;
}

async function sendAndLog(orderId: string, lang: "ar" | "en") {
  try {
    // ONE query — order + items + customer + settings
    const { data: order, error: oe } = await admin
      .from("orders")
      .select(`
        id, brand_id, invoice_number, order_date, subtotal, shipping, total, currency, customer_id,
        order_items ( description, quantity, unit_price, line_total ),
        customer:customers ( email, name ),
        settings:business_settings!inner ( business_name, primary_color )
      `)
      .eq("id", orderId)
      .maybeSingle();

    if (oe || !order) throw new Error(oe?.message ?? "Order not found");

    const to = (order.customer?.email ?? "").trim();
    if (!to) {
      await admin.from("orders").update({
        confirmation_email_status: "failed",
        confirmation_email_error: "No customer email on file",
      }).eq("id", orderId);
      return;
    }

    const isAr = lang === "ar";
    const brandName = order.settings?.business_name ?? "Boutq";
    const primary = order.settings?.primary_color ?? "#111827";
    const subject = isAr
      ? `${brandName} — تأكيد الطلب #${order.invoice_number}`
      : `${brandName} — Order confirmation #${order.invoice_number}`;
    const html = renderHtml(order, order.order_items ?? [], brandName, primary, isAr);

    const client = new SMTPClient({
      connection: {
        hostname: SMTP_HOST,
        port: SMTP_PORT,
        tls: true,
        auth: { username: SMTP_USER, password: SMTP_PASS },
      },
      pool: false,
      debug: { log: false, allowUnsecure: false, encodeLB: false, noStartTLS: true },
    });

    try {
      // Hard 20s timeout to guarantee we never wedge the runtime
      await Promise.race([
        client.send({ from: `${brandName} <${FROM_ADDRESS}>`, to, subject, html, content: "auto" }),
        new Promise((_r, reject) => setTimeout(() => reject(new Error("SMTP timeout")), 20_000)),
      ]);
    } finally {
      try { await client.close(); } catch { /* noop */ }
    }

    await admin.from("orders").update({
      confirmation_email_status: "sent",
      confirmation_email_sent_at: new Date().toISOString(),
      confirmation_email_error: null,
    }).eq("id", orderId);
  } catch (err: any) {
    const msg = String(err?.message ?? err ?? "Unknown error").slice(0, 500);
    console.error("[send-order-email] failed", msg);
    try {
      await admin.from("orders").update({
        confirmation_email_status: "failed",
        confirmation_email_error: msg,
      }).eq("id", orderId);
    } catch { /* noop */ }
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Auth: webhook secret OR Supabase JWT bearer (admin resend)
  const providedSecret = req.headers.get("x-webhook-secret") ?? "";
  const authz = req.headers.get("authorization") ?? "";
  const hasJwt = authz.toLowerCase().startsWith("bearer ") && authz.length > 20;
  const secretOk = !!WEBHOOK_SECRET && providedSecret === WEBHOOK_SECRET;
  if (!hasJwt && !secretOk) return json({ error: "Unauthorized" }, 401);

  let body: Body = {};
  try { body = await req.json(); } catch { /* noop */ }
  const orderId = body.order_id;
  if (!orderId) return json({ error: "order_id required" }, 400);
  const lang: "ar" | "en" = body.lang === "ar" ? "ar" : "en";

  if (!SMTP_USER || !SMTP_PASS) return json({ error: "SMTP credentials not configured" }, 500);

  // Kick off SMTP work in the background; respond immediately so the client
  // isn't billed for the SMTP handshake latency.
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(sendAndLog(orderId, lang));
    return json({ ok: true, queued: true }, 202);
  }

  // Fallback: run inline (local dev / non-Supabase runtime)
  await sendAndLog(orderId, lang);
  return json({ ok: true });
});
