import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
const encode = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

async function googleToken(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: account.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const pem = account.private_key.replace(
    /-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,
    "",
  );
  const binary = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token)
    throw new Error(`GOOGLE_AUTH_FAILED:${result.error_description ?? response.status}`);
  return result.access_token as string;
}

async function firebaseRequest(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`https://firebase.googleapis.com/v1beta1/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(`FIREBASE_${response.status}:${result.error?.message ?? "request failed"}`);
  return result;
}

async function provisionFirebase(
  packageName: string,
  displayName: string,
  account: ServiceAccount,
) {
  const token = await googleToken(account);
  const project = account.project_id;
  const listed = await firebaseRequest(`projects/${project}/androidApps`, token);
  let app = (listed.apps ?? []).find(
    (candidate: { packageName: string }) => candidate.packageName === packageName,
  );
  if (!app) {
    const operation = await firebaseRequest(`projects/${project}/androidApps`, token, {
      method: "POST",
      body: JSON.stringify({ packageName, displayName }),
    });
    let completed = operation;
    for (let attempt = 0; attempt < 20 && !completed.done; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      completed = await firebaseRequest(operation.name, token);
    }
    if (!completed.done) throw new Error("FIREBASE_PROVISION_TIMEOUT");
    if (completed.error) throw new Error(`FIREBASE_PROVISION_FAILED:${completed.error.message}`);
    app = completed.response;
  }
  const config = await firebaseRequest(`${app.name}/config`, token);
  const configJson = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(config.configFileContents), (c) => c.charCodeAt(0)),
    ),
  );
  return { projectId: project, appId: app.appId, config: configJson };
}

function androidPackage(slug: string) {
  let segment = slug.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!segment || /^\d/.test(segment)) segment = `b${segment}`;
  return `com.boutq.${segment}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let trackedAppId: string | null = null;
  let trackedBuildId: string | null = null;
  try {
    const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);
    const {
      data: { user },
    } = await service.auth.getUser(jwt);
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: profile } = await service
      .from("profiles")
      .select("role,status")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role !== "super_admin" || profile.status !== "active")
      return json({ error: "super_admin_required" }, 403);
    const body = await req.json();
    const brandId = String(body.brand_id ?? "");
    const { data: brand, error: brandError } = await service
      .from("brands")
      .select("id,slug,name_en,name_ar,logo_url,custom_domain,primary_color")
      .eq("id", brandId)
      .single();
    if (brandError || !brand) return json({ error: "brand_not_found" }, 404);
    const { data: settings } = await service
      .from("business_settings")
      .select(
        "business_name,logo_url,favicon_url,storefront_accent_color,storefront_background_color",
      )
      .eq("brand_id", brand.id)
      .maybeSingle();
    const packageName = androidPackage(brand.slug);
    const appName = settings?.business_name || brand.name_en;
    const storefrontUrl = `https://${brand.custom_domain || `${brand.slug}.boutq.store`}`;
    const { data: existing } = await service
      .from("white_label_apps")
      .select("id,version_code")
      .eq("brand_id", brand.id)
      .maybeSingle();
    if (existing) {
      const { data: activeBuild } = await service
        .from("white_label_app_builds")
        .select("id")
        .eq("app_id", existing.id)
        .in("status", ["queued", "building"])
        .maybeSingle();
      if (activeBuild) return json({ error: "build_already_in_progress" }, 409);
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count } = await service
        .from("white_label_app_builds")
        .select("id", { count: "exact", head: true })
        .eq("app_id", existing.id)
        .gte("created_at", fifteenMinutesAgo);
      if ((count ?? 0) >= 3) return json({ error: "build_rate_limit_reached" }, 429);
    }
    const nextVersion =
      existing && body.rebuild === true ? existing.version_code + 1 : (existing?.version_code ?? 1);
    const identity = {
      brand_id: brand.id,
      app_name: appName,
      android_package: packageName,
      storefront_url: storefrontUrl,
      icon_url: settings?.favicon_url || settings?.logo_url || brand.logo_url,
      splash_logo_url: settings?.logo_url || brand.logo_url,
      primary_color: settings?.storefront_accent_color || brand.primary_color || "#330A0A",
      background_color: settings?.storefront_background_color || "#FFF9F7",
      version_code: nextVersion,
      status: "provisioning",
      last_error: null,
      updated_at: new Date().toISOString(),
    };
    if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(storefrontUrl))
      return json({ error: "invalid_storefront_url" }, 422);
    if (!identity.icon_url || !/^https:\/\//i.test(identity.icon_url))
      return json({ error: "brand_icon_required" }, 422);
    const { data: app, error: upsertError } = await service
      .from("white_label_apps")
      .upsert(identity, { onConflict: "brand_id" })
      .select("*")
      .single();
    if (upsertError) throw upsertError;
    trackedAppId = app.id;
    const rawAccount = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
    if (!rawAccount) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON_NOT_CONFIGURED");
    const firebase = await provisionFirebase(packageName, appName, JSON.parse(rawAccount));
    const { data: ready, error: readyError } = await service
      .from("white_label_apps")
      .update({
        firebase_project_id: firebase.projectId,
        firebase_android_app_id: firebase.appId,
        firebase_config: firebase.config,
        status: "ready_for_build",
        provisioned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", app.id)
      .select("*")
      .single();
    if (readyError) throw readyError;
    const buildToken = crypto.randomUUID() + crypto.randomUUID();
    const buildTokenHash = hex(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(buildToken)),
    );
    const { data: build, error: buildError } = await service
      .from("white_label_app_builds")
      .insert({
        app_id: app.id,
        brand_id: brand.id,
        version_name: ready.version_name,
        version_code: ready.version_code,
        requested_by: user.id,
        build_token_hash: buildTokenHash,
        build_token_expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();
    if (buildError) throw buildError;
    trackedBuildId = build.id;
    await service.from("white_label_apps").update({ latest_build_id: build.id }).eq("id", app.id);
    const githubToken = Deno.env.get("WHITE_LABEL_GITHUB_TOKEN");
    const repository =
      Deno.env.get("WHITE_LABEL_GITHUB_REPOSITORY") || "SayedMajeedx/bhpura-d219813a";
    let dispatched = false;
    if (githubToken) {
      const dispatch = await fetch(`https://api.github.com/repos/${repository}/dispatches`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${githubToken}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          "user-agent": "Boutq-App-Factory",
        },
        body: JSON.stringify({
          event_type: "white-label-build",
          client_payload: { build_id: build.id, build_token: buildToken },
        }),
      });
      if (!dispatch.ok) throw new Error(`GITHUB_DISPATCH_FAILED:${dispatch.status}`);
      dispatched = true;
      await service.from("white_label_apps").update({ status: "building" }).eq("id", app.id);
      await service
        .from("white_label_app_builds")
        .update({ status: "building", started_at: new Date().toISOString() })
        .eq("id", build.id);
    }
    return json({
      ok: true,
      app_id: app.id,
      build_id: build.id,
      package_name: packageName,
      status: dispatched ? "building" : "ready_for_build",
      requires_github_connection: !dispatched,
    });
  } catch (cause) {
    const failedAt = new Date().toISOString();
    const message = cause instanceof Error ? cause.message : "provision_failed";
    if (trackedBuildId) {
      await service
        .from("white_label_app_builds")
        .update({
          status: "failed",
          error_message: message,
          completed_at: failedAt,
          build_token_hash: null,
          build_token_expires_at: null,
        })
        .eq("id", trackedBuildId);
    }
    if (trackedAppId) {
      await service
        .from("white_label_apps")
        .update({ status: "failed", last_error: message, updated_at: failedAt })
        .eq("id", trackedAppId);
    }
    console.error(
      JSON.stringify({
        event: "white_label_provision_failed",
        message,
      }),
    );
    return json({ error: message }, 500);
  }
});
