import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Cache of S3Client instances to prevent memory leaks and ensure idempotency
const s3ClientsCache = new Map<string, S3Client>();

function getCachedS3Client(accountId: string, accessKeyId: string, secretAccessKey: string): S3Client {
  const cacheKey = `${accountId}:${accessKeyId}`;
  let client = s3ClientsCache.get(cacheKey);
  
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    s3ClientsCache.set(cacheKey, client);
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
    
    env = event?.context?.cloudflare?.env || 
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

  if (!env) {
    throw new Error("Unable to access the Cloudflare native execution environment context.");
  }

  const accountId = env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim() || env.ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim() || env.SECRET_ACCESS_KEY?.trim();
  // Map exactly to variables specified by dashboard naming guidelines with standard fallbacks
  const bucket = (isPrivate ? (env.R2_PRIVATE_BUCKET || env.R2_PRIVATE_BUCKET_NAME) : env.R2_BUCKET_NAME)?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      `Missing required Cloudflare execution context environment variables. ` +
      `R2_ACCOUNT_ID: ${!!accountId}, R2_ACCESS_KEY_ID: ${!!accessKeyId}, ` +
      `R2_SECRET_ACCESS_KEY: ${!!secretAccessKey}, Bucket (${isPrivate ? 'R2_PRIVATE_BUCKET' : 'R2_BUCKET_NAME'}): ${!!bucket}`
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export async function handleR2Stream(brandId: string, kind: string, filename: string): Promise<Response> {
  const key = `brands/${brandId}/${kind}/${filename}`;
  // QR codes and receipts are stored in the private bucket, others in public
  const isPrivate = kind === "payment-qr" || kind === "expense-receipt";

  try {
    const config = await getR2Config(isPrivate);
    const client = getCachedS3Client(config.accountId, config.accessKeyId, config.secretAccessKey);

    const command = new GetObjectCommand({
      Bucket: config.bucket, // Plain text string bucket name
      Key: key,
    });

    const response = await client.send(command);
    if (!response.Body) {
      return new Response("Not Found", { status: 404 });
    }

    const headers = new Headers();
    if (response.ContentType) {
      headers.set("Content-Type", response.ContentType);
    }
    if (response.CacheControl) {
      headers.set("Cache-Control", response.CacheControl);
    } else {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
    if (response.ContentLength) {
      headers.set("Content-Length", response.ContentLength.toString());
    }

    return new Response(response.Body as any, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error(`Error streaming R2 asset for key "${key}":`, error);
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return new Response("Object Not Found", { status: 404 });
    }
    return new Response(`Streamer Error: ${error.message}`, { status: 500 });
  }
}
