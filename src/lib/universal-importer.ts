import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2Client } from "@/lib/r2-upload.functions";
import { z } from "zod";

const ProductImportSchema = z.object({
  brandId: z.string().uuid(),
  products: z.array(z.object({
    name: z.string(),
    name_ar: z.string().nullable(),
    name_en: z.string().nullable(),
    description: z.string().nullable(),
    description_ar: z.string().nullable(),
    description_en: z.string().nullable(),
    category: z.string().nullable(),
    image_url: z.string().nullable(),
    is_active: z.boolean().default(true),
    featured_trending: z.boolean().default(false),
    show_sale_badge: z.boolean().default(false),
    variants: z.array(z.object({
      size: z.string().nullable(),
      size_unit: z.string().nullable(),
      color: z.string().nullable(),
      fabric: z.string().nullable(),
      sku: z.string(),
      barcode: z.string().nullable(),
      cost_price: z.number().default(0),
      selling_price: z.number().default(0),
      stock_main: z.number().default(0),
      stock_incubator: z.number().default(0),
    })).default([]),
  })),
});

export const importProductCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => ProductImportSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const [{ data: canAccess }, { data: isAdmin }] = await Promise.all([
      context.supabase.rpc("can_access_brand", { _brand_id: data.brandId }),
      context.supabase.rpc("is_admin"),
    ]);
    if (!canAccess || !isAdmin) throw new Error("FORBIDDEN");

    const session = context.session;
    const userId = session?.user?.id;
    if (!userId) throw new Error("UNAUTHORIZED");

    let successCount = 0;
    const totalCount = data.products.length;

    for (const prod of data.products) {
      try {
        let finalImageUrl = prod.image_url;
        let mediaArray: any[] = [];

        // Server-side download of external product image URLs and upload to public R2
        if (prod.image_url && (prod.image_url.startsWith("http://") || prod.image_url.startsWith("https://"))) {
          try {
            const res = await fetch(prod.image_url);
            if (res.ok) {
              const arrayBuffer = await res.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              const contentType = res.headers.get("content-type") || "image/jpeg";
              const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
              const { client, bucket, publicBaseUrl } = r2Client();
              const key = `brands/${data.brandId}/product/${crypto.randomUUID()}.${ext}`;

              await client.send(new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                ContentType: contentType,
                Body: buffer,
                CacheControl: "public, max-age=31536000, immutable",
              }));

              finalImageUrl = `${publicBaseUrl}/${key}`;
              mediaArray.push({ type: "image", url: finalImageUrl });
            }
          } catch (imgErr) {
            console.error("Failed to re-host image from external URL:", prod.image_url, imgErr);
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
          }
        } else {
          // Fallback single default variant
          const { error: varErr } = await context.supabase
            .from("product_variants")
            .insert({
              user_id: userId,
              brand_id: data.brandId,
              product_id: createdProduct.id,
              sku: `SKU-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
              cost_price: 0,
              selling_price: 15.000,
              stock_main: 50,
              stock_incubator: 0,
            });
          if (varErr) {
            console.error("Failed to insert fallback variant:", varErr);
          }
        }

        successCount++;
      } catch (err) {
        console.error("Product import row level exception:", prod.name, err);
      }
    }

    return { successCount, totalCount };
  });
