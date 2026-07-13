import { createServerFn } from "@tanstack/react-start";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

const imageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const CreateInput = z.object({
  brandId: z.string().uuid(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(8 * 1024 * 1024),
});
const FinalizeInput = z.object({ receiptId: z.string().uuid(), objectKey: z.string().min(30).max(500) });

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function r2() {
  const accountId = required("R2_ACCOUNT_ID");
  const bucket = required("R2_BUCKET_NAME");
  const publicBase = required("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: required("R2_ACCESS_KEY_ID"), secretAccessKey: required("R2_SECRET_ACCESS_KEY") },
  });
  return { client, bucket, publicBase };
}

export const createBenefitReceiptUpload = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => CreateInput.parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await (supabaseAdmin.from("business_settings") as any)
      .select("brand_id, benefit_enabled, brands!inner(is_active)")
      .eq("brand_id", data.brandId).eq("benefit_enabled", true).eq("brands.is_active", true).maybeSingle();
    if (!settings) throw new Error("BENEFIT_NOT_AVAILABLE");

    const { client, bucket, publicBase } = r2();
    const receiptId = crypto.randomUUID();
    const objectKey = `brands/${data.brandId}/benefit-receipts/${receiptId}.${imageTypes[data.contentType]}`;
    const publicUrl = `${publicBase}/${objectKey}`;
    const { error } = await (supabaseAdmin.from("pending_benefit_receipts") as any).insert({
      id: receiptId, brand_id: data.brandId, object_key: objectKey, public_url: publicUrl,
      content_type: data.contentType, file_size: data.size,
    });
    if (error) throw error;
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({
      Bucket: bucket, Key: objectKey, ContentType: data.contentType, CacheControl: "private, no-store",
    }), { expiresIn: 300 });
    return { receiptId, objectKey, uploadUrl };
  });

export const finalizeBenefitReceiptUpload = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => FinalizeInput.parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pending } = await (supabaseAdmin.from("pending_benefit_receipts") as any)
      .select("id, object_key, content_type, file_size, consumed_at, expires_at")
      .eq("id", data.receiptId).eq("object_key", data.objectKey).maybeSingle();
    if (!pending || pending.consumed_at || new Date(pending.expires_at).getTime() <= Date.now()) throw new Error("RECEIPT_UPLOAD_EXPIRED");
    const { client, bucket } = r2();
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: data.objectKey }));
    if (!head.ContentLength || head.ContentLength !== pending.file_size || head.ContentType !== pending.content_type) throw new Error("RECEIPT_UPLOAD_INVALID");
    const { error } = await (supabaseAdmin.from("pending_benefit_receipts") as any)
      .update({ uploaded_at: new Date().toISOString() }).eq("id", data.receiptId).is("consumed_at", null);
    if (error) throw error;
    return { receiptId: data.receiptId };
  });
