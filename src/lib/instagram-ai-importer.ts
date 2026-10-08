import { createServerFn } from "@tanstack/react-start";
import {
  requireSupabaseAuth,
  getGeminiCredentials,
  getEnvVariableAsync,
} from "@/integrations/supabase/auth-middleware";
import { r2Client } from "@/lib/r2-upload.functions";
import { z } from "zod";
import { productDraftItemSchema } from "@/features/instagram-import/lib/draft-schema";
import { buildDraft, type AiReading } from "@/features/instagram-import/lib/build-draft";
import {
  MAX_IMAGE_BYTES,
  isSafeRemoteImageUrl,
  verifyImageIntegrity,
} from "@/features/instagram-import/lib/image-integrity";
import { postIdsOf } from "@/features/instagram-import/lib/merge-drafts";

// Rate limits documentation constants for UI & error handling
export const RATE_LIMIT_INFO = {
  apify: {
    name: "Apify Instagram Scraper",
    freeTierDesc: "حصة تشغيل محدودة شهرياً وتشغيل متزامن محدود (1-2 تشغيل متزامن)",
    maxRecommendedPerRun: 50,
  },
  gemini: {
    name: "Google Gemini Free Tier",
    rpm: 15, // Requests per minute
    tpm: 1_000_000, // Tokens per minute
    rpd: 1_500, // Requests per day
    recommendedBatchSize: 6,
  },
};

const POST_KEYWORDS_SOLD_OUT = [
  "نفذت الكمية",
  "غير متوفر",
  "مباع",
  "انتهت الكمية",
  "محجوز",
  "sold out",
  "out of stock",
  "unavailable",
  "مبيعة",
  "مبيعه",
  "خلصت",
];

export type PostImageItem = {
  url: string; // Original Instagram CDN URL (temporary)
  r2Url: string | null; // Permanent Cloudflare R2 URL
  isCover: boolean;
  selected?: boolean; // Selected by merchant to be saved to product gallery
  status: "pending" | "success" | "failed";
  errorMessage?: string;
};

export type InstagramPostPreview = {
  id: string;
  url: string;
  images: PostImageItem[];
  coverImageUrl: string;
  caption: string;
  isSoldOut: boolean;
  detectedKeyword?: string;
  date: string;
  /** When it was posted (ISO), to tell which posts were put up together. */
  postedAt?: string;
  isVideo?: boolean;
  postType: "image" | "carousel" | "reel";
};

export type FieldConfidence = {
  name: number; // 0.0 - 1.0
  price: number; // 0.0 - 1.0
  description: number; // 0.0 - 1.0
  sizes: number; // 0.0 - 1.0
};

export type FieldSource = "ai" | "manual";

export type FieldSources = {
  name: FieldSource;
  price: FieldSource;
  description: FieldSource;
  sizes: FieldSource;
  category: FieldSource;
};

export type InstagramProductDraft = {
  id: string;
  url: string;
  isSoldOut: boolean;
  isVideo?: boolean;
  postType: "image" | "carousel" | "reel";
  images: PostImageItem[];
  coverImageUrl: string;
  imageUploadStatus: "all_success" | "partial_success" | "failed";
  title: string;
  price: number | null;
  /** An old price the caption crossed out; shown struck through next to the price. */
  originalPrice?: number | null;
  description: string;
  sizes: string[];
  colors: string[];
  // null when the AI could not confidently infer a category — the extraction
  // prompt is explicit that it must never guess or force a default here.
  category: string | null;
  fieldConfidence: FieldConfidence;
  fieldSources: FieldSources;
  priceConflict?: {
    geminiPrice: number | null;
    regexPrice: number | null;
    reason: string;
  };
  issues: string[];
};

/**
 * Downloads a single remote image, verifies its integrity, and uploads directly to Cloudflare R2.
 */
export async function rehostSingleImageWithIntegrity(
  brandId: string,
  imageUrl: string,
): Promise<{ r2Url: string | null; error?: string }> {
  try {
    if (!isSafeRemoteImageUrl(imageUrl)) {
      return { r2Url: null, error: "رابط الصورة غير آمن أو غير صالح" };
    }

    const imageFetch = await fetch(imageUrl, {
      signal: AbortSignal.timeout(18_000),
      headers: {
        Accept: "image/jpeg,image/png,image/webp,*/*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!imageFetch.ok) {
      return {
        r2Url: null,
        error: `تعذر تنزيل الصورة من سيرفر إنستغرام (كود الاستجابة: ${imageFetch.status})`,
      };
    }

    const contentType = (imageFetch.headers.get("content-type") || "").split(";")[0].toLowerCase();
    const arrayBuffer = await imageFetch.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return { r2Url: null, error: "حجم الصورة يتجاوز الحد الأقصى المسموح (12 ميغابايت)" };
    }

    const integrity = verifyImageIntegrity(buffer, contentType);
    if (!integrity.ok) {
      return { r2Url: null, error: integrity.error };
    }

    const { client, bucket, publicBaseUrl } = r2Client();
    const key = `brands/${brandId}/product/${crypto.randomUUID()}.${integrity.extension}`;

    await client.send({
      input: {
        Bucket: bucket,
        Key: key,
        ContentType: `image/${integrity.extension === "jpg" ? "jpeg" : integrity.extension}`,
        Body: buffer,
        CacheControl: "public, max-age=31536000, immutable",
      },
    });

    return { r2Url: `${publicBaseUrl}/${key}` };
  } catch (err: any) {
    console.error("Rehost single image to Cloudflare R2 failed:", err);
    return {
      r2Url: null,
      error: err?.message || "فشل الاتصال بسحابة التخزين R2",
    };
  }
}

// Client and server sold-out scanning helper
export function scanCaptionForSoldOut(caption: string): { isSoldOut: boolean; keyword?: string } {
  const lower = caption.toLowerCase();
  for (const keyword of POST_KEYWORDS_SOLD_OUT) {
    if (lower.includes(keyword.toLowerCase())) {
      return { isSoldOut: true, keyword };
    }
  }
  return { isSoldOut: false };
}

// 1. Start Instagram Scraping Actor Run via Apify
export const fetchInstagramPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        username: z.string().optional(),
        urls: z.array(z.string()).optional(),
        range: z.number().int().min(1).max(100).default(30),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    let token = await getEnvVariableAsync("APIFY_API_TOKEN");
    if (!token && process.env.APIFY_API_TOKEN) {
      token = process.env.APIFY_API_TOKEN;
    }
    if (!token) {
      throw new Error(
        "رمز APIFY_API_TOKEN غير مهيأ في متغيرات البيئة. يرجى إضافته إلى إعدادات النظام.",
      );
    }

    let cleanUsername = (data.username || "").trim();
    if (cleanUsername) {
      if (cleanUsername.includes("instagram.com/")) {
        const match = cleanUsername.match(/instagram\.com\/([^/?#]+)/);
        if (match && match[1]) {
          cleanUsername = match[1];
        }
      }
      cleanUsername = cleanUsername.replace(/^@/, "").replace(/\/+$/, "").trim();
    }

    const directUrls =
      data.urls && data.urls.length > 0
        ? data.urls
        : cleanUsername
          ? [`https://www.instagram.com/${cleanUsername}/`]
          : [];

    if (directUrls.length === 0) {
      throw new Error("يرجى إدخال اسم حساب إنستغرام أو روابط منشورات مباشرة.");
    }

    try {
      // Trigger the Apify scraping actor run asynchronously
      const runResponse = await fetch(
        `https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=${token}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            directUrls,
            resultsLimit: data.range,
            resultsType: "posts",
          }),
        },
      );

      if (!runResponse.ok) {
        if (runResponse.status === 429) {
          throw new Error(
            "تم تجاوز حد طلبات خدمة السحب (Apify Rate Limit). يرجى الانتظار بضع دقائق ثم المحاولة مجدداً.",
          );
        }
        if (runResponse.status === 401 || runResponse.status === 403) {
          throw new Error(
            "رمز Apify غير صالح أو منتهي الصلاحية. يرجى التحقق من APIFY_API_TOKEN في الإعدادات.",
          );
        }
        const errText = await runResponse.text();
        throw new Error(`فشل بدء مهمة السحب من Apify: (كود ${runResponse.status}) - ${errText}`);
      }

      const runResData = await runResponse.json<{
        data?: { id?: string; defaultDatasetId?: string };
      }>();
      const runId = runResData.data?.id;
      const datasetId = runResData.data?.defaultDatasetId;

      if (!runId || !datasetId) {
        throw new Error("تعذر تهيئة معرف مهمة السحب من إنستغرام.");
      }

      return { runId, datasetId, status: "RUNNING" };
    } catch (error: any) {
      console.error("Apify dynamic scraping start error:", error);
      throw error;
    }
  });

// 2. Check Scraper Run Status
export const checkScraperStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        runId: z.string(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    let token = await getEnvVariableAsync("APIFY_API_TOKEN");
    if (!token && process.env.APIFY_API_TOKEN) {
      token = process.env.APIFY_API_TOKEN;
    }
    if (!token) {
      throw new Error("رمز APIFY_API_TOKEN مفقود.");
    }

    try {
      const response = await fetch(
        `https://api.apify.com/v2/acts/apify~instagram-scraper/runs/${data.runId}?token=${token}`,
      );
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("تم تجاوز حد الاستعلامات لـ Apify. يرجى الانتظار قليلاً.");
        }
        const errText = await response.text();
        throw new Error(`فشل متابعة حالة السحب: (كود ${response.status}) - ${errText}`);
      }

      const resData = await response.json<{ data?: { status?: string } }>();
      const status = resData.data?.status || "FAILED";

      if (status === "FAILED" || status === "TIMED-OUT" || status === "ABORTED") {
        throw new Error(
          `فشلت عملية سحب منشورات إنستغرام بحالة: ${status}. قد يكون الحساب خاصاً (Private) أو المنشور غير متاح للعامة.`,
        );
      }

      return { status };
    } catch (error: any) {
      console.error("Apify run check status error:", error);
      throw error;
    }
  });

// 3. Fetch Scraper Dataset Items with Multi-Image & Reel Detection
export const fetchScraperDataset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        datasetId: z.string(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    let token = await getEnvVariableAsync("APIFY_API_TOKEN");
    if (!token && process.env.APIFY_API_TOKEN) {
      token = process.env.APIFY_API_TOKEN;
    }
    if (!token) {
      throw new Error("رمز APIFY_API_TOKEN مفقود.");
    }

    try {
      const itemsResponse = await fetch(
        `https://api.apify.com/v2/datasets/${data.datasetId}/items?token=${token}`,
      );

      if (!itemsResponse.ok) {
        await itemsResponse.text();
        throw new Error(`فشل استرجاع عناصر البيانات من Apify: (كود ${itemsResponse.status})`);
      }

      const items = (await itemsResponse.json()) as any[];
      if (!Array.isArray(items)) {
        return [];
      }

      const posts: InstagramPostPreview[] = items
        .map((item, index) => {
          const caption = item.caption || item.text || "";
          const { isSoldOut, keyword } = scanCaptionForSoldOut(caption);

          const isVideo = !!(
            item.isVideo ||
            item.type === "Video" ||
            item.type === "Reel" ||
            (item.url && (item.url.includes("/reel/") || item.url.includes("/tv/")))
          );

          // Collect all potential image URLs (carousels vs single image)
          const rawImageUrls: string[] = [];

          if (Array.isArray(item.images) && item.images.length > 0) {
            for (const img of item.images) {
              const url = typeof img === "string" ? img : img?.url || img?.displayUrl;
              if (url && typeof url === "string" && !url.toLowerCase().includes(".mp4")) {
                rawImageUrls.push(url);
              }
            }
          }

          if (Array.isArray(item.childPosts) && item.childPosts.length > 0) {
            for (const child of item.childPosts) {
              const url =
                child.displayUrl ||
                child.thumbnailUrl ||
                (child.images && child.images[0]) ||
                child.url;
              if (url && typeof url === "string" && !url.toLowerCase().includes(".mp4")) {
                if (!rawImageUrls.includes(url)) rawImageUrls.push(url);
              }
            }
          }

          // Single post image fallback
          const singleUrl =
            item.thumbnailUrl ||
            item.displayUrl ||
            (item.displayResources && item.displayResources[0]?.src) ||
            "";
          if (
            singleUrl &&
            !singleUrl.toLowerCase().includes(".mp4") &&
            !rawImageUrls.includes(singleUrl)
          ) {
            rawImageUrls.unshift(singleUrl);
          }

          if (rawImageUrls.length === 0 && singleUrl) {
            rawImageUrls.push(singleUrl);
          }

          const isCarousel = rawImageUrls.length > 1;
          const postType: "image" | "carousel" | "reel" = isVideo
            ? "reel"
            : isCarousel
              ? "carousel"
              : "image";

          const images: PostImageItem[] = rawImageUrls.map((url, i) => ({
            url,
            r2Url: null,
            isCover: i === 0,
            selected: true,
            status: "pending",
          }));

          const postedAt = item.timestamp ? new Date(item.timestamp).toISOString() : undefined;
          const dateStr = postedAt
            ? new Date(postedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "Today";

          return {
            id: item.id || `post-${index}`,
            url: item.url || `https://www.instagram.com/p/${item.shortCode || index}/`,
            images,
            coverImageUrl: rawImageUrls[0] || "",
            caption,
            isSoldOut,
            detectedKeyword: isSoldOut ? keyword : undefined,
            date: dateStr,
            postedAt,
            isVideo,
            postType,
          };
        })
        .filter((p) => p.images.length > 0);

      return posts;
    } catch (error: any) {
      console.error("Apify fetch dataset error:", error);
      throw error;
    }
  });

// 4. Batch Rehost Images to R2 with Integrity Checks & Error Tracking
export const batchRehostAllMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        posts: z.array(z.any()),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const brandId = data.brandId;

    const { data: hasAccess } = await context.supabase.rpc("can_access_brand", {
      _brand_id: brandId,
    });
    if (!hasAccess) throw new Error("UNAUTHORIZED");

    const posts = data.posts as InstagramPostPreview[];
    const processedPosts: InstagramPostPreview[] = [];

    for (const post of posts) {
      // A post's pictures are copied together (a post has a handful); posts one after another.
      const updatedImages: PostImageItem[] = await Promise.all(
        post.images.map(async (img): Promise<PostImageItem> => {
          // If already hosted on R2, skip re-uploading
          if (img.r2Url && img.status === "success") return img;

          const res = await rehostSingleImageWithIntegrity(brandId, img.url);
          return res.r2Url
            ? {
                ...img,
                r2Url: res.r2Url,
                status: "success",
                selected: img.selected !== false,
                errorMessage: undefined,
              }
            : {
                ...img,
                r2Url: null,
                status: "failed",
                selected: false,
                errorMessage: res.error || "فشل تحميل الصورة",
              };
        }),
      );

      // Determine active cover
      const cover = updatedImages.find((i) => i.isCover && i.r2Url) || updatedImages[0];
      const coverImageUrl = cover?.r2Url || "";

      processedPosts.push({
        ...post,
        images: updatedImages,
        coverImageUrl,
      });
    }

    return { posts: processedPosts };
  });

// 5. Retry a single failed image upload
export const retryImageRehostFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        imageUrl: z.string().url(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const brandId = data.brandId;

    const { data: hasAccess } = await context.supabase.rpc("can_access_brand", {
      _brand_id: brandId,
    });
    if (!hasAccess) throw new Error("UNAUTHORIZED");

    const res = await rehostSingleImageWithIntegrity(brandId, data.imageUrl);
    return res;
  });

// 6. Gemini AI Extraction with Per-Field Confidence and Independent Regex Price Reconciliation
export const batchParseCaptionsWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        posts: z.array(z.any()),
        brandId: z.string().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const posts = data.posts as InstagramPostPreview[];
    if (posts.length === 0) return { drafts: [] };

    const { apiKey, model: rawModel } = await getGeminiCredentials(
      context.supabase,
      context.userId,
    );

    let model = rawModel || "gemini-2.0-flash";
    if (model === "gemini-1.5-flash") {
      model = "gemini-1.5-flash-latest";
    }

    let brandAiContextPrompt = "";
    if (data.brandId) {
      try {
        const { getBrandAiContext } = await import("@/lib/store-profile.server");
        const aiCtx = await getBrandAiContext(data.brandId, { lang: "ar" });
        if (aiCtx.combinedSystemPrompt) {
          brandAiContextPrompt = `\nStore context: ${aiCtx.combinedSystemPrompt}`;
        }
      } catch (err) {
        console.warn("[batchParseCaptionsWithAI] Failed to get brand AI context:", err);
      }
    }

    const systemPrompt = [
      "You are an expert GCC boutique e-commerce catalog migration assistant.",
      "Analyze each Instagram post using its caption. Never invent or hallucinate catalog data.",
      ...(brandAiContextPrompt ? [brandAiContextPrompt] : []),
      "CRITICAL TITLE & CODE RULES:",
      "1. NEVER use generic collection slogans, seasonal drops, year labels, or account handles as the product title (e.g. NEVER use 'NEW COLLECTION', 'SUMMER DROP 2026', 'minnaz.couture').",
      "2. LOOK FOR PRODUCT CODES: Check for 'Code: MC5', 'كود: MC5', 'Model: 102', 'MC5'. If a code is found, format title as 'منتج MC5' or 'كود MC5'.",
      "3. IF NO CODE: Find the substantive line describing the item (e.g. 'فستان حرير' or product title).",
      "4. DESCRIPTION: Extract the rich Arabic or English text describing materials, dimensions, and details. Exclude phone numbers, delivery terms, and hashtags.",
      "5. CATEGORY: Infer category ONLY if explicitly stated in caption (e.g. 'فساتين', 'إكسسوارات', 'عطور'). If not mentioned or unclear, return null. Never guess or force a default category.",
      "STRICT PRICE RULES:",
      "6. CURRENCY: Explicitly look for prices in BHD, BD, bd, dinar, دينار, د.ب.",
      "7. IF NO PRICE OR UNCERTAIN: Return price: null. Do NOT guess.",
      "8. EXCLUSIONS: Do NOT confuse sizing numbers or phone numbers with prices.",
      "SIZES & COLORS RULES:",
      "9. Extract sizes ONLY if explicitly stated in the caption (e.g. '52, 54, 56', 'S, M, L, XL', 'مقاسات: 50-60').",
      "10. If no sizes are explicitly mentioned in the caption, return sizes: []. NEVER assume or hallucinate default sizes.",
      "11. Extract colors ONLY if explicitly stated in the caption. Otherwise return colors: [].",
      "CRITICAL CONFIDENCE SCORING (0.0 to 1.0 FOR EACH INDIVIDUAL FIELD):",
      "12. For EACH field ('name', 'price', 'description', 'sizes'), provide a separate numeric confidence score between 0.0 and 1.0:",
      "   - 0.9 to 1.0: Explicitly stated in caption with 100% clarity.",
      "   - 0.6 to 0.8: Strongly inferred but has minor ambiguity.",
      "   - 0.0 to 0.5: Uncertain, ambiguous, or field was missing in caption (price MUST be 0.0 if not mentioned).",
      "Return a valid JSON array matching the requested schema.",
    ].join("\n");

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    let aiResults: any[] = [];

    if (apiKey) {
      try {
        const promptParts: Array<{ text: string }> = posts.map((post) => ({
          text: `POST ID: ${post.id}\nCAPTION:\n${post.caption || "(none)"}\nPOST TYPE: ${post.postType}\n---`,
        }));

        let response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: promptParts }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
              responseSchema: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    price: { type: ["number", "null"] },
                    description: { type: "string" },
                    sizes: { type: "array", items: { type: "string" } },
                    colors: { type: "array", items: { type: "string" } },
                    category: { type: "string" },
                    confidence: {
                      type: "object",
                      properties: {
                        name: { type: "number" },
                        price: { type: "number" },
                        description: { type: "number" },
                        sizes: { type: "number" },
                      },
                      required: ["name", "price", "description", "sizes"],
                    },
                    issues: { type: "array", items: { type: "string" } },
                  },
                  required: [
                    "id",
                    "title",
                    "price",
                    "description",
                    "sizes",
                    "colors",
                    "category",
                    "confidence",
                    "issues",
                  ],
                },
              },
            },
          }),
        });

        // Automatic retry with exponential backoff on 429
        if (response.status === 429) {
          console.warn("Gemini 429 received, waiting 2.5s for retry...");
          await new Promise((r) => setTimeout(r, 2500));
          response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ parts: promptParts }],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json",
              },
            }),
          });
        }

        if (response.ok) {
          const resData = (await response.json()) as any;
          const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            try {
              aiResults = JSON.parse(rawText);
            } catch (pErr) {
              console.error("Failed to parse Gemini JSON output:", pErr, rawText);
            }
          }
        } else {
          console.error(
            "Gemini extraction failed:",
            response.status,
            await response.text().catch(() => ""),
          );
        }
      } catch (gemErr) {
        console.error("Gemini request exception:", gemErr);
      }
    }

    // The store's currency, to tell a price in another currency from the store's own.
    let storeCurrency: string | null = null;
    if (data.brandId) {
      try {
        const { data: settings } = await context.supabase
          .from("business_settings")
          .select("currency")
          .eq("brand_id", data.brandId)
          .maybeSingle();
        storeCurrency = settings?.currency ?? null;
      } catch {
        /* without it, no currency check */
      }
    }

    // Each post becomes a draft; its price is checked against what the caption itself states.
    const drafts = posts.map((post) =>
      buildDraft(post, (aiResults.find((p) => p.id === post.id) ?? {}) as AiReading, {
        storeCurrency,
      }),
    );

    return { drafts };
  });

// 7. Bulk Database Insertion as DRAFTS (is_active: false)
export const bulkInsertProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        products: z.array(productDraftItemSchema),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const brandId = data.brandId;

    const { data: hasAccess } = await context.supabase.rpc("can_access_brand", {
      _brand_id: brandId,
    });
    if (!hasAccess) throw new Error("UNAUTHORIZED");

    if (data.products.length === 0) {
      return { successCount: 0, skippedCount: 0 };
    }

    try {
      // Check existing imports to prevent duplicates
      const existingPostIds = new Set<string>();

      // Check import_runs for previous Instagram imports
      try {
        const { data: existingRuns } = await supabaseAdmin
          .from("import_runs")
          .select("issues")
          .eq("brand_id", brandId)
          .eq("source", "instagram");
        for (const run of existingRuns ?? []) {
          const ids = (run?.issues as { imported_post_ids?: string[] } | null)?.imported_post_ids;
          if (Array.isArray(ids)) ids.forEach((id: string) => existingPostIds.add(String(id)));
        }
      } catch (err) {
        console.warn("Could not query import_runs for existing Instagram posts:", err);
      }

      // Also check legacy products with instagram_post_id in custom_fields
      try {
        const { data: existingProducts } = await supabaseAdmin
          .from("products")
          .select("id, custom_fields")
          .eq("brand_id", brandId);
        for (const row of existingProducts ?? []) {
          const cf = row.custom_fields;
          if (Array.isArray(cf)) {
            for (const item of cf as Record<string, unknown>[]) {
              if (item?.key === "instagram_post_id" && item.value)
                existingPostIds.add(String(item.value));
            }
          } else if (cf && typeof cf === "object" && !Array.isArray(cf)) {
            const val = (cf as Record<string, unknown>).instagram_post_id;
            if (val) existingPostIds.add(String(val));
          }
        }
      } catch (err) {
        console.warn("Could not query legacy custom_fields:", err);
      }

      // A product made of several posts is skipped when any of them was imported before.
      const newProducts = data.products.filter(
        (product) => !postIdsOf(product).some((id) => existingPostIds.has(id)),
      );
      if (newProducts.length === 0) {
        return { successCount: 0, skippedCount: data.products.length };
      }

      let insertedCount = 0;
      const insertedPostIds: string[] = [];

      for (const p of newProducts) {
        // Collect all selected and successful R2 images
        const selectedImages = (p.images || []).filter(
          (img) => img.selected !== false && img.r2Url && img.status === "success",
        );

        // Fallback to all successful images if none specifically marked
        const mediaSource =
          selectedImages.length > 0
            ? selectedImages
            : (p.images || []).filter((img) => img.r2Url && img.status === "success");

        // Order: Cover image first, then remaining selected images
        const coverImg = mediaSource.find((img) => img.isCover) || mediaSource[0];
        const otherImgs = mediaSource.filter((img) => img !== coverImg);
        const orderedMedia = coverImg ? [coverImg, ...otherImgs] : mediaSource;

        const validMedia = orderedMedia.map((img) => ({
          type: "image" as const,
          url: img.r2Url as string,
          is_cover: img === coverImg,
        }));

        // Fallback to cover if media array is empty
        if (validMedia.length === 0 && p.coverImageUrl) {
          validMedia.push({ type: "image" as const, url: p.coverImageUrl, is_cover: true });
        }

        const price = typeof p.price === "number" && !isNaN(p.price) ? p.price : 0;
        const originalPrice =
          typeof p.originalPrice === "number" && p.originalPrice > price ? p.originalPrice : null;

        // Insert product: custom_fields MUST be empty [] so customer customization engine is clean
        const { data: prodData, error: prodErr } = await supabaseAdmin
          .from("products")
          .insert({
            user_id: userId,
            brand_id: brandId,
            name: p.title || "منتج انستقرام",
            name_en: p.title || "Instagram Product",
            name_ar: p.title || "منتج انستقرام",
            description: p.description || "",
            description_en: p.description || "",
            description_ar: p.description || "",
            category:
              p.category && String(p.category).trim() !== "" && p.category !== "عام"
                ? String(p.category).trim()
                : null,
            image_url: coverImg?.r2Url || p.coverImageUrl || (validMedia[0]?.url ?? null),
            is_active: false, // MANDATORY: Always saved as draft!
            featured_trending: false,
            show_sale_badge: false,
            media: validMedia,
            base_price: price, // Set base_price directly on products table
            custom_fields: [], // Clean empty array - never pollute customer customization engine!
          })
          .select("id")
          .single();

        if (prodErr || !prodData?.id) {
          console.error("Failed to insert product draft:", prodErr);
          throw new Error(`فشل إدخال المنتج كمسودة: ${prodErr?.message || "Insert failed"}`);
        }

        insertedCount++;
        insertedPostIds.push(...postIdsOf(p));

        const sizes = Array.isArray(p.sizes)
          ? p.sizes.map((s: string) => String(s).trim()).filter(Boolean)
          : [];
        const colors = Array.isArray(p.colors)
          ? p.colors.map((c: string) => String(c).trim()).filter(Boolean)
          : [];

        let variantRows: any[] = [];

        if (sizes.length > 0 || colors.length > 0) {
          const effectiveSizes = sizes.length > 0 ? sizes : [""];
          const effectiveColors = colors.length > 0 ? colors : [""];
          variantRows = effectiveSizes
            .flatMap((size: string) => effectiveColors.map((color: string) => ({ size, color })))
            .map(({ size, color }) => ({
              user_id: userId,
              brand_id: brandId,
              product_id: prodData.id,
              size: size || null,
              size_unit: "",
              color: color || null,
              fabric: "",
              sku: `IG-${prodData.id.slice(0, 5).toUpperCase()}-${size ? size + "-" : ""}${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
              barcode: null,
              cost_price: 0,
              selling_price: price,
              original_price: originalPrice,
              stock_main: 0,
              stock_incubator: 0,
              stock: 0,
            }));
        } else {
          // Standard single product with no size or color options
          variantRows = [
            {
              user_id: userId,
              brand_id: brandId,
              product_id: prodData.id,
              size: null,
              size_unit: "",
              color: null,
              fabric: "",
              sku: `IG-${prodData.id.slice(0, 5).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
              barcode: null,
              cost_price: 0,
              selling_price: price,
              original_price: originalPrice,
              stock_main: 0,
              stock_incubator: 0,
              stock: 0,
            },
          ];
        }

        if (variantRows.length > 0) {
          const { error: varErr } = await supabaseAdmin
            .from("product_variants")
            .insert(variantRows);

          if (varErr) {
            console.error("Failed to insert product variants:", varErr);
            throw new Error(`فشل إدخال متغيرات المنتج: ${varErr.message}`);
          }
        }
      }

      // Record completed import run for audit trail and deduplication
      if (insertedCount > 0) {
        try {
          await supabaseAdmin.from("import_runs").insert({
            brand_id: brandId,
            session_id: crypto.randomUUID(),
            created_by: userId,
            source: "instagram",
            entity_type: "products",
            status: "completed",
            total_count: data.products.length,
            success_count: insertedCount,
            skipped_count: data.products.length - insertedCount,
            failed_count: 0,
            issues: {
              imported_post_ids: insertedPostIds,
            },
          });
        } catch (auditErr) {
          console.warn("Non-blocking import_runs creation notice:", auditErr);
        }
      }

      return {
        successCount: insertedCount,
        skippedCount: data.products.length - insertedCount,
      };
    } catch (error: any) {
      console.error("Bulk draft insertion failed:", error);
      throw error;
    }
  });
