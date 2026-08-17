import { AwsClient } from "aws4fetch";

// Cache of AwsClient instances to prevent memory leaks and ensure idempotency
const awsClientsCache = new Map<string, AwsClient>();

function sanitizeValue(val: string | undefined): string | undefined {
  if (!val) return undefined;
  return val
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

function getCachedAwsClient(accessKeyId: string, secretAccessKey: string): AwsClient {
  const cacheKey = `${accessKeyId}:${secretAccessKey}`;
  let client = awsClientsCache.get(cacheKey);

  if (!client) {
    client = new AwsClient({
      accessKeyId,
      secretAccessKey,
      region: "auto",
      service: "s3",
    });
    awsClientsCache.set(cacheKey, client);
  }

  return client;
}

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

async function getR2Config(isPrivate: boolean = false): Promise<R2Config> {
  let env: any = null;

  // 1. Try Cloudflare request context dynamically via Vinxi/H3 event
  try {
    const vinxiHttp = "vinxi/http";
    const { getEvent } = await import(vinxiHttp);
    const event = getEvent();

    env =
      event?.context?.cloudflare?.env ||
      event?.context?.env ||
      event?.context?.cloudflare ||
      (event?.context as any)?.cloudflare?.env;
  } catch (err) {
    console.error("[R2 Context Error] Failed to retrieve H3 event execution context:", err);
  }

  // 2. Fall back safely to global environment contexts (e.g. globalThis.__env__ injected by Vite)
  if (!env) {
    try {
      const g = globalThis as any;
      env = g["__CLOUDFLARE_ENV__"] || g["__env__"] || g["process"]?.["env"] || process.env;
    } catch {}
  }

  const g = globalThis as any;
  const accountId = sanitizeValue(env?.R2_ACCOUNT_ID || g.R2_ACCOUNT_ID);
  const accessKeyId = sanitizeValue(
    env?.R2_ACCESS_KEY_ID || env?.ACCESS_KEY_ID || g.R2_ACCESS_KEY_ID || g.ACCESS_KEY_ID,
  );
  const secretAccessKey = sanitizeValue(
    env?.R2_SECRET_ACCESS_KEY ||
      env?.SECRET_ACCESS_KEY ||
      g.R2_SECRET_ACCESS_KEY ||
      g.SECRET_ACCESS_KEY,
  );

  // Map exactly to variables specified by dashboard naming guidelines with standard fallbacks
  const rawBucket = isPrivate
    ? env?.R2_PRIVATE_BUCKET ||
      env?.R2_PRIVATE_BUCKET_NAME ||
      g.R2_PRIVATE_BUCKET ||
      g.R2_PRIVATE_BUCKET_NAME
    : env?.R2_BUCKET_NAME || g.R2_BUCKET_NAME;
  const bucket = sanitizeValue(rawBucket);

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Missing required Cloudflare execution context environment variables for R2 initialization.",
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export async function handleR2Stream(
  brandId: string,
  kind: string,
  filename: string,
): Promise<Response> {
  const key = `brands/${brandId}/${kind}/${filename}`;
  // Receipts are stored in the private bucket, others in public
  const isPrivate =
    kind === "expense-receipt" || kind === "benefit-receipts" || kind.includes("receipt");

  try {
    const config = await getR2Config(isPrivate);
    const client = getCachedAwsClient(config.accessKeyId, config.secretAccessKey);
    const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
    const url = `${endpoint}/${encodeURIComponent(config.bucket)}/${key}`;

    const r2Res = await client.fetch(url, { method: "GET" });
    if (!r2Res.ok) {
      if (r2Res.status === 404) {
        return new Response("Object Not Found", { status: 404 });
      }
      return new Response(`Streamer Error: ${r2Res.statusText}`, { status: r2Res.status });
    }

    const headers = new Headers();
    const contentType = r2Res.headers.get("content-type");
    if (contentType) {
      headers.set("Content-Type", contentType);
    }
    const cacheControl = r2Res.headers.get("cache-control");
    if (cacheControl) {
      headers.set("Cache-Control", cacheControl);
    } else {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
    const contentLength = r2Res.headers.get("content-length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new Response(r2Res.body, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error(`Error streaming R2 asset for key "${key}":`, error);
    return new Response(`Streamer Error: ${error.message}`, { status: 500 });
  }
}

export async function handlePlatformR2Stream(filename: string): Promise<Response> {
  const key = `platform/${filename}`;

  try {
    const config = await getR2Config(false); // platform files are in public bucket
    const client = getCachedAwsClient(config.accessKeyId, config.secretAccessKey);
    const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
    const url = `${endpoint}/${encodeURIComponent(config.bucket)}/${key}`;

    const r2Res = await client.fetch(url, { method: "GET" });
    if (!r2Res.ok) {
      if (r2Res.status === 404) {
        return new Response("Object Not Found", { status: 404 });
      }
      return new Response(`Streamer Error: ${r2Res.statusText}`, { status: r2Res.status });
    }

    const headers = new Headers();
    const contentType = r2Res.headers.get("content-type");
    if (contentType) {
      headers.set("Content-Type", contentType);
    }
    const cacheControl = r2Res.headers.get("cache-control");
    if (cacheControl) {
      headers.set("Cache-Control", cacheControl);
    } else {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
    const contentLength = r2Res.headers.get("content-length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new Response(r2Res.body, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error(`Error streaming platform asset for key "${key}":`, error);
    return new Response(`Streamer Error: ${error.message}`, { status: 500 });
  }
}
