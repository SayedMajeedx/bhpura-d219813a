import { AwsClient } from "aws4fetch";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MAX_RELEASE_BYTES = 150 * 1024 * 1024;
const APP_KEYS = new Set(["boutq_os", "pura_line"]);
const PLATFORMS = new Set(["android", "ios"]);

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");

function value(input: string | undefined) {
  return input?.trim().replace(/^['"]|['"]$/g, "") || undefined;
}

function constantTimeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function objectUrl(env: Cloudflare.Env, key: string) {
  const account = value(env.R2_ACCOUNT_ID);
  const bucket = value(env.R2_BUCKET_NAME);
  if (!account || !bucket) throw new Error("R2_MOBILE_RELEASE_STORAGE_NOT_CONFIGURED");
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `https://${account}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}/${encoded}`;
}

export async function handleMobileReleaseUpload(request: Request, env: Cloudflare.Env) {
  if (request.method !== "PUT") return new Response("Method Not Allowed", { status: 405 });
  const suppliedSecret = request.headers.get("x-release-secret") || "";
  const expectedSecret = value(env.MOBILE_RELEASE_UPLOAD_SECRET) || "";
  if (!constantTimeEqual(suppliedSecret, expectedSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const appKey = request.headers.get("x-app-key")?.trim() || "";
  const platform = request.headers.get("x-platform")?.trim() || "";
  const versionName = request.headers.get("x-version-name")?.trim() || "";
  const buildNumber = Number(request.headers.get("x-build-number") || 0);
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (!APP_KEYS.has(appKey) || !PLATFORMS.has(platform)) {
    return new Response("Invalid app or platform", { status: 422 });
  }
  if (
    !/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(versionName) ||
    !Number.isInteger(buildNumber) ||
    buildNumber < 1
  ) {
    return new Response("Invalid release version", { status: 422 });
  }
  if (declaredSize > MAX_RELEASE_BYTES) return new Response("Release too large", { status: 413 });

  const artifact = await request.arrayBuffer();
  if (!artifact.byteLength || artifact.byteLength > MAX_RELEASE_BYTES) {
    return new Response("Invalid release size", { status: 413 });
  }
  const signature = new Uint8Array(artifact.slice(0, 4));
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
    return new Response("Invalid application archive", { status: 422 });
  }
  const sha256 = hex(await crypto.subtle.digest("SHA-256", artifact));
  const expectedSha = request.headers.get("x-artifact-sha256")?.toLowerCase();
  if (expectedSha && expectedSha !== sha256) {
    return new Response("Release checksum mismatch", { status: 422 });
  }

  const extension = platform === "ios" ? "ipa" : "apk";
  const key = `mobile-releases/${appKey}/${platform}/${versionName}-${buildNumber}.${extension}`;
  const accessKeyId = value(env.R2_ACCESS_KEY_ID);
  const secretAccessKey = value(env.R2_SECRET_ACCESS_KEY);
  if (!accessKeyId || !secretAccessKey) throw new Error("R2_MOBILE_RELEASE_STORAGE_NOT_CONFIGURED");
  const client = new AwsClient({ accessKeyId, secretAccessKey, region: "auto", service: "s3" });
  const uploaded = await client.fetch(objectUrl(env, key), {
    method: "PUT",
    headers: {
      "content-type":
        platform === "ios" ? "application/octet-stream" : "application/vnd.android.package-archive",
      "cache-control": "public, max-age=31536000, immutable",
      "content-disposition": `attachment; filename="${appKey}-${versionName}.${extension}"`,
    },
    body: artifact,
  });
  if (!uploaded.ok) throw new Error(`R2_MOBILE_RELEASE_UPLOAD_FAILED:${uploaded.status}`);

  const base = value(env.R2_PUBLIC_BASE_URL) || "https://media.boutq.store";
  const artifactUrl = `${base.replace(/\/$/, "")}/${key}`;
  const { error: deactivateError } = await (supabaseAdmin as any)
    .from("mobile_app_releases")
    .update({ is_active: false })
    .eq("app_key", appKey)
    .eq("platform", platform)
    .eq("is_active", true);
  if (deactivateError)
    throw new Error(`MOBILE_RELEASE_DEACTIVATE_FAILED:${deactivateError.message}`);
  const { data, error } = await (supabaseAdmin as any)
    .from("mobile_app_releases")
    .upsert(
      {
        app_key: appKey,
        platform,
        version_name: versionName,
        build_number: buildNumber,
        artifact_url: artifactUrl,
        object_key: key,
        sha256,
        size_bytes: artifact.byteLength,
        install_method: platform === "ios" ? "altstore" : "direct",
        is_active: true,
      },
      { onConflict: "app_key,platform,build_number" },
    )
    .select("id,artifact_url,sha256,size_bytes")
    .single();
  if (error) throw new Error(`MOBILE_RELEASE_RECORD_FAILED:${error.message}`);
  return Response.json(data);
}
