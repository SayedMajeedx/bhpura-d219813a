import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { alertChoice, pushOutcome, webPushRequest } from "./web-push.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: { persistSession: false },
  },
);

// The platform's VAPID keys (secrets VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT); without
// them the installed admin gets no alerts and the merchant app goes on as before.
const vapid = (() => {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: Deno.env.get("VAPID_SUBJECT") || "https://boutq.store" };
})();

type WebTarget = { id: string; endpoint: string; p256dh: string; auth: string };

/**
 * An event to every installed admin that wants it (`web_push_targets`: the store's staff who handle
 * its orders, still active). Best effort per device: a subscription the browser dropped is
 * removed, and one push service failing never holds back the others or the merchant app.
 */
async function deliverToWeb(event: any, base: string): Promise<number> {
  if (!vapid) return 0;
  const { data, error } = await supabase.rpc("web_push_targets", {
    p_brand_id: event.brand_id,
    p_event_type: alertChoice(event),
  });
  const targets = (data ?? []) as WebTarget[];
  if (error || !targets.length) return 0;
  const message = {
    title: event.title,
    body: event.body,
    url: `${base}${event.target_url ?? ""}`,
    tag: `${event.event_type}-${event.entity_id ?? event.id}`,
  };
  const results = await Promise.all(
    targets.map(async (target) => {
      try {
        const { url, init } = await webPushRequest(target, message, vapid);
        const response = await fetch(url, { ...init, redirect: "manual" });
        const outcome = pushOutcome(response.status);
        if (outcome === "gone") {
          await supabase.from("web_push_subscriptions").delete().eq("id", target.id);
        } else if (outcome === "sent") {
          await supabase
            .from("web_push_subscriptions")
            .update({ last_sent_at: new Date().toISOString() })
            .eq("id", target.id);
        }
        return outcome === "sent";
      } catch {
        return false;
      }
    }),
  );
  return results.filter(Boolean).length;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

async function secretsEqual(left: string, right: string): Promise<boolean> {
  if (!left || !right) return false;
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let mismatch = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= leftBytes[index] ^ rightBytes[index];
  }
  return mismatch === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authz = req.headers.get("authorization") ?? "";
  const cronSecretHeader = req.headers.get("x-cron-secret") ?? "";
  const token = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";

  const [isServiceRole, isCronSecret, isCronHeader] = await Promise.all([
    secretsEqual(token, serviceRoleKey),
    secretsEqual(token, cronSecret),
    secretsEqual(cronSecretHeader, cronSecret),
  ]);

  if (!isServiceRole && !isCronSecret && !isCronHeader) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Materialize reminders whose three-day waiting period has elapsed.
  const { data: due } = await supabase
    .from("order_review_requests")
    .select("id,brand_id,order_id,orders(invoice_number)")
    .lte("eligible_at", new Date().toISOString())
    .in("status", ["scheduled", "ready"])
    .limit(50);
  for (const reminder of due ?? []) {
    const invoice = (reminder as any).orders?.invoice_number ?? "—";
    await supabase.from("push_notification_events").upsert(
      {
        brand_id: reminder.brand_id,
        event_type: "review_due",
        entity_type: "review_request",
        entity_id: reminder.id,
        dedupe_key: `review-due:${reminder.id}`,
        title: "حان موعد طلب التقييم",
        body: `الطلب #${invoice} جاهز لإرسال رابط التقييم`,
        target_url: "/reviews",
        payload: { request_id: reminder.id, order_id: reminder.order_id },
      },
      { onConflict: "brand_id,dedupe_key", ignoreDuplicates: true },
    );
  }

  const { data: events, error } = await supabase
    .from("push_notification_events")
    .select("*")
    .in("status", ["pending", "failed"])
    .lte("available_at", new Date().toISOString())
    .lt("attempts", 5)
    .order("created_at")
    .limit(25);
  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  for (const event of events ?? []) {
    const { data: claimed } = await supabase
      .from("push_notification_events")
      .update({ status: "processing", attempts: event.attempts + 1, last_error: null })
      .eq("id", event.id)
      .in("status", ["pending", "failed"])
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const { data: brand } = await supabase
      .from("brands")
      .select("slug")
      .eq("id", event.brand_id)
      .single();
    const { data: devices } = await supabase
      .from("push_devices")
      .select("id,expo_push_token,preferences")
      .eq("enabled", true)
      .or(`brand_id.eq.${event.brand_id},brand_id.is.null`);
    const recipients = (devices ?? []).filter((d) => d.preferences?.[event.event_type] !== false);
    const base = `https://boutq.store/admin/b/${brand?.slug ?? "pura"}`;
    // The installed admin first: once per event, whatever happens to the merchant app's send.
    if (event.attempts === 0) sent += await deliverToWeb(event, base);
    if (!recipients.length) {
      await supabase
        .from("push_notification_events")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("id", event.id);
      continue;
    }

    const messages = recipients.map((device) => ({
      to: device.expo_push_token,
      sound: "default",
      priority: "high",
      channelId: "boutq-updates",
      title: event.title,
      body: event.body,
      data: { ...event.payload, type: event.event_type, url: `${base}${event.target_url ?? ""}` },
    }));
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(messages),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.errors?.[0]?.message ?? `Expo ${response.status}`);
      const tickets = Array.isArray(result.data) ? result.data : [result.data];
      for (let i = 0; i < recipients.length; i += 1) {
        const ticket = tickets[i] ?? {};
        const device = recipients[i];
        const disabled = ticket.details?.error === "DeviceNotRegistered";
        if (disabled)
          await supabase.from("push_devices").update({ enabled: false }).eq("id", device.id);
        await supabase.from("push_delivery_log").upsert(
          {
            event_id: event.id,
            device_id: device.id,
            status: disabled ? "disabled" : ticket.status === "ok" ? "accepted" : "failed",
            provider_ticket_id: ticket.id ?? null,
            error_message: ticket.message ?? null,
          },
          { onConflict: "event_id,device_id" },
        );
      }
      await supabase
        .from("push_notification_events")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("id", event.id);
      sent += recipients.length;
    } catch (cause) {
      await supabase
        .from("push_notification_events")
        .update({
          status: "failed",
          last_error: String(cause instanceof Error ? cause.message : cause).slice(0, 800),
          available_at: new Date(
            Date.now() + 60_000 * Math.min(30, 2 ** event.attempts),
          ).toISOString(),
        })
        .eq("id", event.id);
    }
  }
  return json({ ok: true, events: events?.length ?? 0, sent });
});
