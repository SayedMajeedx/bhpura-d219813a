import type { BaseScene, Drawable } from "@/features/content-studio/engine/scene";
import { REVIEW_HIGHLIGHT_LABELS, type OrderReviewAdminRow } from "@/lib/order-reviews";
import { readableInk, type StoreColours } from "@/features/content-studio/lib/studio-styles";

/** The story's size: an Instagram story. */
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

/** The three looks: warm sand, clean white, and dark. */
export type StoryLook = "classic" | "editorial" | "midnight";

/** A photo or video from the order's products, or one the merchant uploads. */
export type ProductMediaItem = {
  url: string;
  type: "image" | "video";
};

/** Everything the review story draws, already made safe to publish. */
export type ReviewScene = BaseScene & {
  look: StoryLook;
  lang: "ar" | "en";
  /** The brand colour (a #rrggbb hex). */
  primary: string;
  brandName: string;
  logo: Drawable | null;
  /** The customer's first name, or "Verified customer" when it is hidden. */
  customer: string;
  /** 1 to 5. */
  rating: number;
  comment: string;
  /** Up to two highlight labels, in the story's language. */
  highlights: string[];
  /** The order date as the merchant wrote it, or null to hide it. */
  date: string | null;
  /** "Instagram: @x   •   Tel: y", or null to hide it. */
  contact: string | null;
};

/** A brand colour the story can use: a #rrggbb hex, or the house maroon. */
export function safeColor(value?: string | null) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#330a0a";
}

/**
 * The deepest of the story's light grounds (the classic look's sand at its
 * foot): ink that reads on it reads on every lighter one too.
 */
const DEEPEST_LIGHT_GROUND = "#cfc0b0";

/**
 * The story's colour: the store's own (the colour its storefront wears), as
 * the ink of the name, the contact and the badge on the story's light
 * grounds. A colour too light to read there gives way to the storefront's
 * text colour, else is deepened until it reads. Never chosen by the store's
 * name: every store gets its own colours by the same rule.
 */
export function storyColor(colours: StoreColours): string {
  const accent = colours.accent && /^#[0-9a-f]{6}$/i.test(colours.accent) ? colours.accent : null;
  const base = accent ?? "#330a0a";
  const text = colours.text && /^#[0-9a-f]{6}$/i.test(colours.text) ? colours.text : null;
  return readableInk(DEEPEST_LIGHT_GROUND, [base, text], base);
}

/** The first name only: a published story never shows a full name. */
export function publicFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || "";
}

/** The order date as the story first shows it ("26 Aug 2026"), or "" when there is none. */
export function formatOrderDate(dateStr?: string | null, isAr?: boolean) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(isAr ? "ar-BH-u-nu-latn" : "en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * The review's words and details as the story shows them, from the merchant's
 * choices. Only what is safe to publish gets through: the first name (or
 * "Verified customer"), the rating, the comment, up to two highlights, the
 * date and the store's own contacts. Never the order number, the customer's
 * phone or the reward code.
 */
export function reviewStoryFields({
  review,
  comment,
  isAr,
  showName,
  showHighlights,
  showDate,
  orderDateText,
  showBrandContact,
  brandPhone,
  brandInstagram,
}: {
  review: OrderReviewAdminRow;
  comment: string;
  isAr: boolean;
  showName: boolean;
  showHighlights: boolean;
  showDate: boolean;
  orderDateText: string;
  showBrandContact: boolean;
  brandPhone: string;
  brandInstagram: string;
}): Pick<ReviewScene, "customer" | "rating" | "comment" | "highlights" | "date" | "contact"> {
  const firstName = publicFirstName(review.customer_name);
  const contactParts: string[] = [];
  if (brandInstagram.trim()) contactParts.push(`Instagram: ${brandInstagram.trim()}`);
  if (brandPhone.trim()) contactParts.push(`Tel: ${brandPhone.trim()}`);
  return {
    customer: showName && firstName ? firstName : isAr ? "تقييم موثّق" : "Verified customer",
    rating: Math.max(1, Math.min(5, Number(review.rating) || 5)),
    comment:
      comment.trim() || (isAr ? "تجربة تستحق المشاركة ورائعة جداً" : "An experience worth sharing"),
    highlights: showHighlights
      ? (review.highlights || [])
          .slice(0, 2)
          .map((h) => REVIEW_HIGHLIGHT_LABELS[h]?.[isAr ? "ar" : "en"] ?? h)
      : [],
    date: showDate && orderDateText.trim() ? orderDateText.trim() : null,
    contact: showBrandContact && contactParts.length > 0 ? contactParts.join("   •   ") : null,
  };
}
