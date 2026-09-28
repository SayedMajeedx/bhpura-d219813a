import { font } from "@/features/content-studio/engine/draw";
import { STUDIO_FONTS } from "@/features/content-studio/engine/fonts";
import type { BrandKit, Drawable } from "@/features/content-studio/engine/scene";
import { textDirection } from "@/features/content-studio/engine/text-layout";

/** How a template colours the logo. */
export type LogoTint = "auto" | "original" | "white" | "black";

export const LOGO_WHITE = "#ffffff";
export const LOGO_BLACK = "#111111";

/** The colour a mark is drawn in, or null to keep the logo's own colours. */
export function logoColor(tint: LogoTint, { onPhoto, ink }: { onPhoto: boolean; ink: string }) {
  if (tint === "original") return null;
  if (tint === "white") return LOGO_WHITE;
  if (tint === "black") return LOGO_BLACK;
  return onPhoto ? LOGO_WHITE : ink;
}

function sizeOf(logo: Drawable) {
  const w =
    "naturalWidth" in logo
      ? logo.naturalWidth
      : "videoWidth" in logo
        ? logo.videoWidth
        : logo.width;
  const h =
    "naturalHeight" in logo
      ? logo.naturalHeight
      : "videoHeight" in logo
        ? logo.videoHeight
        : logo.height;
  return { w: w || 1, h: h || 1 };
}

/** Prepared logos per source, keyed by colour and pixel size (a few sizes each). */
const prepared = new WeakMap<object, Map<string, HTMLCanvasElement>>();
const SIZES_KEPT = 8;

function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }
  return { canvas, ctx };
}

/**
 * The logo at exactly `width`×`height` pixels, in one flat `color` when given
 * (its shape kept by the alpha channel). A large logo is halved step by step
 * with high-quality smoothing on the way down: shrinking it in one step skips
 * source pixels and breaks thin strokes. Cached per logo, colour and size.
 */
export function preparedLogo(
  logo: Drawable,
  color: string | null,
  width: number,
  height: number,
): Drawable {
  const key = `${color ?? "original"}|${Math.round(width)}x${Math.round(height)}`;
  const bySize = prepared.get(logo) ?? new Map<string, HTMLCanvasElement>();
  const cached = bySize.get(key);
  if (cached) return cached;

  let source: Drawable = logo;
  let { w, h } = sizeOf(logo);
  // A vector logo is sharpest drawn straight at its final size.
  const vector =
    typeof HTMLImageElement !== "undefined" &&
    logo instanceof HTMLImageElement &&
    /\.svg(\?|#|$)|^data:image\/svg/i.test(logo.src);
  while (!vector && w / 2 >= width && h / 2 >= height) {
    const step = canvasOf(w / 2, h / 2);
    if (!step.ctx) return logo;
    step.ctx.drawImage(source, 0, 0, step.canvas.width, step.canvas.height);
    source = step.canvas;
    w = step.canvas.width;
    h = step.canvas.height;
  }
  const out = canvasOf(width, height);
  if (!out.ctx) return logo;
  out.ctx.drawImage(source, 0, 0, out.canvas.width, out.canvas.height);
  if (color) {
    out.ctx.globalCompositeOperation = "source-in";
    out.ctx.fillStyle = color;
    out.ctx.fillRect(0, 0, out.canvas.width, out.canvas.height);
  }

  if (bySize.size >= SIZES_KEPT) bySize.delete(bySize.keys().next().value as string);
  bySize.set(key, out.canvas);
  prepared.set(logo, bySize);
  return out.canvas;
}

/**
 * Draws the brand's logo (or its name when there is none) with its vertical
 * middle at `y`, starting at `x` on the reading side (`align`). Its size
 * follows the merchant's logo size; its colour follows their tint choice,
 * where "auto" means white over a photo and the template's ink elsewhere.
 * Returns the width it took.
 */
export function drawBrandMark(
  ctx: CanvasRenderingContext2D,
  brand: BrandKit,
  {
    x,
    y,
    u,
    align,
    onPhoto,
    ink,
    height = 48,
    maxWidth = 420,
  }: {
    x: number;
    y: number;
    u: number;
    align: "left" | "right" | "center";
    onPhoto: boolean;
    ink: string;
    /** The mark's height at logo size 1, in reference pixels. */
    height?: number;
    /** The widest it may be at logo size 1 (a masthead allows more). */
    maxWidth?: number;
  },
): number {
  const color = logoColor(brand.logoTint, { onPhoto, ink });
  const scale = brand.logoScale;
  ctx.save();
  if (brand.logo) {
    const { w: lw, h: lh } = sizeOf(brand.logo);
    // A very wide logo is capped in width, and its height follows (never squashed).
    let h = height * u * scale;
    let w = (lw / lh) * h;
    const maxW = maxWidth * u * scale;
    if (w > maxW) {
      h *= maxW / w;
      w = maxW;
    }
    // Prepare the logo at the pixels it will cover (the canvas may be scaled).
    const m = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
    const k = m ? Math.hypot(m.a, m.b) || 1 : 1;
    // Rounded up to 16px steps, so a logo that grows or shrinks during an
    // animation reuses a few prepared sizes instead of one per frame.
    const pixelW = Math.ceil((w * k) / 16) * 16;
    const image = preparedLogo(brand.logo, color, pixelW, (pixelW * h) / w);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const left = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    ctx.drawImage(image, left, y - h / 2, w, h);
    ctx.restore();
    return w;
  }
  ctx.fillStyle = color ?? ink;
  ctx.font = font(44 * u * scale, STUDIO_FONTS.displayLatin, 600, "italic");
  ctx.direction = textDirection(brand.name);
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(brand.name, x, y);
  const width = ctx.measureText(brand.name).width;
  ctx.restore();
  return width;
}
