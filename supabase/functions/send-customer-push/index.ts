import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const response = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  const now = new Date().toISOString();
  const { data: events, error } = await supabase.from("customer_push_events").select("*")
    .in("status", ["pending","failed"]).lte("available_at", now).lt("attempts", 5).order("created_at").limit(20);
  if (error) return response({ error: error.message }, 500);
  let accepted = 0;
  for (const event of events ?? []) {
    const { data: claimed } = await supabase.from("customer_push_events")
      .update({ status: "processing", attempts: event.attempts + 1, last_error: null })
      .eq("id", event.id).in("status", ["pending","failed"]).select("id").maybeSingle();
    if (!claimed) continue;
    let query = supabase.from("customer_push_devices").select("id,expo_push_token")
      .eq("brand_id", event.brand_id).eq("enabled", true);
    query = event.customer_id ? query.eq("customer_id", event.customer_id) : query.eq("marketing_enabled", true);
    query = event.event_type === "order_update" ? query.eq("order_updates_enabled", true) : query.eq("marketing_enabled", true);
    const { data: devices, error: deviceError } = await query;
    if (deviceError) {
      await supabase.from("customer_push_events").update({ status:"failed",last_error:deviceError.message,available_at:new Date(Date.now()+60000).toISOString() }).eq("id",event.id);
      continue;
    }
    if (!devices?.length) {
      await supabase.from("customer_push_events").update({ status:"processed",processed_at:now,recipient_count:0 }).eq("id",event.id);
      continue;
    }
    const messages = devices.map((device) => ({
      to: device.expo_push_token, sound: "default", priority: "high",
      channelId: event.event_type === "marketing" ? "pura-offers" : "pura-orders",
      title: event.title, body: event.body,
      data: { ...event.payload, type: event.event_type, url: event.target_url ? new URL(event.target_url, "https://pura.boutq.store").toString() : "https://pura.boutq.store" },
    }));
    try {
      const expo = await fetch("https://exp.host/--/api/v2/push/send", { method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(messages) });
      const result = await expo.json();
      if (!expo.ok) throw new Error(result?.errors?.[0]?.message ?? `Expo ${expo.status}`);
      const tickets = Array.isArray(result.data) ? result.data : [result.data];
      let eventAccepted=0, eventFailed=0;
      for (let index=0; index<devices.length; index+=1) {
        const ticket=tickets[index] ?? {}; const device=devices[index]; const disabled=ticket.details?.error === "DeviceNotRegistered";
        const status=disabled ? "disabled" : ticket.status === "ok" ? "accepted" : "failed";
        if (disabled) await supabase.from("customer_push_devices").update({ enabled:false,updated_at:now }).eq("id",device.id);
        await supabase.from("customer_push_delivery_log").upsert({ event_id:event.id,device_id:device.id,status,provider_ticket_id:ticket.id ?? null,error_message:ticket.message ?? null },{onConflict:"event_id,device_id"});
        if (status === "accepted") eventAccepted+=1; else eventFailed+=1;
      }
      await supabase.from("customer_push_events").update({ status:"processed",processed_at:now,recipient_count:devices.length,accepted_count:eventAccepted,failed_count:eventFailed }).eq("id",event.id);
      accepted += eventAccepted;
    } catch (cause) {
      const message=String(cause instanceof Error ? cause.message : cause).slice(0,800);
      await supabase.from("customer_push_events").update({ status:"failed",last_error:message,available_at:new Date(Date.now()+60000*Math.min(30,2**event.attempts)).toISOString() }).eq("id",event.id);
    }
  }
  return response({ ok:true,events:events?.length ?? 0,accepted });
});
