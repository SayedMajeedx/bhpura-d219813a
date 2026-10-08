import type { InstagramPostPreview, InstagramProductDraft } from "@/lib/instagram-ai-importer";
import { extractSizes, readPrice, type Currency } from "./caption-extract";

/**
 * A draft product from a post and what the AI read from its caption.
 *
 * The AI's price is never trusted alone: it is checked against the price the caption states
 * outright. They agree: certain. The caption states one and the AI missed it: take it. They
 * disagree, the caption lists several prices without saying which, or it is in another currency
 * than the store's: leave the price empty with the reason, for the merchant. The AI gave one the
 * caption does not state: empty too (it may be a phone number or a size).
 */

/** One post's entry in the AI's answer (every field optional: it can leave any out). */
export type AiReading = {
  id?: string;
  title?: string;
  price?: number | null;
  description?: string;
  sizes?: unknown;
  colors?: unknown;
  category?: string;
  confidence?: { name?: number; price?: number; description?: number; sizes?: number };
  issues?: unknown;
};

const clamp = (value: unknown, fallback: number) =>
  Math.max(0, Math.min(1, Number(value) || fallback));
const strings = (value: unknown) =>
  Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];

export function buildDraft(
  post: InstagramPostPreview,
  parsed: AiReading = {},
  options: { storeCurrency?: string | null } = {},
): InstagramProductDraft {
  const reading = readPrice(post.caption);
  const aiPrice = typeof parsed.price === "number" && !isNaN(parsed.price) ? parsed.price : null;
  const issues: string[] = strings(parsed.issues);
  const store = (options.storeCurrency ?? "").toUpperCase() as Currency | "";

  let price: number | null = null;
  let originalPrice: number | null = null;
  let priceConfidence = Number(parsed.confidence?.price) || 0;
  let priceConflict: InstagramProductDraft["priceConflict"];

  if (reading.currency && store && reading.currency !== store) {
    // "100 ريال سعودي" on a store that sells in dinars is not a price of this store.
    priceConfidence = 0.1;
    priceConflict = {
      geminiPrice: aiPrice,
      regexPrice: reading.price,
      reason: `الوصف يذكر السعر بعملة ${reading.currency} بينما عملة المتجر ${store}`,
    };
    issues.push("currency_mismatch");
  } else if (reading.ambiguous.length > 1) {
    priceConfidence = 0.2;
    priceConflict = {
      geminiPrice: aiPrice,
      regexPrice: null,
      reason: `الوصف يذكر عدة أسعار (${reading.ambiguous.join("، ")}) دون تحديد سعر المنتج`,
    };
    issues.push("multiple_prices");
  } else if (reading.price !== null && aiPrice !== null) {
    if (Math.abs(reading.price - aiPrice) < 0.01) {
      price = reading.price;
      originalPrice = reading.originalPrice;
      priceConfidence = Math.max(priceConfidence, 0.95);
    } else {
      priceConfidence = 0.2;
      priceConflict = {
        geminiPrice: aiPrice,
        regexPrice: reading.price,
        reason: `تعارض بين قراءة الذكاء الاصطناعي (${aiPrice} د.ب) ونمط النص الصريح (${reading.price} د.ب)`,
      };
      issues.push("price_conflict");
    }
  } else if (reading.price !== null) {
    price = reading.price;
    originalPrice = reading.originalPrice;
    priceConfidence = 0.9;
  } else if (aiPrice !== null) {
    // The AI named a price the caption does not state: a phone number or a size, perhaps.
    priceConfidence = 0.3;
    priceConflict = {
      geminiPrice: aiPrice,
      regexPrice: null,
      reason: `استخرج الذكاء الاصطناعي سعراً (${aiPrice}) بدون وجود رمز عملة صريح بالنص`,
    };
    issues.push("unverified_price");
  } else {
    priceConfidence = 0;
    issues.push("missing_price");
  }

  const imageUploadStatus: InstagramProductDraft["imageUploadStatus"] =
    post.images.length > 0 && post.images.every((image) => image.status === "success")
      ? "all_success"
      : post.images.some((image) => image.status === "success")
        ? "partial_success"
        : "failed";
  if (imageUploadStatus === "failed") issues.push("image_upload_failed");

  // A name the AI could not find stays empty (a stand-in like "new product" looked ready to approve).
  const title = (parsed.title ?? "").trim().length >= 3 ? (parsed.title as string).trim() : "";
  if (!title) issues.push("missing_title");

  // Sizes: the AI's, else what the caption's size line says.
  const aiSizes = strings(parsed.sizes);
  const captionSizes = aiSizes.length === 0 ? extractSizes(post.caption) : [];
  const sizes = aiSizes.length > 0 ? aiSizes : captionSizes;
  const sizesConfidence =
    aiSizes.length > 0 ? clamp(parsed.confidence?.sizes, 0.8) : captionSizes.length > 0 ? 0.75 : 1;

  const category =
    parsed.category && String(parsed.category).trim() !== ""
      ? String(parsed.category).trim()
      : null;

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
    price,
    originalPrice,
    description: (parsed.description || post.caption || "").trim(),
    sizes,
    colors: strings(parsed.colors),
    category,
    fieldConfidence: {
      name: title ? clamp(parsed.confidence?.name, 0.7) : 0,
      price: priceConfidence,
      description: clamp(parsed.confidence?.description, 0.75),
      sizes: sizesConfidence,
    },
    fieldSources: {
      name: "ai",
      price: price !== null ? "ai" : "manual",
      description: "ai",
      sizes: "ai",
      category: "ai",
    },
    priceConflict,
    issues: [...new Set(issues)],
  };
}
