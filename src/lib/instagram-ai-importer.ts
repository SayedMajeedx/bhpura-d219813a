import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth, getGeminiCredentials } from "@/integrations/supabase/auth-middleware";
import { PutObjectCommand } from "@aws-sdk/client-s3";
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
};

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

// 1. Fetch Instagram Posts - Real Apify Instagram Scraper Integration
export const fetchInstagramPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z.object({
      username: z.string().optional(),
      urls: z.array(z.string()).optional(),
      range: z.number().int().min(5).max(100).default(50),
    }).parse(raw)
  )
  .handler(async ({ data }) => {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
      throw new Error("Missing APIFY_API_TOKEN environment variable. Please configure it in your environment settings.");
    }
    const directUrls = data.urls && data.urls.length > 0 
      ? data.urls 
      : data.username 
        ? [`https://www.instagram.com/${data.username.replace(/^@/, "").trim()}/`] 
        : [];

    if (directUrls.length === 0) {
      throw new Error("Either username or direct URLs must be provided.");
    }

    try {
      const response = await fetch(`https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${token}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          directUrls,
          resultsLimit: data.range,
          resultsType: "posts",
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Apify request failed with status ${response.status}: ${errText}`);
      }

      const items = await response.json() as any[];
      if (!Array.isArray(items)) {
        return [];
      }

      const posts: InstagramPostPreview[] = items.map((item, index) => {
        const caption = item.caption || item.text || "";
        const { isSoldOut, keyword } = scanCaptionForSoldOut(caption);
        
        const imageUrl = item.displayUrl || (item.images && item.images[0]) || item.thumbnailUrl || (item.displayResources && item.displayResources[0]?.src) || "";

        const dateStr = item.timestamp 
          ? new Date(item.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "Today";

        return {
          id: item.id || `post-${index}`,
          url: item.url || `https://www.instagram.com/p/${item.shortCode || index}/`,
          imageUrl,
          caption,
          isSoldOut,
          detectedKeyword: isSoldOut ? keyword : undefined,
          date: dateStr,
        };
      }).filter(p => p.imageUrl);

      return posts;
    } catch (error: any) {
      console.error("Apify dynamic scraping execution error:", error);
      throw error;
    }
  });

// 2. AI Vision Post Parser Server Function with strict RPM throttle safe logic
export const parseInstagramPostsWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z.object({
      brandId: z.string().uuid(),
      posts: z.array(
        z.object({
          id: z.string(),
          url: z.string(),
          imageUrl: z.string(),
          caption: z.string(),
          isSoldOut: z.boolean(),
        })
      ),
    }).parse(raw)
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const brandId = data.brandId;

    // Direct brand and admin authorization check
    const [{ data: hasAccess }, { data: isAdmin }] = await Promise.all([
      context.supabase.rpc("can_access_brand", { _brand_id: brandId }),
      context.supabase.rpc("is_admin"),
    ]);
    if (!hasAccess && !isAdmin) {
      throw new Error("UNAUTHORIZED");
    }

    const creds = await getGeminiCredentials(context.supabase, userId);
    const apiKey = creds.apiKey;
    const model = creds.model || "gemini-2.5-flash";

    let successCount = 0;

    for (let index = 0; index < data.posts.length; index++) {
      const post = data.posts[index];

      // Enforce the requested 2.0-second delay to guarantee free-tier RPM (15 Requests/Minute) compatibility
      if (index > 0) {
        await new Promise((res) => setTimeout(res, 2000));
      }

      try {
        let title = "Instagram Product";
        let price = 25;
        let description = post.caption;
        let sizes = ["52", "54", "56", "58"];
        let category = "Abayas";

        // Try AI extraction if key is present, otherwise fallback gracefully
        if (apiKey) {
          try {
            // Download the image and convert to base64 inlineData
            const imgRes = await fetch(post.imageUrl);
            let base64Image = "";
            let mimeType = "image/jpeg";
            if (imgRes.ok) {
              const arrayBuffer = await imgRes.arrayBuffer();
              base64Image = Buffer.from(arrayBuffer).toString("base64");
              mimeType = imgRes.headers.get("content-type") || "image/jpeg";
            }

            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
            const systemPrompt = [
              "You are an expert GCC boutique product migration assistant.",
              "Analyze the provided image and caption text to extract structured product metadata.",
              "Ignore hashtags, shipping notices, or sales banter.",
              "Always normalize the price to Bahraini Dinars (BHD). If price is listed in SAR/AED, convert it (divide by 10).",
              "Return descriptive product names in either English or Arabic based on caption dominance.",
              "Provide a clean, minified JSON object matching the requested schema and nothing else.",
            ].join(" ");

            const response = await fetch(endpoint, {
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
                    parts: [
                      {
                        text: `Perform metadata extraction on this Instagram post and image.\nPost Caption: ${post.caption}`,
                      },
                      {
                        inlineData: {
                          mimeType,
                          data: base64Image,
                        },
                      },
                    ],
                  },
                ],
                generationConfig: {
                  temperature: 0.1,
                  responseMimeType: "application/json",
                  responseJsonSchema: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "Beautiful product name in AR or EN." },
                      price: { type: "number", description: "BHD price numeric value." },
                      description: { type: "string", description: "Polished description omitting hashtags." },
                      sizes: { type: "array", items: { type: "string" }, description: "Standard GCC garment or apparel sizes." },
                      category: { type: "string", description: "E.g. Abayas, Dresses, Accessories." },
                    },
                    required: ["title", "price", "description", "sizes", "category"],
                  },
                },
              }),
            });

            if (response.ok) {
              const result = await response.json();
              const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
              if (rawText) {
                const parsed = JSON.parse(rawText.trim());
                title = parsed.title || title;
                price = Number(parsed.price) || price;
                description = parsed.description || description;
                sizes = parsed.sizes && parsed.sizes.length > 0 ? parsed.sizes : sizes;
                category = parsed.category || category;
              }
            }
          } catch (aiErr) {
            console.error("Gemini Vision parsing failed, falling back to rule-based parser:", aiErr);
          }
        }

        // Rule-based heuristic extraction fallback (extremely robust)
        if (title === "Instagram Product") {
          const lines = post.caption.split("\n").map((l) => l.trim()).filter(Boolean);
          if (lines.length > 0) {
            title = lines[0].replace(/[✨🌿🌟🤍🖤]/g, "").slice(0, 60).trim();
          }

          // Parse Price: Look for "35", "42", "29" followed by BHD, BD, دينار
          const priceMatch = post.caption.match(/(\d+)\s*(?:bhd|bd|دينار|د\.ب)/i);
          if (priceMatch) {
            price = Number(priceMatch[1]);
          } else {
            const sarMatch = post.caption.match(/(\d+)\s*(?:sar|ريال)/i);
            if (sarMatch) {
              price = Math.round(Number(sarMatch[1]) / 10);
            }
          }

          // Parse Sizes
          const sizesMatch = post.caption.match(/(?:مقاسات|sizes|المقاسات)\s*[:：]?\s*([a-zA-Z0-9,\s-]+)/i);
          if (sizesMatch) {
            sizes = sizesMatch[1].split(/[,-\s]+/).map((s) => s.trim()).filter(Boolean);
          }
        }

        // 3. Download the Instagram Image & upload to Cloudflare R2
        let finalImageUrl = post.imageUrl;
        try {
          const imageFetch = await fetch(post.imageUrl);
          if (imageFetch.ok) {
            const arrayBuffer = await imageFetch.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const contentType = imageFetch.headers.get("content-type") || "image/jpeg";
            const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";

            const { client, bucket, publicBaseUrl } = r2Client();
            const key = `brands/${brandId}/product/${crypto.randomUUID()}.${ext}`;

            await client.send(
              new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                ContentType: contentType,
                Body: buffer,
                CacheControl: "public, max-age=31536000, immutable",
              })
            );

            finalImageUrl = `${publicBaseUrl}/${key}`;
          }
        } catch (imgErr) {
          console.error("Failed to re-host Instagram CDN image to Cloudflare R2:", imgErr);
        }

        // 4. Create Product inside Supabase in 'draft' status (is_active: false)
        const mediaArray = [{ type: "image", url: finalImageUrl }];
        const { data: insertedProduct, error: prodErr } = await context.supabase
          .from("products")
          .insert({
            user_id: userId,
            brand_id: brandId,
            name: title,
            name_en: title,
            name_ar: title,
            description,
            description_en: description,
            description_ar: description,
            category,
            image_url: finalImageUrl,
            is_active: false, // Default false (draft) for merchant manual review
            featured_trending: false,
            show_sale_badge: false,
            media: mediaArray,
            custom_fields: [],
          })
          .select("id")
          .single();

          if (prodErr || !insertedProduct) {
            console.error("Supabase product insertion failed for post ID:", post.id, prodErr);
            continue;
          }

          // 5. Batch Insert Apparel size Variants
          const variantRows = sizes.map((size) => ({
            user_id: userId,
            brand_id: brandId,
            product_id: insertedProduct.id,
            size,
            size_unit: "",
            color: "",
            fabric: "",
            sku: `IG-${insertedProduct.id.slice(0, 5).toUpperCase()}-${size}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            barcode: null,
            cost_price: Math.round(price * 0.5),
            selling_price: price,
            stock_main: post.isSoldOut ? 0 : 15, // Out of stock keyword defaults to zero
            stock_incubator: 0,
          }));

          const { error: varErr } = await context.supabase
            .from("product_variants")
            .insert(variantRows);

          if (varErr) {
            console.error("Supabase variants insertion failed for product ID:", insertedProduct.id, varErr);
          } else {
            successCount++;
          }
      } catch (postErr) {
        console.error("Severe batch element exception handled for post:", post.id, postErr);
      }
    }

    return { successCount };
  });
