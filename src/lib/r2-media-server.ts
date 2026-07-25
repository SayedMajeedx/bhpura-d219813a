import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  pdf: "application/pdf",
};

function getMimeType(key: string, contentTypeFromR2?: string | null): string {
  if (contentTypeFromR2 && contentTypeFromR2 !== "application/octet-stream") {
    return contentTypeFromR2;
  }
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[ext] || "application/octet-stream";
}

function sanitizeHeader(val?: string | null): string | undefined {
  if (!val) return undefined;
  return val.trim().replace(/^['"]|['"]$/g, "").trim();
}

export async function handleR2MediaRequest(
  request: Request,
  env: Cloudflare.Env
): Promise<Response> {
  // Only accept GET and HEAD requests for media assets
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const key = url.pathname.replace(/^\/+/, "");

  if (!key || !key.startsWith("brands/")) {
    return new Response("Not Found", { status: 404 });
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // 1. Try native Cloudflare Worker R2 Bucket Binding if bound
  try {
    const r2Binding = (env as any).R2_PUBLIC_BUCKET || (env as any).R2_BUCKET || (env as any).media;
    if (r2Binding && typeof r2Binding.get === "function") {
      const object = await r2Binding.get(key);
      if (object) {
        const headers = new Headers(corsHeaders);
        const mime = getMimeType(key, object.httpMetadata?.contentType);
        headers.set("Content-Type", mime);
        headers.set("Content-Length", String(object.size));
        if (object.httpEtag) headers.set("ETag", object.httpEtag);

        if (request.method === "HEAD") {
          return new Response(null, { status: 200, headers });
        }
        return new Response(object.body, { status: 200, headers });
      }
    }
  } catch (err) {
    console.warn("R2 Bucket binding lookup failed, attempting S3 client fallback:", err);
  }

  // 2. Fallback to S3 Client using R2 API Credentials from env
  try {
    const accountId = sanitizeHeader((env as any).R2_ACCOUNT_ID);
    const accessKeyId = sanitizeHeader((env as any).R2_ACCESS_KEY_ID || (env as any).ACCESS_KEY_ID);
    const secretAccessKey = sanitizeHeader((env as any).R2_SECRET_ACCESS_KEY || (env as any).SECRET_ACCESS_KEY);
    const bucket = sanitizeHeader((env as any).R2_BUCKET_NAME);

    if (accountId && accessKeyId && secretAccessKey && bucket) {
      const client = new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });

      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (res.Body) {
        const headers = new Headers(corsHeaders);
        const mime = getMimeType(key, res.ContentType);
        headers.set("Content-Type", mime);
        if (res.ContentLength) headers.set("Content-Length", String(res.ContentLength));
        if (res.ETag) headers.set("ETag", res.ETag);

        if (request.method === "HEAD") {
          return new Response(null, { status: 200, headers });
        }

        const bodyBytes = await res.Body.transformToByteArray();
        return new Response(bodyBytes, { status: 200, headers });
      }
    }
  } catch (err: any) {
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
      return new Response("Object Not Found", { status: 404, headers: corsHeaders });
    }
    console.error("R2 S3 Client media fetch error:", err);
  }

  return new Response("Media Asset Not Found", { status: 404, headers: corsHeaders });
}
