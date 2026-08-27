import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Materialize reminders whose three-day waiting period has elapsed.
  const { data: due } = await supabase.from("order_review_requests")
    .select("id,brand_id,order_id,orders(invoice_number)")
    .lte("eligible_at", new Date().toISOString()).in("status", ["scheduled", "ready"]).limit(50);
  for (const reminder of due ?? []) {
    const invoice = (reminder as any).orders?.invoice_number ?? "—";
    await supabase.from("push_notification_events").upsert({
      brand_id: reminder.brand_id, event_type: "review_due", entity_type: "review_request",
      entity_id: reminder.id, dedupe_key: `review-due:${reminder.id}`,
      title: "حان موعد طلب التقييم", body: `الطلب #${invoice} جاهز لإرسال رابط التقييم`,
      target_url: "/reviews", payload: { request_id: reminder.id, order_id: reminder.order_id },
    }, { onConflict: "brand_id,dedupe_key", ignoreDuplicates: true });
  }

  const { data: events, error } = await supabase.from("push_notification_events").select("*")
    .in("status", ["pending", "failed"]).lte("available_at", new Date().toISOString())
    .lt("attempts", 5).order("created_at").limit(25);
  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  for (const event of events ?? []) {
    const { data: claimed } = await supabase.from("push_notification_events")
      .update({ status: "processing", attempts: event.attempts + 1, last_error: null })
      .eq("id", event.id).in("status", ["pending", "failed"]).select("id").maybeSingle();
    if (!claimed) continue;

    const { data: brand } = await supabase.from("brands").select("slug").eq("id", event.brand_id).single();
    const { data: devices } = await supabase.from("push_devices").select("id,expo_push_token,preferences")
      .eq("enabled", true).or(`brand_id.eq.${event.brand_id},brand_id.is.null`);
    const recipients = (devices ?? []).filter((d) => d.preferences?.[event.event_type] !== false);
    if (!recipients.length) {
      await supabase.from("push_notification_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", event.id);
      continue;
    }

    const base = `https://boutq.store/admin/b/${brand?.slug ?? "pura"}`;
    const messages = recipients.map((device) => ({
      to: device.expo_push_token, sound: "default", priority: "high", channelId: "boutq-updates",
      title: event.title, body: event.body,
      data: { ...event.payload, type: event.event_type, url: `${base}${event.target_url ?? ""}` },
    }));
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(messages),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.errors?.[0]?.message ?? `Expo ${response.status}`);
      const tickets = Array.isArray(result.data) ? result.data : [result.data];
      for (let i = 0; i < recipients.length; i += 1) {
        const ticket = tickets[i] ?? {};
        const device = recipients[i];
        const disabled = ticket.details?.error === "DeviceNotRegistered";
        if (disabled) await supabase.from("push_devices").update({ enabled: false }).eq("id", device.id);
        await supabase.from("push_delivery_log").upsert({
          event_id: event.id, device_id: device.id, status: disabled ? "disabled" : ticket.status === "ok" ? "accepted" : "failed",
          provider_ticket_id: ticket.id ?? null, error_message: ticket.message ?? null,
        }, { onConflict: "event_id,device_id" });
      }
      await supabase.from("push_notification_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", event.id);
      sent += recipients.length;
    } catch (cause) {
      await supabase.from("push_notification_events").update({
        status: "failed", last_error: String(cause instanceof Error ? cause.message : cause).slice(0, 800),
        available_at: new Date(Date.now() + 60_000 * Math.min(30, 2 ** event.attempts)).toISOString(),
      }).eq("id", event.id);
    }
  }
  return json({ ok: true, events: events?.length ?? 0, sent });
});
