import type { FORMATS } from "@/features/content-studio/lib/studio-content";

export type FormatKey = keyof typeof FORMATS;

/** An image the canvas can draw: a photo, a decoded video frame or a logo. */
export type Drawable =
  HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap;

/** The brand as a template draws it. Colours are CSS colour strings. */
export type BrandKit = {
  name: string;
  logo: Drawable | null;
  handle: string | null;
  contact: string | null;
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
  /** The currency as the store writes it ("BHD", "د.ب."). */
  currencyLabel: string;
  /** The saving as a whole percentage, when there is a sale. */
  discountPercent: number | null;
  /** The product photo or, while exporting a video, the current video frame. */
  media: Drawable | null;
};

/** One animated template: its name, length and how it draws a frame at time t. */
export type StudioTemplate = {
  id: string;
  name: { en: string; ar: string };
  goal: { en: string; ar: string };
  /** Length in seconds; the animation loops at the end. */
  duration: number;
  /** Draws the whole frame at `t` seconds. Must not keep state between calls. */
  render: (ctx: CanvasRenderingContext2D, t: number, scene: SceneData) => void;
};
