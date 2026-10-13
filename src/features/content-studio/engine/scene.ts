import type { FORMATS } from "@/features/content-studio/lib/studio-content";
import type { OccasionId } from "@/features/content-studio/lib/occasions";

export type FormatKey = keyof typeof FORMATS;

/** An image the canvas can draw: a photo, a decoded video frame or a logo. */
export type Drawable =
  HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap;

/** The brand as a template draws it. Colours are CSS colour strings. */
export type BrandKit = {
  name: string;
  logo: Drawable | null;
  /** The merchant's logo size (1 is the template's default). */
  logoScale: number;
  /** How the logo is coloured: to suit the template, as uploaded, white or black. */
  logoTint: "auto" | "original" | "white" | "black";
  handle: string | null;
  contact: string | null;
  /** The store's headline faces, when the merchant uses them instead of the studio's. */
  displayFamilies?: { en: string; ar: string } | null;
  palette: { ground: string; ink: string; accent: string; muted: string };
};

/** Everything a template needs to draw one frame, in the output's pixels. */
export type SceneData = {
  width: number;
  height: number;
  format: FormatKey;
  lang: "ar" | "en";
  brand: BrandKit;
  productName: string;
  headline: string;
  body: string;
  /** The formatted selling price ("42.000 BHD"), or null to hide it. */
  price: string | null;
  /** The formatted price before a sale, when there is one. */
  originalPrice: string | null;
  /** The selling price's amount alone ("31.500"), for templates that set the currency apart. */
  priceAmount: string | null;
  /** The pre-sale amount alone, when there is a sale. */
  originalAmount: string | null;
  /** The month and year, for templates styled as an issue ("September 2026"). */
  issueLabel: string;
  /** The currency as the store writes it ("BHD", "د.ب."). */
  currencyLabel: string;
  /** The saving as a whole percentage, when there is a sale. */
  discountPercent: number | null;
  /** The product photo or, while exporting a video, the current video frame. */
  media: Drawable | null;
  /**
   * The product's photos for templates that cut between them (the chosen one
   * first). Absent or null when they are not loaded: such a template cuts
   * between details of `media` instead.
   */
  shots?: Drawable[] | null;
  /**
   * The product's options to cycle through (its colours, or another option),
   * each with its own photo when it has one. Null when there is only one.
   */
  options: {
    axisLabel: string;
    swatch: boolean;
    stops: Array<{ label: string; color: string | null; media: Drawable | null }>;
  } | null;
  /**
   * The products a lookbook, a menu or a bundle shows, in order, each with its
   * formatted price (null when prices are hidden), photo, and a short note (a
   * service's length, "60 min"). Null outside those templates.
   */
  collection: Array<{
    name: string;
    price: string | null;
    media: Drawable | null;
    note?: string | null;
  }> | null;
  /** The collection's prices added up and formatted, when every one has a price. */
  collectionTotal?: string | null;
  /**
   * Last Chance: the last day (its weekday and date, as the reader's calendar
   * names it) and, when a code goes with it, the code and what it takes off
   * (in pieces in reading order: an amount is never joined to a word).
   */
  deadline?: { day: string; date: string; code: string | null; offer: string[] | null } | null;
  /**
   * Back in Stock: the options a shopper can buy now (sizes first) with the
   * store's name for them, and how many asked to hear (null when not shown).
   */
  restock?: { axisLabel: string | null; options: string[]; asked: number | null } | null;
  /** Customer Favourite: the store's average rating, how many reviews, and what they praise. */
  rating?: { average: number; count: number; highlights: string[] } | null;
  /**
   * The detail Detail Zoom pushes into: a point on the photo (0 to 1 across
   * and down), what it is (the fabric or finish) and a note (the occasion).
   * Null outside that template.
   */
  detail: { x: number; y: number; label: string; note: string } | null;
  /**
   * The Occasion Pack's greeting: which occasion (its line art), the small line
   * above, the greeting, a message and an optional offer. Null outside it.
   */
  occasion: {
    id: OccasionId;
    eyebrow: string;
    greeting: string;
    message: string;
    offer: string;
  } | null;
};

/** What every scene has: its size in output pixels, and the media to draw (a photo or video frame). */
export type BaseScene = { width: number; height: number; media: Drawable | null };

/**
 * One animated template: its name, length and how it draws a frame at time t.
 * The content studio's templates draw a SceneData; other screens (the review
 * story) bring their own scene.
 */
export type StudioTemplate<S extends BaseScene = SceneData> = {
  id: string;
  name: { en: string; ar: string };
  goal: { en: string; ar: string };
  /** Length in seconds; the animation loops at the end. */
  duration: number;
  /**
   * The frame that shows the template best, for its thumbnail and as the
   * default still (see stillTime). Without it, one second before the end.
   */
  posterTime?: number;
  /** Draws the whole frame at `t` seconds. Must not keep state between calls. */
  render: (ctx: CanvasRenderingContext2D, t: number, scene: S) => void;
  /**
   * For templates that also export as an Instagram carousel: the time of each
   * slide's settled frame, one PNG per time.
   */
  slideTimes?: (scene: S) => number[];
};

/** The time of a template's still: its poster frame, else one second before the end. */
export function stillTime(template: { duration: number; posterTime?: number }): number {
  return template.posterTime ?? Math.max(0, template.duration - 1);
}
