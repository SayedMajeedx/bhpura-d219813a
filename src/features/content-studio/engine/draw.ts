import type { Drawable } from "@/features/content-studio/engine/scene";
import { textDirection } from "@/features/content-studio/engine/text-layout";

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

/**
 * Where a point of the source (`x`, `y` from 0 to 1 across it) lands on the
 * canvas when the source is drawn into `box` with coverCrop's framing.
 */
export function coverPoint(
  w: number,
  h: number,
  box: Box,
  point: { x: number; y: number },
  options?: { zoom?: number; focusX?: number; focusY?: number },
): { x: number; y: number } {
  const crop = coverCrop(w, h, box, options);
  return {
    x: box.x + ((point.x * w - crop.x) * box.w) / crop.w,
    y: box.y + ((point.y * h - crop.y) * box.h) / crop.h,
  };
}

const scaledPhotos = new WeakMap<object, Map<number, HTMLCanvasElement>>();

/**
 * A still photo halved (with high-quality smoothing) until it is less than
 * twice `longest` on its longest side, cached. Drawing a huge
 * photo small every frame is slow at high quality and loses detail at low
 * quality; drawing this copy is both fast and sharp. Only <img> sources are
 * scaled: video frames change under the same object and arrive at size.
 */
function scaledPhoto(source: Drawable, longest: number): Drawable {
  if (typeof HTMLImageElement === "undefined" || !(source instanceof HTMLImageElement)) {
    return source;
  }
  const bucket = Math.ceil(longest / 256) * 256;
  const cached = scaledPhotos.get(source)?.get(bucket);
  if (cached) return cached;
  let current: Drawable = source;
  let { w, h } = mediaSize(source);
  // Halve while the half still covers what is needed (the bucket only keys the cache).
  while (Math.max(w, h) / 2 >= longest) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w / 2);
    canvas.height = Math.round(h / 2);
    const ctx = canvas.getContext("2d");
    if (!ctx) return source;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(current, 0, 0, canvas.width, canvas.height);
    current = canvas;
    w = canvas.width;
    h = canvas.height;
  }
  if (current === source) return source;
  const byBucket = scaledPhotos.get(source) ?? new Map<number, HTMLCanvasElement>();
  byBucket.set(bucket, current as HTMLCanvasElement);
  scaledPhotos.set(source, byBucket);
  return current;
}

/** Draws `source` to fill `box` like object-fit: cover, optionally zoomed. */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  source: Drawable,
  box: Box,
  options?: { zoom?: number; focusX?: number; focusY?: number },
) {
  const m = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
  const k = m ? Math.hypot(m.a, m.b) || 1 : 1;
  const image = scaledPhoto(source, Math.max(box.w, box.h) * k * (options?.zoom ?? 1));
  const { w, h } = mediaSize(image);
  if (!w || !h) return;
  const crop = coverCrop(w, h, box, options);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, crop.x, crop.y, crop.w, crop.h, box.x, box.y, box.w, box.h);
  ctx.restore();
}

const shades = new Map<string, HTMLCanvasElement>();

/**
 * Darkens the top and the foot of a full-bleed photo so white type reads on
 * it: black fading from `top.alpha` over the top `top.height` of the frame,
 * and fading in from `foot.from` down to `foot.alpha` at the bottom (both as
 * fractions of the height). Gradients are slow to paint, and the shading
 * never changes, so it is painted once per size and stamped on every frame.
 */
export function drawShade(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  top: { height: number; alpha: number },
  foot: { from: number; alpha: number },
) {
  const key = [Math.round(W), Math.round(H), top.height, top.alpha, foot.from, foot.alpha].join(
    ":",
  );
  let shade = shades.get(key);
  if (!shade) {
    shade = document.createElement("canvas");
    shade.width = Math.round(W);
    shade.height = Math.round(H);
    const s = shade.getContext("2d");
    if (!s) return;
    const upper = s.createLinearGradient(0, 0, 0, H * top.height);
    upper.addColorStop(0, `rgba(0,0,0,${top.alpha})`);
    upper.addColorStop(1, "rgba(0,0,0,0)");
    s.fillStyle = upper;
    s.fillRect(0, 0, W, H * top.height);
    const lower = s.createLinearGradient(0, H * foot.from, 0, H);
    lower.addColorStop(0, "rgba(0,0,0,0)");
    lower.addColorStop(1, `rgba(0,0,0,${foot.alpha})`);
    s.fillStyle = lower;
    s.fillRect(0, H * foot.from, W, H * (1 - foot.from));
    if (shades.size > 6) shades.clear();
    shades.set(key, shade);
  }
  ctx.drawImage(shade, 0, 0, W, H);
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

/** One piece of a line of mixed text (a name, a separator, a price): drawn on its own. */
export type TextRun = { text: string; dir?: "rtl" | "ltr" };

/** The width of a line of runs `gap` apart, in the current font. */
export function measureRuns(ctx: CanvasRenderingContext2D, runs: readonly TextRun[], gap: number) {
  const widths = runs.map((run) => ctx.measureText(run.text).width);
  return {
    widths,
    total: widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, runs.length - 1),
  };
}

/**
 * Draws a line made of separate runs in reading order: in a right-to-left
 * line the first run sits at the right. Each run is drawn by itself in its
 * own direction, so an Arabic name, a number and a currency never reorder
 * into each other, as they do when joined into one string and drawn at once.
 * Always use this, not a joined string, when a line mixes a name with a price
 * or other numbers. `x` is the line's start (its right end in RTL) or centre.
 */
export function drawRuns(
  ctx: CanvasRenderingContext2D,
  runs: readonly TextRun[],
  {
    x,
    y,
    lineDir,
    align = "start",
    gap,
  }: { x: number; y: number; lineDir: "rtl" | "ltr"; align?: "start" | "center"; gap: number },
): number {
  const { widths, total } = measureRuns(ctx, runs, gap);
  let left = align === "center" ? x - total / 2 : lineDir === "rtl" ? x - total : x;
  const order = runs.map((_, index) => index);
  if (lineDir === "rtl") order.reverse();
  ctx.save();
  ctx.textAlign = "left";
  for (const index of order) {
    const run = runs[index];
    ctx.direction = run.dir ?? textDirection(run.text);
    ctx.fillText(run.text, left, y);
    left += widths[index] + gap;
  }
  ctx.restore();
  return total;
}

/** How light a #rgb / #rrggbb colour is (0 black to 1 white); 0.5 for other formats. */
export function luminance(color: string): number {
  const hex = color.trim().replace(/^#/, "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return 0.5;
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Of two colours, the darker: for text on a light box, whichever way round a palette runs. */
export function darker(a: string, b: string): string {
  return luminance(a) <= luminance(b) ? a : b;
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
