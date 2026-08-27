import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
async function validToken(
  build: { build_token_hash: string | null; build_token_expires_at: string | null },
  token: string,
) {
  if (
    !build.build_token_hash ||
    !build.build_token_expires_at ||
    new Date(build.build_token_expires_at).getTime() < Date.now()
  )
    return false;
  const actual = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  const a = new TextEncoder().encode(actual);
  const b = new TextEncoder().encode(build.build_token_hash);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json();
    const buildId = String(body.build_id || "");
    const token = String(body.build_token || "");
    const { data: build } = await service
      .from("white_label_app_builds")
      .select("*")
      .eq("id", buildId)
      .maybeSingle();
    if (!build || !(await validToken(build, token)))
      return json({ error: "invalid_or_expired_build_token" }, 401);
    if (body.action === "config") {
      const { data: app } = await service
        .from("white_label_apps")
        .select("*")
        .eq("id", build.app_id)
        .single();
      const { data: brand } = await service
        .from("brands")
        .select("slug")
        .eq("id", build.brand_id)
        .single();
      await service
        .from("white_label_app_builds")
        .update({ status: "building", started_at: new Date().toISOString() })
        .eq("id", build.id);
      await service
        .from("white_label_apps")
        .update({ status: "building", updated_at: new Date().toISOString() })
        .eq("id", build.app_id);
      return json({
        build: { id: build.id, version_name: build.version_name, version_code: build.version_code },
        app: {
          id: app.id,
          app_name: app.app_name,
          android_package: app.android_package,
          storefront_url: app.storefront_url,
          icon_url: app.icon_url,
          splash_logo_url: app.splash_logo_url,
          primary_color: app.primary_color,
          background_color: app.background_color,
          firebase_config: app.firebase_config,
        },
        brand,
      });
    }
    if (body.action === "complete") {
      const succeeded = body.outcome === "success";
      const completed = new Date().toISOString();
      const runUrl = typeof body.run_url === "string" ? body.run_url : null;
      await service
        .from("white_label_app_builds")
        .update({
          status: succeeded ? "succeeded" : "failed",
          provider_run_id: String(body.run_id || "") || null,
          provider_run_url: runUrl,
          apk_url: succeeded ? runUrl : null,
          error_message: succeeded ? null : "GitHub Actions build failed",
          completed_at: completed,
          build_token_hash: null,
          build_token_expires_at: null,
        })
        .eq("id", build.id);
      await service
        .from("white_label_apps")
        .update({
          status: succeeded ? "ready" : "failed",
          latest_apk_url: succeeded ? runUrl : null,
          last_error: succeeded ? null : "GitHub Actions build failed",
          updated_at: completed,
        })
        .eq("id", build.app_id);
      return json({ ok: true });
    }
    return json({ error: "invalid_action" }, 400);
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "build_api_failed" }, 500);
  }
});
