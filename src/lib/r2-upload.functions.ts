import { createServerFn } from "@tanstack/react-start";
import { DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { getEnvVariable, requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const mediaKinds = ["logo", "favicon", "font", "product", "category", "hero", "page", "payment-qr", "expense-receipt"] as const;
const mimeToExtension: Record<string, string> = {
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
  const value = getEnvVariable(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function r2Client(): { client: S3Client; bucket: string; publicBaseUrl: string } {
  const accountId = requiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = requiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("R2_SECRET_ACCESS_KEY");
  return {
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket: requiredEnv("R2_BUCKET_NAME"),
    publicBaseUrl: requiredEnv("R2_PUBLIC_BASE_URL").replace(/\/+$/, ""),
  };
}

export const createR2UploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
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
  .inputValidator((raw: unknown) => DeleteInput.parse(raw))
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
  .inputValidator((raw: unknown) => PurgeBrandInput.parse(raw))
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
