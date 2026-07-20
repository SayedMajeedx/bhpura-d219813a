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

import { getEnvVariable } from "@/integrations/supabase/auth-middleware";

function required(name: string): string {
  const value = getEnvVariable(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function privateR2() {
  const accountId = required("R2_ACCOUNT_ID");
  const accessKeyId = required("R2_PRIVATE_ACCESS_KEY_ID");
  const secretAccessKey = required("R2_PRIVATE_SECRET_ACCESS_KEY");
  return {
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket: required("R2_PRIVATE_BUCKET_NAME"),
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
