import { createServerFn } from "@tanstack/react-start";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const mediaKinds = ["logo", "favicon", "font", "product", "category", "hero", "page", "payment-qr"] as const;
const mimeToExtension: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "image/svg+xml": "svg", "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "font/woff": "woff", "font/woff2": "woff2", "font/ttf": "ttf", "font/otf": "otf",
  "application/font-woff": "woff", "application/x-font-ttf": "ttf",
  "application/x-font-opentype": "otf", "application/octet-stream": "bin",
};

const Input = z.object({
  brandId: z.string().uuid(),
  kind: z.enum(mediaKinds),
  contentType: z.string().min(3).max(100),
  size: z.number().int().positive().max(50 * 1024 * 1024),
});

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export const createR2UploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }) => {
    const rpc = context.supabase.rpc as any;
    const [{ data: canAccess }, { data: isAdmin }] = await Promise.all([
      rpc("can_access_brand", { _brand_id: data.brandId }),
      rpc("is_admin"),
    ]);
    if (!canAccess || !isAdmin) throw new Error("FORBIDDEN");

    const extension = mimeToExtension[data.contentType.toLowerCase()];
    if (!extension) throw new Error("UNSUPPORTED_FILE_TYPE");
    const isVideo = data.contentType.startsWith("video/");
    const maxSize = isVideo ? 50 * 1024 * 1024 : data.kind === "font" ? 10 * 1024 * 1024 : 12 * 1024 * 1024;
    if (data.size > maxSize) throw new Error("FILE_TOO_LARGE");
    if (isVideo && !["hero", "product"].includes(data.kind)) throw new Error("UNSUPPORTED_FILE_TYPE");

    const accountId = requiredEnv("R2_ACCOUNT_ID");
    const accessKeyId = requiredEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = requiredEnv("R2_SECRET_ACCESS_KEY");
    const bucket = requiredEnv("R2_BUCKET_NAME");
    const publicBaseUrl = requiredEnv("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");
    const key = `brands/${data.brandId}/${data.kind}/${crypto.randomUUID()}.${extension}`;
    const client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: data.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }), { expiresIn: 300 });
    return { uploadUrl, publicUrl: `${publicBaseUrl}/${key}`, key };
  });
