import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { r2Client } from "@/lib/r2-upload.functions";
import { z } from "zod";

const ProductImportSchema = z.object({
  brandId: z.string().uuid(),
  importSessionId: z.string().uuid().optional(),
  batchIndex: z.number().int().min(0).max(10_000).default(0),
  source: z.enum(["shopify", "salla", "zid", "woocommerce", "custom"]).default("custom"),
  products: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(300),
        name_ar: z.string().trim().max(300).nullable(),
        name_en: z.string().trim().max(300).nullable(),
        description: z.string().max(20_000).nullable(),
        description_ar: z.string().max(20_000).nullable(),
        description_en: z.string().max(20_000).nullable(),
        category: z.string().trim().max(200).nullable(),
        image_url: z.string().url().max(2_000).nullable(),
        is_active: z.boolean().default(true),
        featured_trending: z.boolean().default(false),
        show_sale_badge: z.boolean().default(false),
        variants: z
          .array(
            z.object({
              size: z.string().nullable(),
              size_unit: z.string().nullable(),
              color: z.string().nullable(),
              fabric: z.string().nullable(),
              sku: z.string().trim().max(120),
              barcode: z.string().trim().max(120).nullable(),
              cost_price: z.number().finite().nonnegative().max(100_000).default(0),
              selling_price: z.number().finite().nonnegative().max(100_000).default(0),
              stock_main: z.number().int().nonnegative().max(10_000_000).default(0),
              stock_incubator: z.number().int().nonnegative().max(10_000_000).default(0),
            }),
          )
          .default([]),
      }),
    )
    .min(1)
    .max(100),
});

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function normalizeSku(value: string): string {
  return value.trim().toUpperCase();
}

export function isSafeExternalImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
      return false;
    }
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function downloadExternalImage(
  url: string,
): Promise<{ body: Uint8Array; contentType: string }> {
  let currentUrl = url;
  let response: Response | undefined;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    if (!isSafeExternalImageUrl(currentUrl)) throw new Error("UNSAFE_IMAGE_URL");
    response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "image/jpeg,image/png,image/webp,image/gif" },
    });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    if (!location || redirectCount === 3) throw new Error("UNSAFE_IMAGE_REDIRECT");
    currentUrl = new URL(location, currentUrl).toString();
  }
  if (!response) throw new Error("IMAGE_DOWNLOAD_FAILED");
  if (!response.ok) throw new Error(`IMAGE_DOWNLOAD_${response.status}`);
  const contentType = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (!new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]).has(contentType)) {
    throw new Error("UNSUPPORTED_IMAGE_TYPE");
  }
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength === 0 || body.byteLength > MAX_IMAGE_BYTES)
    throw new Error("IMAGE_TOO_LARGE");
  return { body, contentType };
}

// Helper to verify standard brand access or superadmin impersonation
async function verifyBrandAccess(brandId: string, context: any) {
  const userId = context.userId;
  if (!userId) {
    throw new Error("UNAUTHORIZED: Active user session could not be resolved.");
  }

  // 1. Check direct brand access (standard brand administrators)
  const { data: hasAccess, error: accessErr } = await context.supabase.rpc("can_access_brand", {
    _brand_id: brandId,
  });
  if (accessErr) {
    console.error("Supabase can_access_brand RPC failed:", accessErr);
  }

  if (hasAccess === true) {
    return true; // Direct access granted
  }

  // 2. Check for technical support impersonation token if standard access check fails
  try {
    const { readImpersonationCookie } = await import("@/lib/impersonation-cookies.server");
    const cookieToken = await readImpersonationCookie();
    if (cookieToken) {
      const tokenPayload = JSON.parse(Buffer.from(cookieToken, "base64").toString("utf-8"));
      if (tokenPayload && tokenPayload.targetTenantId === brandId) {
        // Confirm the operator is an authorized Superadmin (via RPC or hardcoded emails)
        const { data: isSuperAdmin } = await context.supabase.rpc("is_admin");
        const email = (context.claims?.email || "").toLowerCase();
        const isFixedSuperAdmin = email === "majeed@hotmail.it" || email === "majeed@hotmail.com";

        if (isSuperAdmin || isFixedSuperAdmin) {
          console.log(
            `[Impersonation Auth] Superadmin (${email}) authorized to perform product import on brand: ${brandId}`,
          );
          return true; // Impersonation access granted
        }
      }
    }
  } catch (err) {
    console.error("Failed to resolve impersonation cookie credentials:", err);
  }

  throw new Error("FORBIDDEN: You do not have permission to import products under this brand.");
}

export const importProductCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => ProductImportSchema.parse(raw))
  .handler(async ({ data, context }) => {
    let auditRunId: string | null = null;
    let auditAdmin: any = null;
    try {
      const userId = context.userId;
      if (!userId) throw new Error("UNAUTHORIZED: Session user not found");

      // Verify permission checks
      await verifyBrandAccess(data.brandId, context);

      const sessionId = data.importSessionId ?? crypto.randomUUID();
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      auditAdmin = supabaseAdmin;
      const { data: run } = await (supabaseAdmin.from("import_runs" as never) as any)
        .insert({
          brand_id: data.brandId,
          created_by: userId,
          session_id: sessionId,
          batch_index: data.batchIndex,
          source: data.source,
          entity_type: "products",
          status: "processing",
          total_count: data.products.length,
        })
        .select("id")
        .maybeSingle();
      auditRunId = run?.id ?? null;

      let successCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      const issues: Array<{ row: number; code: string; name: string }> = [];
      const totalCount = data.products.length;

      const { data: existingVariants, error: existingVariantsError } = await context.supabase
        .from("product_variants")
        .select("sku")
        .eq("brand_id", data.brandId)
        .not("sku", "is", null);
      if (existingVariantsError) throw new Error("IMPORT_PREFLIGHT_FAILED");
      const knownSkus = new Set(
        (existingVariants ?? [])
          .map((row: { sku: string | null }) => normalizeSku(row.sku || ""))
          .filter(Boolean),
      );

      for (const [index, prod] of data.products.entries()) {
        try {
          const incomingSkus = prod.variants
            .map((variant) => normalizeSku(variant.sku))
            .filter(Boolean);
          if (new Set(incomingSkus).size !== incomingSkus.length) {
            failedCount += 1;
            issues.push({ row: index + 1, code: "DUPLICATE_SKU_IN_FILE", name: prod.name });
            continue;
          }
          if (incomingSkus.some((sku) => knownSkus.has(sku))) {
            skippedCount += 1;
            issues.push({ row: index + 1, code: "DUPLICATE_SKU", name: prod.name });
            continue;
          }
          let finalImageUrl = prod.image_url;
          const mediaArray: any[] = [];

          // Server-side download of external product image URLs and upload to public R2
          if (prod.image_url && prod.image_url.startsWith("https://")) {
            try {
              const { body, contentType } = await downloadExternalImage(prod.image_url);
              const ext = contentType.includes("png")
                ? "png"
                : contentType.includes("webp")
                  ? "webp"
                  : contentType.includes("gif")
                    ? "gif"
                    : "jpg";
              const { client, bucket, publicBaseUrl } = r2Client();
              const key = `brands/${data.brandId}/product/${crypto.randomUUID()}.${ext}`;

              await client.send({
                input: {
                  Bucket: bucket,
                  Key: key,
                  ContentType: contentType,
                  Body: body,
                  CacheControl: "public, max-age=31536000, immutable",
                },
              });

              finalImageUrl = `${publicBaseUrl}/${key}`;
              mediaArray.push({ type: "image", url: finalImageUrl });
            } catch (imgErr) {
              finalImageUrl = null;
              issues.push({ row: index + 1, code: "IMAGE_REHOST_FAILED", name: prod.name });
              console.error("Failed to re-host imported image", {
                source: data.source,
                error: imgErr instanceof Error ? imgErr.message : "UNKNOWN_IMAGE_ERROR",
              });
            }
          }

          // Batch insert product
          const { data: createdProduct, error: prodErr } = await context.supabase
            .from("products")
            .insert({
              user_id: userId,
              brand_id: data.brandId,
              name: prod.name,
              name_ar: prod.name_ar,
              name_en: prod.name_en,
              description: prod.description,
              description_ar: prod.description_ar,
              description_en: prod.description_en,
              category: prod.category || "General",
              image_url: finalImageUrl,
              is_active: prod.is_active,
              featured_trending: prod.featured_trending,
              show_sale_badge: prod.show_sale_badge,
              media: mediaArray,
              custom_fields: [],
            })
            .select("id")
            .single();

          if (prodErr || !createdProduct) {
            console.error("Failed to insert product during import:", prod.name, prodErr);
            failedCount += 1;
            issues.push({ row: index + 1, code: "PRODUCT_INSERT_FAILED", name: prod.name });
            continue;
          }

          // Batch insert variants
          if (prod.variants && prod.variants.length > 0) {
            const variantRows = prod.variants.map((v) => ({
              user_id: userId,
              brand_id: data.brandId,
              product_id: createdProduct.id,
              size: v.size,
              size_unit: v.size_unit,
              color: v.color,
              fabric: v.fabric,
              sku: v.sku || `SKU-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
              barcode: v.barcode || null,
              cost_price: v.cost_price,
              selling_price: v.selling_price,
              stock_main: v.stock_main,
              stock_incubator: v.stock_incubator,
            }));

            const { error: varErr } = await context.supabase
              .from("product_variants")
              .insert(variantRows);

            if (varErr) {
              console.error("Failed to insert product variants:", varErr);
              await context.supabase.from("products").delete().eq("id", createdProduct.id);
              failedCount += 1;
              issues.push({ row: index + 1, code: "VARIANT_INSERT_FAILED", name: prod.name });
              continue;
            }
          } else {
            // Fallback single default variant
            const { error: varErr } = await context.supabase.from("product_variants").insert({
              user_id: userId,
              brand_id: data.brandId,
              product_id: createdProduct.id,
              sku: `SKU-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
              cost_price: 0,
              selling_price: 15.0,
              stock_main: 50,
              stock_incubator: 0,
            });
            if (varErr) {
              console.error("Failed to insert fallback variant:", varErr);
              await context.supabase.from("products").delete().eq("id", createdProduct.id);
              failedCount += 1;
              issues.push({ row: index + 1, code: "VARIANT_INSERT_FAILED", name: prod.name });
              continue;
            }
          }

          incomingSkus.forEach((sku) => knownSkus.add(sku));
          successCount++;
        } catch (err) {
          console.error("Product import row level exception:", prod.name, err);
          failedCount += 1;
          issues.push({ row: index + 1, code: "ROW_FAILED", name: prod.name });
        }
      }

      const status = failedCount > 0 || skippedCount > 0 ? "partial" : "completed";
      if (run?.id) {
        await (supabaseAdmin.from("import_runs" as never) as any)
          .update({
            status,
            success_count: successCount,
            skipped_count: skippedCount,
            failed_count: failedCount,
            issues: issues.slice(0, 100),
            completed_at: new Date().toISOString(),
          })
          .eq("id", run.id);
      }
      return {
        importSessionId: sessionId,
        successCount,
        skippedCount,
        failedCount,
        totalCount,
        issues: issues.slice(0, 100),
      };
    } catch (err: any) {
      console.error("[Product Import Pipeline Exception]:", err);
      if (auditRunId && auditAdmin) {
        try {
          await (auditAdmin.from("import_runs" as never) as any)
            .update({
              status: "failed",
              failed_count: data.products.length,
              issues: [{ code: "IMPORT_PIPELINE_FAILED" }],
              completed_at: new Date().toISOString(),
            })
            .eq("id", auditRunId);
        } catch (auditError) {
          console.error("[Product Import Audit Finalization Failed]:", auditError);
        }
      }
      if (err instanceof Error && /^(UNAUTHORIZED|FORBIDDEN):/.test(err.message)) throw err;
      throw new Error("IMPORT_PIPELINE_FAILED: Product catalog import could not be completed");
    }
  });
