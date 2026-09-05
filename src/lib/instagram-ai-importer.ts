import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth, getGeminiCredentials, getEnvVariableAsync } from "@/integrations/supabase/auth-middleware";
import { r2Client } from "@/lib/r2-upload.functions";
import { z } from "zod";

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

export type InstagramPostPreview = {
  id: string;
  url: string;
  imageUrl: string;
  caption: string;
  isSoldOut: boolean;
  detectedKeyword?: string;
  date: string;
  isVideo?: boolean;
};

export type InstagramProductDraft = {
  id: string;
  imageUrl: string;
  url: string;
  isSoldOut: boolean;
  title: string;
  price: number | null;
  description: string;
  sizes: string[];
  colors: string[];
  category: string;
  confidence: number;
  issues: string[];
};

const MAX_VISION_IMAGE_BYTES = 1.5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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

async function imagePartForGemini(imageUrl: string) {
  try {
    if (!isSafeRemoteImageUrl(imageUrl)) return null;
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(3_500),
      headers: { Accept: "image/jpeg,image/png,image/webp" },
    });
    if (!response.ok) return null;
    const mimeType = (response.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(mimeType)) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_VISION_IMAGE_BYTES) return null;
    return { inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } };
  } catch {
    return null;
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

// 1. Start Instagram Scraping Actor Run
export const fetchInstagramPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        username: z.string().optional(),
        urls: z.array(z.string()).optional(),
        range: z.number().int().min(5).max(100).default(50),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
      throw new Error(
        "Missing APIFY_API_TOKEN environment variable. Please configure it in your environment settings.",
      );
    }
    const directUrls =
      data.urls && data.urls.length > 0
        ? data.urls
        : data.username
          ? [`https://www.instagram.com/${data.username.replace(/^@/, "").trim()}/`]
          : [];

    if (directUrls.length === 0) {
      throw new Error("Either username or direct URLs must be provided.");
    }

    try {
      // Trigger the scraping actor run asynchronously
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
        const errText = await runResponse.text();
        throw new Error(`Failed to start Apify scraper: Status ${runResponse.status} - ${errText}`);
      }

      const runResData = await runResponse.json<{
        data?: { id?: string; defaultDatasetId?: string };
      }>();
      const runId = runResData.data?.id;
      const datasetId = runResData.data?.defaultDatasetId;

      if (!runId || !datasetId) {
        throw new Error("Failed to initialize Apify scraper run structure.");
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
    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
      throw new Error("Missing APIFY_API_TOKEN environment variable.");
    }

    try {
      const response = await fetch(
        `https://api.apify.com/v2/acts/apify~instagram-scraper/runs/${data.runId}?token=${token}`,
      );
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to poll status: Status ${response.status} - ${errText}`);
      }

      const resData = await response.json<{ data?: { status?: string } }>();
      const status = resData.data?.status || "FAILED";

      if (status === "FAILED" || status === "TIMED-OUT" || status === "ABORTED") {
        throw new Error(`Scraping task run failed with status: ${status}`);
      }

      return { status };
    } catch (error: any) {
      console.error("Apify run check status error:", error);
      throw error;
    }
  });

// 3. Fetch Scraper Dataset Items
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
    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
      throw new Error("Missing APIFY_API_TOKEN environment variable.");
    }

    try {
      const itemsResponse = await fetch(
        `https://api.apify.com/v2/datasets/${data.datasetId}/items?token=${token}`,
      );
      if (!itemsResponse.ok) {
        const errText = await itemsResponse.text();
        throw new Error(
          `Failed to retrieve dataset items: Status ${itemsResponse.status} - ${errText}`,
        );
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

          // Prioritized fallback cover image sequence
          let imageUrl =
            item.thumbnailUrl ||
            item.displayUrl ||
            (item.images && item.images[0]) ||
            (item.displayResources && item.displayResources[0]?.src) ||
            "";

          // Enforce safety checks to ensure we never capture a raw .mp4 string
          if (imageUrl.toLowerCase().includes(".mp4")) {
            // Attempt fallbacks
            imageUrl =
              item.thumbnailUrl || item.displayUrl || (item.images && item.images[0]) || "";
            if (imageUrl.toLowerCase().includes(".mp4")) {
              imageUrl = "";
            }
          }

          const dateStr = item.timestamp
            ? new Date(item.timestamp).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : "Today";

          return {
            id: item.id || `post-${index}`,
            url: item.url || `https://www.instagram.com/p/${item.shortCode || index}/`,
            imageUrl,
            caption,
            isSoldOut,
            detectedKeyword: isSoldOut ? keyword : undefined,
            date: dateStr,
            isVideo,
          };
        })
        .filter((p) => p.imageUrl);

      return posts;
    } catch (error: any) {
      console.error("Apify fetch dataset error:", error);
      throw error;
    }
  });

// Helper function for Eastern Arabic numeral normalization and strict regex pricing rules
export function extractPriceFallback(caption: string): number {
  // Normalize Eastern Arabic numerals (٠-٩) to Western Arabic (0-9)
  const text = caption.replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1632));

  // Look for BHD prices specifically
  const priceMatch = text.match(/(\d+(?:\.\d{1,3})?)\s*(?:bhd|bd|د\.ب|دينار|ديناراً)/i);
  if (priceMatch) {
    let p = parseFloat(priceMatch[1]);
    // Normalize three decimal formats (e.g. 35.000 BD -> 35 BHD)
    if (p > 1000) {
      p = p / 1000;
    }
    return Math.round(p);
  }

  // Look for SAR/AED to auto-convert (divide by 10)
  const sarMatch = text.match(/(\d+(?:\.\d{1,3})?)\s*(?:sar|aed|ريال|درهم)/i);
  if (sarMatch) {
    let p = parseFloat(sarMatch[1]);
    if (p > 1000) {
      p = p / 1000;
    }
    return Math.round(p / 10);
  }

  // Search for price-adjacent keywords followed by raw digit under 200 (avoiding phone numbers / sizes)
  const keywordMatch = text.match(
    /(?:السعر|السعر هو|بـ|price|price is)\s*[:：]?\s*(\d+(?:\.\d{1,3})?)/i,
  );
  if (keywordMatch) {
    let p = parseFloat(keywordMatch[1]);
    if (p > 1000) {
      p = p / 1000;
    }
    if (p > 0 && p < 200) {
      return Math.round(p);
    }
  }

  return 0;
}

export interface ExtractedBoutiqueMetadata {
  code: string | null;
  title: string;
  price: number | null;
  description: string;
  category: string;
}

// Smart GCC boutique metadata extractor from Instagram caption
export function extractBoutiqueMetadataFromCaption(
  caption: string,
  accountHandle?: string,
): ExtractedBoutiqueMetadata {
  if (!caption) {
    return {
      code: null,
      title: "منتج جديد",
      price: null,
      description: "",
      category: "عبايات",
    };
  }

  // Normalize Eastern Arabic numerals
  const normalized = caption.replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1632));
  const lines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // 1. Detect Code/Model (e.g. Code: MC5, كود: MC5, Model: 102, Ref: #40)
  let code: string | null = null;
  const codeRegex = /(?:code|كود|موديل|model|رقم|ref|item)\s*[:#-]?\s*([A-Za-z0-9_-]+)/i;
  for (const line of lines) {
    const match = line.match(codeRegex);
    if (match && match[1]) {
      code = match[1].trim();
      break;
    }
  }

  // 2. Detect garment type (Abaya, Dress, Kaftan, etc.)
  const garmentMatch = normalized.match(
    /(عباية|عبايه|فستان|بشت|قفطان|جلابية|جلابيه|دراعة|دراعه|طقم|شيلة|شيله|توب|جاكيت|كيمونو|abaya|dress|kaftan)/i,
  );
  const garmentType = garmentMatch ? garmentMatch[1].trim() : null;

  // 3. Price
  const priceVal = extractPriceFallback(caption);
  const price = priceVal > 0 ? priceVal : null;

  // 4. Formulate Title
  let title = "";
  if (code) {
    if (garmentType) {
      const formattedGarment = garmentType.startsWith("عباي") ? "عباية" : garmentType;
      title = `${formattedGarment} ${code}`;
    } else {
      title = `Code: ${code}`;
    }
  }

  // Filter lines to find descriptive line if title still empty
  const collectionRegex =
    /(?:new\s+collection|collection\s+\d+|summer|winter|eid|drop|كولكشن|تشكيلة|جديدنا|إصدار|حصري|arrival)/i;
  const priceLineRegex = /(?:bhd|bd|د\.ب|دينار|sar|aed|ريال|السعر|price)/i;
  const orderLineRegex = /(?:للطلب|للتواصل|واتساب|whatsapp|dm|direct|order|توصيل|delivery|link in bio)/i;
  const cleanHandle = (accountHandle || "").replace(/^@/, "").toLowerCase();

  const descriptiveLines: string[] = [];

  for (const line of lines) {
    const isCodeLine = codeRegex.test(line);
    const isPriceLine = priceLineRegex.test(line) && /\d/.test(line);
    const isOrderLine = orderLineRegex.test(line);
    const isHandle = cleanHandle ? line.toLowerCase().includes(cleanHandle) : false;
    const isCollection = collectionRegex.test(line);

    if (isCodeLine || isPriceLine || isOrderLine || isHandle || isCollection) {
      continue;
    }

    // Clean emojis & formatting
    const cleaned = line.replace(/[✨🌿🌟🤍🖤⭐💫🔥💎👑]/g, "").trim();
    if (cleaned.length > 3) {
      descriptiveLines.push(cleaned);
    }
  }

  if (!title) {
    if (descriptiveLines.length > 0) {
      title = descriptiveLines[0].slice(0, 60).trim();
    } else if (garmentType) {
      title = garmentType.startsWith("عباي") ? "عباية أنيقة" : garmentType;
    } else {
      title = "منتج حصري";
    }
  }

  // 5. Description
  const description =
    descriptiveLines.length > 0
      ? descriptiveLines.join("\n")
      : caption.replace(/[✨🌿🌟🤍🖤]/g, "").trim();

  // 6. Category
  let category = "عبايات";
  if (garmentType) {
    const lowerGarment = garmentType.toLowerCase();
    if (lowerGarment.includes("فستان") || lowerGarment.includes("dress")) category = "فساتين";
    else if (lowerGarment.includes("قفطان") || lowerGarment.includes("kaftan")) category = "قفاطين";
    else if (lowerGarment.includes("شيل") || lowerGarment.includes("طرح")) category = "شيل وطرح";
    else if (lowerGarment.includes("جلاب") || lowerGarment.includes("دراع")) category = "جلابيات";
    else category = "عبايات";
  }

  return {
    code,
    title,
    price,
    description,
    category,
  };
}

// Re-hosting core single uploader
async function rehostSingleImage(brandId: string, imageUrl: string): Promise<string | null> {
  try {
    if (!isSafeRemoteImageUrl(imageUrl)) throw new Error("Unsafe image URL");
    const imageFetch = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!imageFetch.ok) {
      throw new Error(`Failed to fetch original image from CDN: ${imageFetch.status}`);
    }
    const contentType = (imageFetch.headers.get("content-type") || "").split(";")[0];
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(contentType)) {
      throw new Error("Unsupported image response");
    }
    const contentLength = Number(imageFetch.headers.get("content-length") || 0);
    if (contentLength > MAX_IMAGE_BYTES) throw new Error("Image is too large");
    const arrayBuffer = await imageFetch.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) throw new Error("Image is too large");
    const buffer = Buffer.from(arrayBuffer);
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";

    const { client, bucket, publicBaseUrl } = r2Client();
    const key = `brands/${brandId}/product/${crypto.randomUUID()}.${ext}`;

    await client.send({
      input: {
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        Body: buffer,
        CacheControl: "public, max-age=31536000, immutable",
      },
    });

    return `${publicBaseUrl}/${key}`;
  } catch (err) {
    console.error("Rehost single image to Cloudflare R2 failed:", err);
    // Instagram CDN links expire. Never persist an unstable external URL as product media.
    return null;
  }
}

// 2. Phase 1: Batch AI Caption Parsing (1 Gemini Call for ALL Checked Posts)
export const batchParseCaptionsWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        posts: z
          .array(
            z.object({
              id: z.string(),
              url: z.string(),
              imageUrl: z.string(),
              caption: z.string(),
              isSoldOut: z.boolean(),
              isVideo: z.boolean().optional(),
            }),
          )
          .min(1)
          .max(20),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const brandId = data.brandId;

    // Brand and admin access checks (bypass for onboarding temp ID)
    const isZeroBrand = brandId === "00000000-0000-0000-0000-000000000000";
    if (!isZeroBrand) {
      const [{ data: hasAccess }, { data: isAdmin }] = await Promise.all([
        (context.supabase.rpc as any)("can_access_brand", { _brand_id: brandId }),
        (context.supabase.rpc as any)("is_admin"),
      ]);
      if (!hasAccess && !isAdmin) {
        throw new Error("UNAUTHORIZED");
      }
    }

    let apiKey = (await getEnvVariableAsync("GEMINI_API_KEY")) || process.env.GEMINI_API_KEY || "";
    let model = "gemini-2.5-flash";
    if (!isZeroBrand && userId) {
      try {
        const creds = await getGeminiCredentials(context.supabase, userId);
        if (creds?.apiKey) apiKey = creds.apiKey;
        if (creds?.model) model = creds.model;
      } catch {}
    }
    if (model === "gemini-1.5-flash") {
      model = "gemini-1.5-flash-latest"; // Map legacy flash to the updated v1beta valid name
    }

    let parsedArray: any[] = [];

    try {
      if (apiKey) {
        try {
          const systemPrompt = [
            "You are an expert GCC boutique and fashion e-commerce catalog migration assistant.",
            "Analyze each Instagram post using both its image and caption. Never invent catalog data.",
            "CRITICAL TITLE & CODE RULES:",
            "1. NEVER use generic collection slogans, seasonal drops, year labels, or account handles as the product title (e.g. NEVER use 'NEW COLLECTION 2026', 'SUMMER DROP', 'minnaz.couture').",
            "2. LOOK FOR PRODUCT CODES: Check for 'Code: MC5', 'كود: MC5', 'Model: 102', 'MC5'. If a code is found, format the title as 'عباية MC5' or 'كود MC5' (combining garment type with the code).",
            "3. IF NO CODE: Find the substantive line describing the garment (e.g. 'عباية بشت حرير مغسول').",
            "4. DESCRIPTION: Extract the rich Arabic or English text describing the fabric, cut, embroidery, and details into 'description'. Do NOT include phone numbers, delivery terms, or hashtags.",
            "5. CATEGORY: Infer 'عبايات' (Abayas), 'فساتين' (Dresses), 'جلابيات' (Jalabiya), 'قفاطين' (Kaftans), or 'شيل وطرح' (Scarves). Default to 'عبايات' for abaya boutiques.",
            "STRICT PRICE RULES:",
            "6. CURRENCY PRIORITY: Explicitly look for prices in BHD, BD, bd, dinar, دينار, د.ب (e.g. '37 BD' -> price: 37).",
            "7. MULTIPLE CURRENCIES: If multiple currencies are listed, extract the BHD/BD value.",
            "8. AUTO-CONVERT: If only SAR or AED is listed, divide by 10 to convert to BHD.",
            "9. ARABIC NUMERALS: Normalize Eastern Arabic numerals (٠١٢٣٤٥٦٧٨٩) to standard digits.",
            "10. EXCLUSIONS: Do NOT confuse abaya sizes (50 to 62) or phone numbers with prices.",
            "Provide a minified JSON array matching the requested schema and nothing else.",
          ].join("\n");

          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

          // Fetch images in parallel with tight timeouts for speed
          const imageParts = await Promise.all(
            data.posts.map((post) => imagePartForGemini(post.imageUrl)),
          );

          const parts: Array<Record<string, unknown>> = [];
          for (let i = 0; i < data.posts.length; i++) {
            const post = data.posts[i];
            parts.push({ text: `POST ${post.id}\nCAPTION:\n${post.caption || "(none)"}` });
            const imgPart = imageParts[i];
            if (imgPart) parts.push(imgPart);
            else parts.push({ text: `POST ${post.id} image_unavailable` });
          }

          let response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [
                {
                  role: "user",
                  parts,
                },
              ],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json",
                responseJsonSchema: {
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
                      confidence: { type: "number" },
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

          // Automated retry fallback if the primary model failed
          if (!response.ok && model !== "gemini-1.5-flash-latest") {
            console.warn(
              `Primary Gemini model (${model}) request failed. Retrying with ultra-stable gemini-1.5-flash-latest...`,
            );
            const fallbackEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent`;
            response = await fetch(fallbackEndpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey,
              },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [
                  {
                    role: "user",
                    parts,
                  },
                ],
                generationConfig: {
                  temperature: 0.1,
                  responseMimeType: "application/json",
                  responseJsonSchema: {
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
                        confidence: { type: "number" },
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
          }

          if (response.ok) {
            const resJson = await response.json<{
              candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            }>();
            const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawText) {
              parsedArray = JSON.parse(rawText.trim()) as any[];
            }
          }
        } catch (apiErr) {
          console.error(
            "Gemini batch request error, falling back to smart boutique rule extractor:",
            apiErr,
          );
        }
      }

      // If Gemini wasn't called or failed, populate parsedArray using smart boutique extractor
      if (parsedArray.length === 0) {
        parsedArray = data.posts.map((post) => {
          const meta = extractBoutiqueMetadataFromCaption(post.caption);
          return {
            id: post.id,
            title: meta.title,
            price: meta.price,
            description: meta.description,
            sizes: [],
            colors: [],
            category: meta.category,
            confidence: meta.price ? 0.75 : 0.4,
            issues: [meta.price ? "missing_sizes" : "missing_price"],
          };
        });
      }

      // Perform strict regex safety checks, sanitization, and fallback
      const products = data.posts.map((originalPost) => {
        const parsed = parsedArray.find((item) => item.id === originalPost.id) || {};
        const meta = extractBoutiqueMetadataFromCaption(originalPost.caption);

        let title = parsed.title;
        const isGenericOrCollection =
          !title ||
          title === "Instagram Product" ||
          /(?:new\s+collection|collection\s+\d+|summer|winter|eid|drop|كولكشن|تشكيلة|جديدنا)/i.test(
            title,
          );
        if (isGenericOrCollection) {
          title = meta.title;
        }

        let price = parsed.price == null ? null : Number(parsed.price);
        const isUnlikelyPrice =
          price == null ||
          isNaN(price) ||
          price <= 0 ||
          price > 200 ||
          [52, 54, 56, 58, 60, 62].includes(price);
        if (isUnlikelyPrice) {
          price = meta.price;
        }

        let description = parsed.description;
        if (!description || description.trim().length === 0 || description === originalPost.caption) {
          description = meta.description;
        }

        let category = parsed.category;
        if (!category || category === "General" || category === "fashion") {
          category = meta.category;
        }

        const sizes = Array.isArray(parsed.sizes) ? parsed.sizes.map(String) : [];
        const colors = Array.isArray(parsed.colors) ? parsed.colors.map(String) : [];
        const issues = new Set<string>(Array.isArray(parsed.issues) ? parsed.issues : []);
        if (!price) issues.add("missing_price");
        if (!sizes.length) issues.add("missing_sizes");
        if (!originalPost.imageUrl) issues.add("image_unavailable");

        return {
          id: originalPost.id,
          imageUrl: originalPost.imageUrl,
          url: originalPost.url,
          isSoldOut: originalPost.isSoldOut,
          title: title || meta.title || "عباية أنيقة",
          price,
          description: description || meta.description,
          sizes,
          colors,
          category,
          confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.6)),
          issues: [...issues],
        };
      });

      return { products };
    } catch (error: any) {
      console.error("Batch AI caption parsing error:", error);
      throw error;
    }
  });

const productImportItemSchema = z.object({
  id: z.string(),
  imageUrl: z.string(),
  url: z.string(),
  isSoldOut: z.boolean(),
  title: z.string(),
  price: z.number().nullable(),
  description: z.string(),
  sizes: z.array(z.string()),
  colors: z.array(z.string()).default([]),
  category: z.string(),
  confidence: z.number().min(0).max(1).default(0),
  issues: z.array(z.string()).default([]),
});

// 3. Phase 2: Parallel R2 Image Re-Hosting (Concurrent batches of 6)
export const batchRehostImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        products: z.array(productImportItemSchema).optional(),
        drafts: z.array(productImportItemSchema).optional(),
      })
      .transform((val) => ({
        brandId: val.brandId,
        products: val.products || val.drafts || [],
      }))
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const brandId = data.brandId;
    const [{ data: hasAccess }, { data: isAdmin }] = await Promise.all([
      context.supabase.rpc("can_access_brand", { _brand_id: brandId }),
      context.supabase.rpc("is_admin"),
    ]);
    if (!hasAccess && !isAdmin) throw new Error("UNAUTHORIZED");
    const items = [...data.products];
    const batchSize = 6;

    try {
      // Chunk processing in concurrent groups of 6
      for (let i = 0; i < items.length; i += batchSize) {
        const chunk = items.slice(i, i + batchSize);
        await Promise.all(
          chunk.map(async (product) => {
            const idx = items.findIndex((item) => item.id === product.id);
            if (idx !== -1) {
              const r2Url = await rehostSingleImage(brandId, product.imageUrl);
              items[idx].imageUrl = r2Url || "";
              if (!r2Url && !items[idx].issues.includes("image_unavailable")) {
                items[idx].issues.push("image_unavailable");
              }
            }
          }),
        );
      }
      return { products: items };
    } catch (error: any) {
      console.error("Batch rehosting exception handled:", error);
      throw error;
    }
  });

// 4. Phase 3: Bulk Database Insertion (Single transactional query)
export const bulkInsertProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        products: z.array(productImportItemSchema).optional(),
        drafts: z.array(productImportItemSchema).optional(),
      })
      .transform((val) => ({
        brandId: val.brandId,
        products: val.products || val.drafts || [],
      }))
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
        const mediaArray = p.imageUrl ? [{ type: "image", url: p.imageUrl }] : [];
        const customFieldsArray = [
          {
            key: "instagram_post_id",
            value: p.id,
            label_ar: "منشور انستقرام",
            label_en: "Instagram Post ID",
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
            image_url: p.imageUrl || null,
            is_active: false, // Created as drafts for merchant review
            featured_trending: false,
            show_sale_badge: false,
            media: mediaArray,
            custom_fields: customFieldsArray,
          })
          .select("id")
          .single();

        if (prodErr || !prodData?.id) {
          console.error("Failed to insert product:", prodErr);
          throw new Error(`Failed to batch insert products: ${prodErr?.message || "Insert failed"}`);
        }

        insertedCount++;

        const sizes = Array.isArray(p.sizes) && p.sizes.length > 0 ? p.sizes : [""];
        const colors = Array.isArray(p.colors) && p.colors.length > 0 ? p.colors : [""];
        const price = Number(p.price) || 0;

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
            throw new Error(`Failed to batch insert variants: ${varErr.message}`);
          }
        }
      }

      return {
        successCount: insertedCount,
        skippedCount: data.products.length - insertedCount,
      };
    } catch (error: any) {
      console.error("Bulk database insertion failed:", error);
      throw error;
    }
  });
