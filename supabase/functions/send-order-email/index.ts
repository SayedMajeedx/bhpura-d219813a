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
${discount > 0 ? `<tr><td style="padding:4px 8px">${L.discount}</td><td style="padding:4px 8px;text-align:${align}">- ${fmt(discount, cur, isAr)}</td></tr>` : ""}
${showVat ? `<tr><td style="padding:4px 8px">${L.vat}${Number.isFinite(taxRate) ? ` (${taxRate}%)` : ""}</td><td style="padding:4px 8px;text-align:${align}">${fmt(taxAmount, cur, isAr)}</td></tr>` : ""}
${shipping ? `<tr><td style="padding:4px 8px">${L.shipping}</td><td style="padding:4px 8px;text-align:${align}">${fmt(shipping, cur, isAr)}</td></tr>` : ""}
<tr><td style="padding:8px;font-weight:700;border-top:1px solid #ddd">${L.grand}</td><td style="padding:8px;font-weight:700;text-align:${align};border-top:1px solid #ddd">${fmt(total, cur, isAr)}</td></tr>
${showPaymentSummary ? `<tr><td style="padding:8px 8px 4px">${L.paymentStatus}</td><td style="padding:8px 8px 4px;text-align:${align}"><span style="display:inline-block;padding:3px 8px;border-radius:999px;background:#eaf2ff;color:#1558d6;border:1px solid #b8d2ff;font-size:12px">${escapeHtml(paymentStatus)}</span></td></tr>` : ""}
${advancePaid > 0 ? `<tr><td style="padding:4px 8px">${L.advance}</td><td style="padding:4px 8px;text-align:${align}">- ${fmt(advancePaid, cur, isAr)}</td></tr>` : ""}
${advancePaid > 0 ? `<tr><td style="padding:8px;font-weight:700">${L.remaining}</td><td style="padding:8px;font-weight:700;text-align:${align}">${fmt(remaining, cur, isAr)}</td></tr>` : ""}
</table>
<p style="margin:24px 0 0">${L.regards},<br/><strong>${escapeHtml(brandName)}</strong></p>
</div>
<div style="padding:14px 28px;background:#fafafa;color:#888;font-size:12px;text-align:center">${L.footer}</div>
</div></body></html>`;
}

async function sendAndLog(orderId: string, lang: "ar" | "en") {
  try {
    // Query the order and its direct relationships only. business_settings is
    // linked to brands, not orders, so fetch it separately by order.brand_id.
    const { data: order, error: oe } = await admin
      .from("orders")
      .select(`
        id, brand_id, invoice_number, order_date, subtotal, discount, tax_amount, tax_rate,
        shipping, total, currency, customer_id, advance_paid, payment_status,
        order_items ( description, quantity, unit_price, line_total ),
        customer:customers ( email, name )
      `)
      .eq("id", orderId)
      .maybeSingle();

    if (oe || !order) throw new Error(oe?.message ?? "Order not found");

    const { data: settings, error: se } = await admin
      .from("business_settings")
      .select("business_name, primary_color, email_sender_name")
      .eq("brand_id", order.brand_id)
      .maybeSingle();

    if (se) console.warn("[send-order-email] settings lookup failed", se.message);

    const to = (order.customer?.email ?? "").trim();
    if (!to) {
      await admin.from("orders").update({
        confirmation_email_status: "failed",
        confirmation_email_error: "No customer email on file",
      }).eq("id", orderId);
      return;
    }

    const isAr = lang === "ar";
    const brandName = settings?.business_name ?? "Boutq";
    const senderName = settings?.email_sender_name?.trim() || brandName;
    const primary = settings?.primary_color ?? "#111827";
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
        client.send({ from: `${senderName} <${FROM_ADDRESS}>`, to, subject, html, content: "auto" }),
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
