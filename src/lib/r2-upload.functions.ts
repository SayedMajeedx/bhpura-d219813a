import { createServerFn } from "@tanstack/react-start";
import { DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

const mediaKinds = ["logo", "favicon", "font", "product", "category", "hero", "page", "payment-qr", "expense-receipt"] as const;
export const mimeToExtension: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "image/svg+xml": "svg", "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "font/woff": "woff", "font/woff2": "woff2", "font/ttf": "ttf", "font/otf": "otf",
  "application/font-woff": "woff", "application/x-font-ttf": "ttf",
  "application/x-font-opentype": "otf", "application/octet-stream": "bin",
  "application/pdf": "pdf",
};

const Input = z.object({
  brandId: z.string().uuid(),
  kind: z.enum(mediaKinds),
  contentType: z.string().min(3).max(100),
  size: z.number().int().positive().max(100 * 1024 * 1024),
});

function requiredEnv(name: string): string {
  const value = getPlatformEnv(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function sanitizeValue(val: string | undefined): string | undefined {
  if (!val) return undefined;
  return val.trim().replace(/^['"]|['"]$/g, "").trim();
}

export function r2Client(): { client: S3Client; bucket: string; publicBaseUrl: string } {
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
  const accessKeyId = sanitizeValue(env?.R2_ACCESS_KEY_ID || env?.ACCESS_KEY_ID || g.R2_ACCESS_KEY_ID || g.ACCESS_KEY_ID);
  const secretAccessKey = sanitizeValue(env?.R2_SECRET_ACCESS_KEY || env?.SECRET_ACCESS_KEY || g.R2_SECRET_ACCESS_KEY || g.SECRET_ACCESS_KEY);
  const bucket = sanitizeValue(env?.R2_BUCKET_NAME || g.R2_BUCKET_NAME);
  
  // Provide robust fallback to production storefront custom media domain
  const publicBaseUrl = sanitizeValue(env?.R2_PUBLIC_BASE_URL || g.R2_PUBLIC_BASE_URL) || "https://media.boutq.store";

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      `Missing required Cloudflare execution context environment variables for Public R2 client. ` +
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
    publicBaseUrl,
  };
}

export const createR2UploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }) => {
    const [{ data: canAccess }, { data: isAdmin }] = await Promise.all([
      context.supabase.rpc("can_access_brand", { _brand_id: data.brandId }),
      context.supabase.rpc("is_admin"),
    ]);
    if (!canAccess || !isAdmin) throw new Error("FORBIDDEN");

    const extension = mimeToExtension[data.contentType.toLowerCase()];
    if (!extension) throw new Error("UNSUPPORTED_FILE_TYPE");
    const isVideo = data.contentType.startsWith("video/");
    const maxSize = isVideo ? 100 * 1024 * 1024 : data.kind === "font" ? 10 * 1024 * 1024 : 12 * 1024 * 1024;
    if (data.size > maxSize) throw new Error("FILE_TOO_LARGE");
    if (isVideo && !["hero", "product"].includes(data.kind)) throw new Error("UNSUPPORTED_FILE_TYPE");

    const { client, bucket, publicBaseUrl } = r2Client();
    const key = `brands/${data.brandId}/${data.kind}/${crypto.randomUUID()}.${extension}`;
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: data.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }), { expiresIn: 300 });
    return { uploadUrl, publicUrl: `${publicBaseUrl}/${key}`, key };
  });

const DeleteInput = z.object({
  brandId: z.string().uuid(),
  key: z.string().min(20).max(500),
});

export const deleteR2Object = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => DeleteInput.parse(raw))
  .handler(async ({ data, context }) => {
    const [{ data: canAccess }, { data: isAdmin }] = await Promise.all([
      context.supabase.rpc("can_access_brand", { _brand_id: data.brandId }),
      context.supabase.rpc("is_admin"),
    ]);
    if (!canAccess || !isAdmin) throw new Error("FORBIDDEN");
    if (!data.key.startsWith(`brands/${data.brandId}/`)) throw new Error("INVALID_OBJECT_KEY");
    const { client, bucket } = r2Client();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: data.key }));
    return { deleted: true };
  });

const PurgeBrandInput = z.object({ brandId: z.string().uuid() });

/** Permanently removes every R2 object owned by one brand. Super-admin only. */
export const purgeBrandR2Objects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => PurgeBrandInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: isSuperAdmin, error } = await context.supabase.rpc("is_super_admin");
    if (error || !isSuperAdmin) throw new Error("FORBIDDEN");

    const { client, bucket } = r2Client();
    const prefix = `brands/${data.brandId}/`;
    let continuationToken: string | undefined;
    let deleted = 0;
    do {
      const listed = await client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }));
      const objects = (listed.Contents ?? []).flatMap((object) => object.Key ? [{ Key: object.Key }] : []);
      if (objects.length) {
        await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }));
        deleted += objects.length;
      }
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);
    return { deleted, prefix };
  });
