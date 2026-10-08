import { z } from "zod";

/** What the review screen sends to be saved: one entry per product to create. */
export const productDraftItemSchema = z
  .object({
    id: z.string(),
    url: z.string(),
    isSoldOut: z.boolean(),
    isVideo: z.boolean().optional(),
    postType: z.enum(["image", "carousel", "reel"]).default("image"),
    images: z.array(
      z.object({
        url: z.string(),
        r2Url: z.string().nullable(),
        isCover: z.boolean(),
        selected: z.boolean().optional(),
        status: z.enum(["pending", "success", "failed"]),
        errorMessage: z.string().optional(),
      }),
    ),
    coverImageUrl: z.string(),
    imageUploadStatus: z.enum(["all_success", "partial_success", "failed"]),
    title: z.string(),
    price: z.number().nullable(),
    originalPrice: z.number().nullable().optional(),
    description: z.string(),
    sizes: z.array(z.string()),
    colors: z.array(z.string()).default([]),
    category: z.string().nullable().optional(),
    fieldConfidence: z.object({
      name: z.number(),
      price: z.number(),
      description: z.number(),
      sizes: z.number(),
    }),
    fieldSources: z.object({
      name: z.enum(["ai", "manual"]),
      price: z.enum(["ai", "manual"]),
      description: z.enum(["ai", "manual"]),
      sizes: z.enum(["ai", "manual"]),
      category: z.enum(["ai", "manual"]),
    }),
    priceConflict: z
      .object({
        geminiPrice: z.number().nullable().optional(),
        regexPrice: z.number().nullable().optional(),
        reason: z.string(),
      })
      .optional(),
    issues: z.array(z.string()).default([]),
    // Every other post folded into this product (the review screen merges posts), so none of them is
    // imported again later.
    mergedPostIds: z.array(z.string()).optional(),
  })
  .passthrough();
