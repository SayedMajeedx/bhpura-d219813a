import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let getEventFn: any = null;
import(/* @vite-ignore */ "vinxi/http")
  .then((m) => {
    getEventFn = m.getEvent;
  })
  .catch(() => {});

function getPlatformEnv(name: string): string | undefined {
  const viteName = name.startsWith("VITE_") ? name : `VITE_${name}`;
  const unprefixed = name.startsWith("VITE_") ? name.slice(5) : name;

  const searchNames = [name, viteName, unprefixed];
  if (name === "R2_SECRET_ACCESS_KEY") {
    searchNames.push("SECRET_ACCESS_KEY");
  }

  try {
    if (getEventFn) {
      const event = getEventFn();
      const env = event?.context?.cloudflare?.env || 
                  (event?.context as any)?.env || 
                  event?.context?.cloudflare || 
                  (event?.context as any)?.cloudflare?.env;
      if (env) {
        for (const key of searchNames) {
          if (env[key]) return env[key];
        }
      }
    }
  } catch {}

  try {
    const g = globalThis as any;
    const liveEnv = g["__CLOUDFLARE_ENV__"] || g["process"]?.["env"] || process.env;
    if (liveEnv) {
      for (const key of searchNames) {
        if (liveEnv[key]) return liveEnv[key];
      }
    }
  } catch {}

  return undefined;
}

function sanitizeValue(val: string | undefined): string | undefined {
  if (!val) return undefined;
  return val.trim().replace(/^['"]|['"]$/g, "").trim();
}

function privateR2() {
  let env: any = null;
  try {
    if (getEventFn) {
      const event = getEventFn();
      env = event?.context?.cloudflare?.env || 
            event?.context?.env || 
            event?.context?.cloudflare || 
            (event?.context as any)?.cloudflare?.env;
    }
  } catch {}

  // Safe global fallback
  if (!env) {
    try {
      const g = globalThis as any;
      env = g["__CLOUDFLARE_ENV__"] || g["__env__"] || g["process"]?.["env"] || process.env;
    } catch {}
  }

  const g = globalThis as any;
  const accountId = sanitizeValue(env?.R2_ACCOUNT_ID || g.R2_ACCOUNT_ID);
  
  // Fall back to standard S3 keys if private-specific keys are not defined
  const accessKeyId = sanitizeValue(
    env?.R2_PRIVATE_ACCESS_KEY_ID || env?.R2_ACCESS_KEY_ID || env?.ACCESS_KEY_ID || 
    g.R2_PRIVATE_ACCESS_KEY_ID || g.R2_ACCESS_KEY_ID || g.ACCESS_KEY_ID
  );
  const secretAccessKey = sanitizeValue(
    env?.R2_PRIVATE_SECRET_ACCESS_KEY || env?.R2_SECRET_ACCESS_KEY || env?.SECRET_ACCESS_KEY || 
    g.R2_PRIVATE_SECRET_ACCESS_KEY || g.R2_SECRET_ACCESS_KEY || g.SECRET_ACCESS_KEY
  );
  
  // Map to dashboard R2_PRIVATE_BUCKET or R2_PRIVATE_BUCKET_NAME
  const bucket = sanitizeValue(
    env?.R2_PRIVATE_BUCKET || env?.R2_PRIVATE_BUCKET_NAME || 
    g.R2_PRIVATE_BUCKET || g.R2_PRIVATE_BUCKET_NAME
  );

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      `Missing required Cloudflare execution context environment variables for Private R2 client. ` +
      `AccountId: ${!!accountId}, AccessKeyId: ${!!accessKeyId}, SecretAccessKey: ${!!secretAccessKey}, Bucket: ${!!bucket}`
    );
  }

  return {
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  };
}

export async function createPrivateUploadUrl(key: string, contentType: string): Promise<string> {
  const { client, bucket } = privateR2();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      CacheControl: "private, no-store",
      Metadata: { classification: "payment-receipt" },
    }),
    { expiresIn: 300 },
  );
}

export async function inspectPrivateObject(key: string) {
  const { client, bucket } = privateR2();
  return client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
}

export async function createPrivateViewUrl(key: string): Promise<string> {
  const { client, bucket } = privateR2();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseCacheControl: "private, no-store",
      ResponseContentDisposition: "inline",
    }),
    { expiresIn: 300 },
  );
}

export async function deletePrivateObject(key: string): Promise<void> {
  const { client, bucket } = privateR2();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function purgePrivatePrefix(prefix: string): Promise<number> {
  if (!prefix.startsWith("brands/") || prefix.includes("..")) {
    throw new Error("INVALID_PRIVATE_PREFIX");
  }
  const { client, bucket } = privateR2();
  let continuationToken: string | undefined;
  let deleted = 0;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );
    const objects = (listed.Contents ?? []).flatMap((object) =>
      object.Key ? [{ Key: object.Key }] : [],
    );
    if (objects.length) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objects, Quiet: true },
        }),
      );
      deleted += objects.length;
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
  return deleted;
}

export function isPrivateReceiptKey(key: string, brandId?: string): boolean {
  const prefix = brandId ? `brands/${brandId}/benefit-receipts/` : "brands/";
  return key.startsWith(prefix) && key.includes("/benefit-receipts/") && !key.includes("..");
}
