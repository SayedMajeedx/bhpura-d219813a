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

const tinted = new WeakMap<object, Map<string, HTMLCanvasElement>>();

/**
 * The logo in one flat colour (its shape kept by the alpha channel), cached per
 * logo and colour so each frame draws it without work. Falls back to the
 * original logo where a canvas is not available.
 */
function tintedLogo(logo: Drawable, color: string): Drawable {
  const cached = tinted.get(logo)?.get(color);
  if (cached) return cached;
  const { w, h } = sizeOf(logo);
  const scale = Math.min(1, 1024 / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return logo;
  ctx.drawImage(logo, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const byColor = tinted.get(logo) ?? new Map<string, HTMLCanvasElement>();
  byColor.set(color, canvas);
  tinted.set(logo, byColor);
  return canvas;
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
  }: {
    x: number;
    y: number;
    u: number;
    align: "left" | "right";
    onPhoto: boolean;
    ink: string;
    /** The mark's height at logo size 1, in reference pixels. */
    height?: number;
  },
): number {
  const color = logoColor(brand.logoTint, { onPhoto, ink });
  const scale = brand.logoScale;
  ctx.save();
  if (brand.logo) {
    const h = height * u * scale;
    const { w: lw, h: lh } = sizeOf(brand.logo);
    const w = Math.min((lw / lh) * h, 420 * u * scale);
    const image = color ? tintedLogo(brand.logo, color) : brand.logo;
    ctx.drawImage(image, align === "right" ? x - w : x, y - h / 2, w, h);
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
