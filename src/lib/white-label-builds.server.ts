import { AwsClient } from "aws4fetch";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MAX_APK_BYTES = 80 * 1024 * 1024;

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");

async function tokenMatches(expected: string | null, raw: string) {
  if (!expected || !raw) return false;
  const actual = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
  if (actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < actual.length; index += 1) {
    mismatch |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}

function value(input: string | undefined) {
  return input?.trim().replace(/^['"]|['"]$/g, "") || undefined;
}

function objectUrl(env: Cloudflare.Env, key: string) {
  const account = value(env.R2_ACCOUNT_ID);
  const bucket = value(env.R2_BUCKET_NAME);
  if (!account || !bucket) throw new Error("R2_APP_BUILD_STORAGE_NOT_CONFIGURED");
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `https://${account}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}/${encoded}`;
}

export async function handleWhiteLabelApkUpload(request: Request, env: Cloudflare.Env) {
  if (request.method !== "PUT") return new Response("Method Not Allowed", { status: 405 });
  const buildId = request.headers.get("x-build-id")?.trim() || "";
  const buildToken = request.headers.get("x-build-token") || "";
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (!/^[0-9a-f-]{36}$/i.test(buildId) || !buildToken) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (declaredSize > MAX_APK_BYTES) return new Response("APK too large", { status: 413 });

  const { data: build } = await (supabaseAdmin as any)
    .from("white_label_app_builds")
    .select(
      "id,app_id,brand_id,version_name,version_code,status,build_token_hash,build_token_expires_at",
    )
    .eq("id", buildId)
    .maybeSingle();
  if (
    !build ||
    build.status !== "building" ||
    !build.build_token_expires_at ||
    new Date(build.build_token_expires_at).getTime() < Date.now() ||
    !(await tokenMatches(build.build_token_hash, buildToken))
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const apk = await request.arrayBuffer();
  if (!apk.byteLength || apk.byteLength > MAX_APK_BYTES) {
    return new Response("Invalid APK size", { status: 413 });
  }
  const signature = new Uint8Array(apk.slice(0, 4));
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
    return new Response("Invalid APK archive", { status: 422 });
  }
  const sha256 = hex(await crypto.subtle.digest("SHA-256", apk));
  const expectedSha = request.headers.get("x-apk-sha256")?.toLowerCase();
  if (expectedSha && expectedSha !== sha256) {
    return new Response("APK checksum mismatch", { status: 422 });
  }

  const accessKeyId = value(env.R2_ACCESS_KEY_ID);
  const secretAccessKey = value(env.R2_SECRET_ACCESS_KEY);
  if (!accessKeyId || !secretAccessKey) throw new Error("R2_APP_BUILD_STORAGE_NOT_CONFIGURED");
  const key = `app-builds/${build.app_id}/${build.version_code}/${build.id}.apk`;
  const client = new AwsClient({ accessKeyId, secretAccessKey, region: "auto", service: "s3" });
  const uploaded = await client.fetch(objectUrl(env, key), {
    method: "PUT",
    headers: {
      "content-type": "application/vnd.android.package-archive",
      "cache-control": "public, max-age=31536000, immutable",
      "content-disposition": `attachment; filename="boutq-${build.version_code}.apk"`,
    },
    body: apk,
  });
  if (!uploaded.ok) throw new Error(`R2_APK_UPLOAD_FAILED:${uploaded.status}`);
  const base = value(env.R2_PUBLIC_BASE_URL) || "https://media.boutq.store";
  const apkUrl = `${base.replace(/\/$/, "")}/${key}`;
  return Response.json({ apk_url: apkUrl, object_key: key, sha256, size: apk.byteLength });
}
