import type { Drawable } from "@/features/content-studio/engine/scene";

export type Box = { x: number; y: number; w: number; h: number };

/** The intrinsic size of anything the canvas can draw. */
export function mediaSize(source: Drawable): { w: number; h: number } {
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    return { w: source.naturalWidth, h: source.naturalHeight };
  }
  if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
    return { w: source.videoWidth, h: source.videoHeight };
  }
  return { w: source.width, h: source.height };
}

/**
 * The part of a `w`×`h` source that fills `box` without distortion (object-fit:
 * cover), zoomed by `zoom` around the focus point (0 to 1 on each axis).
 */
export function coverCrop(
  w: number,
  h: number,
  box: Box,
  {
    zoom = 1,
    focusX = 0.5,
    focusY = 0.5,
  }: { zoom?: number; focusX?: number; focusY?: number } = {},
): Box {
  const scale = Math.max(box.w / w, box.h / h) * zoom;
  const cropW = box.w / scale;
  const cropH = box.h / scale;
  const x = Math.min(Math.max(focusX * w - cropW / 2, 0), w - cropW);
  const y = Math.min(Math.max(focusY * h - cropH / 2, 0), h - cropH);
  return { x, y, w: cropW, h: cropH };
}

/** Draws `source` to fill `box` like object-fit: cover, optionally zoomed. */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  source: Drawable,
  box: Box,
  options?: { zoom?: number; focusX?: number; focusY?: number },
) {
  const { w, h } = mediaSize(source);
  if (!w || !h) return;
  const crop = coverCrop(w, h, box, options);
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, box.x, box.y, box.w, box.h);
}

/** Adds a rounded rectangle path (fill or clip it after). */
export function roundedRect(ctx: CanvasRenderingContext2D, box: Box, radius: number) {
  const r = Math.min(radius, box.w / 2, box.h / 2);
  ctx.beginPath();
  ctx.moveTo(box.x + r, box.y);
  ctx.arcTo(box.x + box.w, box.y, box.x + box.w, box.y + box.h, r);
  ctx.arcTo(box.x + box.w, box.y + box.h, box.x, box.y + box.h, r);
  ctx.arcTo(box.x, box.y + box.h, box.x, box.y, r);
  ctx.arcTo(box.x, box.y, box.x + box.w, box.y, r);
  ctx.closePath();
}

/** A CSS font shorthand for the canvas. */
export function font(
  size: number,
  family: string,
  weight = 400,
  style: "normal" | "italic" = "normal",
) {
  return `${style} ${weight} ${Math.round(size)}px ${family}`;
}

/**
 * Draws lines of text from the top at `y`, aligned to the reading start of
 * `x` (left in English, right in Arabic, or centred). `reveal` gives each
 * line its own alpha and vertical offset, for staggered entrances.
 */
export function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  {
    x,
    y,
    lineHeight,
    dir,
    align = "start",
    reveal,
  }: {
    x: number;
    y: number;
    lineHeight: number;
    dir: "rtl" | "ltr";
    align?: "start" | "center";
    reveal?: (index: number) => { alpha: number; dy: number };
  },
) {
  ctx.save();
  ctx.direction = dir;
  ctx.textAlign = align === "center" ? "center" : "start";
  ctx.textBaseline = "top";
  const baseAlpha = ctx.globalAlpha;
  lines.forEach((line, index) => {
    const { alpha, dy } = reveal ? reveal(index) : { alpha: 1, dy: 0 };
    if (alpha <= 0) return;
    ctx.globalAlpha = baseAlpha * alpha;
    ctx.fillText(line, x, y + index * lineHeight + dy);
  });
  ctx.restore();
}

/**
 * `color` at `alpha` opacity, for gradients that fade into a palette colour.
 * Takes #rgb / #rrggbb (palette grounds); other formats are returned as is.
 */
export function withAlpha(color: string, alpha: number) {
  const hex = color.trim().replace(/^#/, "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return color;
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
