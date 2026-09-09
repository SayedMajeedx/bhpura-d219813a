import { createServerFn } from "@tanstack/react-start";
import {
  requireSupabaseAuth,
  getGeminiCredentials,
  getEnvVariableAsync,
} from "@/integrations/supabase/auth-middleware";
import { r2Client } from "@/lib/r2-upload.functions";
import { z } from "zod";

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
  description: string;
  sizes: string[];
  colors: string[];
  category: string;
  fieldConfidence: FieldConfidence;
  fieldSources: FieldSources;
  priceConflict?: {
    geminiPrice: number | null;
    regexPrice: number | null;
    reason: string;
  };
  issues: string[];
};

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MIN_IMAGE_BYTES = 1024; // Must be at least 1KB to ensure it's not a corrupt empty stub or placeholder

function isSafeRemoteImageUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return false;
    if (host === "localhost" || host.endsWith(".local")) return false;
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(host)) return false;
    const match = host.match(/^172\.(\d+)\./);
    if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates image integrity by checking content-type and magic bytes.
 * Prevents saving HTML error pages or empty placeholders as images.
 */
export function verifyImageIntegrity(
  buffer: Buffer,
  contentType: string,
): { ok: boolean; error?: string; extension: "jpg" | "png" | "webp" } {
  if (buffer.byteLength < MIN_IMAGE_BYTES) {
    return {
      ok: false,
      error: `حجم الملف صغير جداً (${buffer.byteLength} بايت)، قد يكون فارغاً أو تالفاً`,
      extension: "jpg",
    };
  }

  // Check magic bytes
  // JPEG: FF D8 FF
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  // PNG: 89 50 4E 47
  const isPng =
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  // WEBP: RIFF ... WEBP (0x52 0x49 0x46 0x46 ... 0x57 0x45 0x42 0x50)
  const isWebp =
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.toString("ascii", 8, 12) === "WEBP";

  // Check if buffer starts with '<!doctype' or '<html' (HTML error page disguised as image)
  const headerText = buffer.slice(0, 100).toString("utf8").toLowerCase();
  if (
    headerText.includes("<!doctype") ||
    headerText.includes("<html") ||
    headerText.includes("accessdenied") ||
    headerText.includes("<error>")
  ) {
    return {
      ok: false,
      error: "الملف المستلم هو صفحة HTML أو رسالة خطأ وليس ملف صورة صالح",
      extension: "jpg",
    };
  }

  if (isJpeg) return { ok: true, extension: "jpg" };
  if (isPng) return { ok: true, extension: "png" };
  if (isWebp) return { ok: true, extension: "webp" };

  // Fallback to content-type if magic bytes are slightly off but acceptable
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    return { ok: true, extension: "jpg" };
  }
  if (contentType.includes("png")) {
    return { ok: true, extension: "png" };
  }
  if (contentType.includes("webp")) {
    return { ok: true, extension: "webp" };
  }

  return {
    ok: false,
    error: `تنسيق الصورة غير مدعوم (${contentType})`,
    extension: "jpg",
  };
}

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

/**
 * Strict regex validation for currency prices in GCC context.
 * Normalizes Eastern Arabic numerals (٠-٩) and looks for explicit BHD/BD/د.ب/دينار.
 */
export function extractPriceByRegex(caption: string): {
  price: number | null;
  rawMatch: string | null;
  isExplicit: boolean;
} {
  if (!caption) return { price: null, rawMatch: null, isExplicit: false };

  // Normalize Eastern Arabic numerals (٠-٩) to Western (0-9)
  const normalized = caption.replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1632));

  // Regex patterns tailored for GCC / Bahraini Dinar and explicit pricing
  const regexPatterns = [
    // Pattern 1: Explicit keyword "السعر" or "Price" followed by number and optional currency
    // e.g. "السعر: 35 د.ب", "Price: 35 BD", "السعر 35 دينار"
    /(?:السعر|سعر|price|costs?)[\s:]*([0-9]+(?:\.[0-9]{1,3})?)\s*(?:bhd|bd|د\.ب|دينار|دب)?/i,
    // Pattern 2: Number followed immediately by currency symbol
    // e.g. "35 BHD", "35.500 BD", "35 د.ب", "35 دينار", "35دينار"
    /([0-9]+(?:\.[0-9]{1,3})?)\s*(?:bhd|bd|د\.ب|دينار|ديناراً)/i,
    // Pattern 3: Currency symbol followed by number
    // e.g. "BD 35", "BHD 35", "دينار 35"
    /(?:bhd|bd|د\.ب|دينار)\s*([0-9]+(?:\.[0-9]{1,3})?)/i,
  ];

  for (const pattern of regexPatterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      let p = parseFloat(match[1]);
      // Normalize 3-decimal fils notation if entered without decimal (e.g. 35000 -> 35 BHD)
      if (p >= 1000 && p % 1000 === 0) {
        p = p / 1000;
      }
      // Common boutique sense check: Price in BHD is typically between 1.0 and 1500.0 BHD
      // Exclude common abaya sizes if accidentally matched (like size 52, 54, 56, 58, 60 when no currency was around)
      if (p > 0 && p < 2000) {
        return { price: p, rawMatch: match[0], isExplicit: true };
      }
    }
  }

  return { price: null, rawMatch: null, isExplicit: false };
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

    const directUrls =
      data.urls && data.urls.length > 0
        ? data.urls
        : data.username
          ? [`https://www.instagram.com/${data.username.replace(/^@/, "").trim()}/`]
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
        const errText = await itemsResponse.text();
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
            status: "pending",
          }));

          const dateStr = item.timestamp
            ? new Date(item.timestamp).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
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
    const [{ data: hasAccess }, { data: isAdmin }] = await Promise.all([
      context.supabase.rpc("can_access_brand", { _brand_id: brandId }),
      context.supabase.rpc("is_admin"),
    ]);
    if (!hasAccess && !isAdmin) throw new Error("UNAUTHORIZED");

    const posts = data.posts as InstagramPostPreview[];
    const processedPosts: InstagramPostPreview[] = [];

    for (const post of posts) {
      const updatedImages: PostImageItem[] = [];

      for (const img of post.images) {
        // If already hosted on R2, skip re-uploading
        if (img.r2Url && img.status === "success") {
          updatedImages.push(img);
          continue;
        }

        const res = await rehostSingleImageWithIntegrity(brandId, img.url);
        if (res.r2Url) {
          updatedImages.push({
            ...img,
            r2Url: res.r2Url,
            status: "success",
            errorMessage: undefined,
          });
        } else {
          updatedImages.push({
            ...img,
            r2Url: null,
            status: "failed",
            errorMessage: res.error || "فشل تحميل الصورة",
          });
        }
      }

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
    const [{ data: hasAccess }, { data: isAdmin }] = await Promise.all([
      context.supabase.rpc("can_access_brand", { _brand_id: brandId }),
      context.supabase.rpc("is_admin"),
    ]);
    if (!hasAccess && !isAdmin) throw new Error("UNAUTHORIZED");

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

    const systemPrompt = [
      "You are an expert GCC boutique and fashion e-commerce catalog migration assistant.",
      "Analyze each Instagram post using its caption. Never invent or hallucinate catalog data.",
      "CRITICAL TITLE & CODE RULES:",
      "1. NEVER use generic collection slogans, seasonal drops, year labels, or account handles as the product title (e.g. NEVER use 'NEW COLLECTION', 'SUMMER DROP 2026', 'minnaz.couture').",
      "2. LOOK FOR PRODUCT CODES: Check for 'Code: MC5', 'كود: MC5', 'Model: 102', 'MC5'. If a code is found, format title as 'عباية MC5' or 'كود MC5'.",
      "3. IF NO CODE: Find the substantive line describing the garment (e.g. 'عباية بشت حرير مغسول').",
      "4. DESCRIPTION: Extract the rich Arabic or English text describing fabric, cut, and details. Exclude phone numbers, delivery terms, and hashtags.",
      "5. CATEGORY: Infer 'عبايات' (Abayas), 'فساتين' (Dresses), 'جلابيات' (Jalabiya), 'قفاطين' (Kaftans), or 'شيل وطرح' (Scarves). Default to 'عبايات'.",
      "STRICT PRICE RULES:",
      "6. CURRENCY: Explicitly look for prices in BHD, BD, bd, dinar, دينار, د.ب.",
      "7. IF NO PRICE OR UNCERTAIN: Return price: null. Do NOT guess.",
      "8. EXCLUSIONS: Do NOT confuse abaya sizes (50 to 62) or phone numbers with prices.",
      "CRITICAL CONFIDENCE SCORING (0.0 to 1.0 FOR EACH INDIVIDUAL FIELD):",
      "9. For EACH field ('name', 'price', 'description', 'sizes'), provide a separate numeric confidence score between 0.0 and 1.0:",
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
          const resData = await response.json();
          const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
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

    // Map posts into validated drafts with independent regex price reconciliation
    const drafts: InstagramProductDraft[] = posts.map((post) => {
      const parsed = aiResults.find((p) => p.id === post.id) || {};
      const regexCheck = extractPriceByRegex(post.caption);

      const geminiPrice =
        typeof parsed.price === "number" && !isNaN(parsed.price) ? parsed.price : null;
      const regexPrice = regexCheck.price;

      let finalPrice: number | null = null;
      let priceConfidence = Number(parsed.confidence?.price) || 0.0;
      let priceConflict: InstagramProductDraft["priceConflict"] = undefined;
      const issues: string[] = Array.isArray(parsed.issues) ? [...parsed.issues] : [];

      // RECONCILIATION LOGIC:
      if (regexPrice !== null && geminiPrice !== null) {
        if (Math.abs(regexPrice - geminiPrice) < 0.01) {
          // Both agree! High confidence
          finalPrice = regexPrice;
          priceConfidence = Math.max(priceConfidence, 0.95);
        } else {
          // Conflict detected between regex and Gemini!
          // Strictly downgrade confidence to LOW (< 0.4) and leave price empty or require manual confirmation
          finalPrice = null; // Leave empty with red border
          priceConfidence = 0.2;
          priceConflict = {
            geminiPrice,
            regexPrice,
            reason: `تعارض بين قراءة الذكاء الاصطناعي (${geminiPrice} د.ب) ونمط النص الصريح (${regexPrice} د.ب)`,
          };
          issues.push("price_conflict");
        }
      } else if (regexPrice !== null) {
        // Regex found explicit currency pattern, Gemini missed it
        finalPrice = regexPrice;
        priceConfidence = 0.9;
      } else if (geminiPrice !== null) {
        // Gemini guessed a price but regex found NO explicit currency pattern!
        // High risk of hallucination (phone number or size). Downgrade confidence!
        finalPrice = null; // Do NOT set silent default!
        priceConfidence = 0.3;
        priceConflict = {
          geminiPrice,
          regexPrice: null,
          reason: `استخرج الذكاء الاصطناعي سعراً (${geminiPrice}) بدون وجود رمز عملة صريح بالنص`,
        };
        issues.push("unverified_price");
      } else {
        // Neither found a price: price is null and confidence is 0.0
        finalPrice = null;
        priceConfidence = 0.0;
        issues.push("missing_price");
      }

      // Check image upload status across all images in post
      const allSuccess =
        post.images.length > 0 && post.images.every((img) => img.status === "success");
      const anySuccess = post.images.some((img) => img.status === "success");
      const imageUploadStatus: InstagramProductDraft["imageUploadStatus"] = allSuccess
        ? "all_success"
        : anySuccess
          ? "partial_success"
          : "failed";

      if (imageUploadStatus === "failed") {
        issues.push("image_upload_failed");
      }

      // Fallback clean title
      let title = (parsed.title || "").trim();
      if (!title || title.length < 3) {
        title = post.postType === "reel" ? "فيديو إنستغرام جديد" : "عباية أنيقة";
      }

      const description = (parsed.description || post.caption || "").trim();
      const sizes =
        Array.isArray(parsed.sizes) && parsed.sizes.length > 0 ? parsed.sizes : ["52", "54", "56"];
      const colors = Array.isArray(parsed.colors) ? parsed.colors : [];
      const category = parsed.category || "عبايات";

      const nameConfidence = Math.max(0, Math.min(1, Number(parsed.confidence?.name) || 0.7));
      const descConfidence = Math.max(
        0,
        Math.min(1, Number(parsed.confidence?.description) || 0.75),
      );
      const sizesConfidence = Math.max(0, Math.min(1, Number(parsed.confidence?.sizes) || 0.7));

      return {
        id: post.id,
        url: post.url,
        isSoldOut: post.isSoldOut,
        isVideo: post.isVideo,
        postType: post.postType,
        images: post.images,
        coverImageUrl: post.coverImageUrl,
        imageUploadStatus,
        title,
        price: finalPrice,
        description,
        sizes,
        colors,
        category,
        fieldConfidence: {
          name: nameConfidence,
          price: priceConfidence,
          description: descConfidence,
          sizes: sizesConfidence,
        },
        fieldSources: {
          name: "ai",
          price: finalPrice !== null ? "ai" : "manual",
          description: "ai",
          sizes: "ai",
          category: "ai",
        },
        priceConflict,
        issues: [...new Set(issues)],
      };
    });

    return { drafts };
  });

const productDraftItemSchema = z.object({
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
      status: z.enum(["pending", "success", "failed"]),
      errorMessage: z.string().optional(),
    }),
  ),
  coverImageUrl: z.string(),
  imageUploadStatus: z.enum(["all_success", "partial_success", "failed"]),
  title: z.string(),
  price: z.number().nullable(),
  description: z.string(),
  sizes: z.array(z.string()),
  colors: z.array(z.string()).default([]),
  category: z.string(),
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
  issues: z.array(z.string()).default([]),
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

    const [{ data: hasAccess }, { data: isAdmin }] = await Promise.all([
      context.supabase.rpc("can_access_brand", { _brand_id: brandId }),
      context.supabase.rpc("is_admin"),
    ]);
    if (!hasAccess && !isAdmin) throw new Error("UNAUTHORIZED");

    if (data.products.length === 0) {
      return { successCount: 0, skippedCount: 0 };
    }

    try {
      // Check existing imports to prevent duplicates
      const { data: existingProducts, error: existingError } = await (supabaseAdmin
        .from("products" as never) as any)
        .select("id, custom_fields")
        .eq("brand_id", brandId);
      if (existingError)
        throw new Error(`Failed to check existing imports: ${existingError.message}`);

      const existingPostIds = new Set<string>();
      if (Array.isArray(existingProducts)) {
        for (const row of existingProducts) {
          if (Array.isArray(row.custom_fields)) {
            const field = row.custom_fields.find((f: any) => f?.key === "instagram_post_id");
            if (field?.value) existingPostIds.add(String(field.value));
          } else if (row.custom_fields && typeof row.custom_fields === "object") {
            if (row.custom_fields.instagram_post_id) {
              existingPostIds.add(String(row.custom_fields.instagram_post_id));
            }
          }
        }
      }

      const newProducts = data.products.filter((product) => !existingPostIds.has(product.id));
      if (newProducts.length === 0) {
        return { successCount: 0, skippedCount: data.products.length };
      }

      let insertedCount = 0;

      for (const p of newProducts) {
        // Collect all successful R2 images
        const validMedia = p.images
          .filter((img) => img.r2Url && img.status === "success")
          .map((img) => ({
            type: "image",
            url: img.r2Url as string,
            is_cover: img.isCover,
          }));

        // Fallback to cover if media array is empty
        if (validMedia.length === 0 && p.coverImageUrl) {
          validMedia.push({ type: "image", url: p.coverImageUrl, is_cover: true });
        }

        const customFieldsArray = [
          {
            key: "instagram_post_id",
            value: p.id,
            label_ar: "منشور انستقرام",
            label_en: "Instagram Post ID",
          },
          {
            key: "instagram_permalink",
            value: p.url,
            label_ar: "رابط المنشور",
            label_en: "Post Permalink",
          },
          {
            key: "extraction_confidence",
            value: JSON.stringify(p.fieldConfidence),
            label_ar: "درجة ثقة الاستخراج",
            label_en: "Extraction Confidence",
          },
          {
            key: "field_sources",
            value: JSON.stringify(p.fieldSources),
            label_ar: "مصدر الحقول",
            label_en: "Field Sources",
          },
        ];

        const { data: prodData, error: prodErr } = await (supabaseAdmin
          .from("products" as never) as any)
          .insert({
            user_id: userId,
            brand_id: brandId,
            name: p.title || "منتج انستقرام",
            name_en: p.title || "Instagram Product",
            name_ar: p.title || "منتج انستقرام",
            description: p.description || "",
            description_en: p.description || "",
            description_ar: p.description || "",
            category: p.category || "عام",
            image_url: p.coverImageUrl || (validMedia[0]?.url ?? null),
            is_active: false, // MANDATORY: Always saved as draft!
            featured_trending: false,
            show_sale_badge: false,
            media: validMedia,
            custom_fields: customFieldsArray,
          })
          .select("id")
          .single();

        if (prodErr || !prodData?.id) {
          console.error("Failed to insert product draft:", prodErr);
          throw new Error(`فشل إدخال المنتج كمسودة: ${prodErr?.message || "Insert failed"}`);
        }

        insertedCount++;

        const sizes = Array.isArray(p.sizes) && p.sizes.length > 0 ? p.sizes : [""];
        const colors = Array.isArray(p.colors) && p.colors.length > 0 ? p.colors : [""];
        const price = typeof p.price === "number" && !isNaN(p.price) ? p.price : 0;

        const variantRows = sizes
          .flatMap((size: string) => colors.map((color: string) => ({ size, color })))
          .map(({ size, color }) => ({
            user_id: userId,
            brand_id: brandId,
            product_id: prodData.id,
            size,
            size_unit: "",
            color,
            fabric: "",
            sku: `IG-${prodData.id.slice(0, 5).toUpperCase()}-${size ? size + "-" : ""}${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            barcode: null,
            cost_price: 0,
            selling_price: price,
            stock_main: 0,
            stock_incubator: 0,
          }));

        if (variantRows.length > 0) {
          const { error: varErr } = await (supabaseAdmin
            .from("product_variants" as never) as any)
            .insert(variantRows);

          if (varErr) {
            console.error("Failed to insert product variants:", varErr);
            throw new Error(`فشل إدخال متغيرات المنتج: ${varErr.message}`);
          }
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
