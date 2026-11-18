/*
 * Taking a picture's background off, on the merchant's device, with no model: the background is
 * whatever reaches the picture's edge in the colour the edge mostly is, filled in from the edge.
 * That covers most stickers saved from Pinterest: a white or flat background, or the grey and
 * white squares some pictures carry printed into them as fake transparency. A brush then erases
 * or brings back what the fill got wrong. Everything here is pure, on RGBA bytes.
 */

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };
export type Rgb = [number, number, number];

/**
 * What a picture's edge is: already see-through, one flat colour, the squares of fake
 * transparency, or a real scene a fill cannot take off.
 */
export type Backdrop =
  | { kind: "clear" }
  | { kind: "plain"; colors: Rgb[] }
  | { kind: "checker"; colors: Rgb[] }
  | { kind: "busy" };

/** A pixel at or under this alpha is already see-through. */
const CLEAR_ALPHA = 20;

/** The RGBA of every pixel on the picture's edge, once each. */
export function edgeSamples({ data, width, height }: Pixels): number[] {
  const out: number[] = [];
  const take = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    out.push(data[i], data[i + 1], data[i + 2], data[i + 3]);
  };
  for (let x = 0; x < width; x++) {
    take(x, 0);
    if (height > 1) take(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    take(0, y);
    if (width > 1) take(width - 1, y);
  }
  return out;
}

const bucketOf = (r: number, g: number, b: number) => `${r >> 4},${g >> 4},${b >> 4}`;
const isLightGrey = ([r, g, b]: Rgb) =>
  Math.max(r, g, b) - Math.min(r, g, b) <= 14 && (r + g + b) / 3 >= 150;

/** Reads the edge's colours: what a fill from the edge would take off. */
export function readBackdrop(samples: ArrayLike<number>): Backdrop {
  const total = samples.length / 4;
  if (!total) return { kind: "busy" };
  let clear = 0;
  const buckets = new Map<string, { n: number; sum: Rgb }>();
  for (let i = 0; i < samples.length; i += 4) {
    if (samples[i + 3] <= CLEAR_ALPHA) {
      clear += 1;
      continue;
    }
    const key = bucketOf(samples[i], samples[i + 1], samples[i + 2]);
    const b = buckets.get(key) ?? { n: 0, sum: [0, 0, 0] as Rgb };
    b.n += 1;
    b.sum[0] += samples[i];
    b.sum[1] += samples[i + 1];
    b.sum[2] += samples[i + 2];
    buckets.set(key, b);
  }
  if (clear / total >= 0.6) return { kind: "clear" };
  const solid = total - clear;
  const top = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 2)
    .map((b) => ({ n: b.n, color: b.sum.map((v) => Math.round(v / b.n)) as Rgb }));
  if (!top[0]) return { kind: "busy" };
  if (top[0].n / solid >= 0.7) return { kind: "plain", colors: [top[0].color] };
  if (
    top[1] &&
    (top[0].n + top[1].n) / solid >= 0.8 &&
    top[1].n / solid >= 0.2 &&
    isLightGrey(top[0].color) &&
    isLightGrey(top[1].color)
  ) {
    return { kind: "checker", colors: [top[0].color, top[1].color] };
  }
  return { kind: "busy" };
}

/** Whether to offer to take the background off a picture just uploaded. */
export const offersCutout = (backdrop: Backdrop) =>
  backdrop.kind === "plain" || backdrop.kind === "checker";

/** The sensitivity slider, 0 to 100, as a distance between colours (0 to 255). */
export const toleranceOf = (sensitivity: number) =>
  Math.round(6 + Math.min(100, Math.max(0, sensitivity)) * 0.9);

export const DEFAULT_SENSITIVITY = 30;

function distance(data: Uint8ClampedArray, i: number, c: Rgb) {
  const dr = data[i] - c[0];
  const dg = data[i + 1] - c[1];
  const db = data[i + 2] - c[2];
  return Math.sqrt((dr * dr + dg * dg + db * db) / 3);
}

/**
 * Fills the background in from the picture's edge: every pixel reached through pixels near one of
 * the background's colours (or already see-through) is taken off. 255 keeps a pixel, 0 takes it.
 * A colour inside the subject, cut off from the edge, stays: the eraser takes it.
 */
export function fillFromEdge(px: Pixels, colors: Rgb[], tolerance: number): Uint8Array {
  const { data, width, height } = px;
  const size = width * height;
  const mask = new Uint8Array(size).fill(255);
  const isBackground = (p: number) => {
    const i = p * 4;
    if (data[i + 3] <= CLEAR_ALPHA) return true;
    return colors.some((c) => distance(data, i, c) <= tolerance);
  };
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  const visit = (p: number) => {
    if (mask[p] === 0 || !isBackground(p)) return;
    mask[p] = 0;
    queue[tail++] = p;
  };
  for (let x = 0; x < width; x++) {
    visit(x);
    visit((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    if (x > 0) visit(p - 1);
    if (x < width - 1) visit(p + 1);
    if (p >= width) visit(p - width);
    if (p < size - width) visit(p + width);
  }
  return mask;
}

/** What the brush did: 0 left to the fill, 1 erased, 2 brought back. The last stroke wins. */
export const ERASED = 1;
export const KEPT = 2;

/** Paints a round brush along a stroke, from one point to the next. */
export function brushStroke(
  paint: Uint8Array,
  width: number,
  height: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
  value: typeof ERASED | typeof KEPT,
) {
  const r = Math.max(1, radius);
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (r / 3)));
  for (let s = 0; s <= steps; s++) {
    const cx = from.x + ((to.x - from.x) * s) / steps;
    const cy = from.y + ((to.y - from.y) * s) / steps;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(height - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) paint[y * width + x] = value;
      }
    }
  }
}

/** The fill with the brush over it. */
export function combineMask(fill: Uint8Array, paint: Uint8Array): Uint8Array {
  const out = new Uint8Array(fill.length);
  for (let p = 0; p < fill.length; p++) {
    out[p] = paint[p] === ERASED ? 0 : paint[p] === KEPT ? 255 : fill[p];
  }
  return out;
}

/**
 * Takes the outermost pixel of what is kept: a picture's edge is a blend of its subject and the
 * background, and left on it reads as a coloured fringe round the sticker.
 */
export function trimEdge(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (mask[p] === 0) continue;
      const touches =
        (x > 0 && mask[p - 1] === 0) ||
        (x < width - 1 && mask[p + 1] === 0) ||
        (y > 0 && mask[p - width] === 0) ||
        (y < height - 1 && mask[p + width] === 0);
      if (touches) out[p] = 0;
    }
  }
  return out;
}

/**
 * Softens the cut's edge by a pixel: a kept pixel beside a taken one is part see-through, so the
 * edge is not a staircase. Pixels well inside or outside are untouched.
 */
export function softenEdge(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (mask[p] === 0) continue;
      let sum = 0;
      let n = 0;
      let edge = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const v = mask[ny * width + nx];
          if (v === 0) edge = true;
          sum += v;
          n += 1;
        }
      }
      if (edge) out[p] = Math.round(sum / n);
    }
  }
  return out;
}

/** The picture with the mask as its see-through: a pixel's own alpha is never raised. */
export function applyMask(px: Pixels, mask: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(px.data);
  for (let p = 0; p < mask.length; p++)
    out[p * 4 + 3] = Math.round((out[p * 4 + 3] * mask[p]) / 255);
  return out;
}

/** The box round what is kept, with a margin, inside the picture. Null when nothing is kept. */
export function keptBounds(
  mask: Uint8Array,
  width: number,
  height: number,
  margin = 4,
): { x: number; y: number; w: number; h: number } | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] <= 8) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const x = Math.max(0, x0 - margin);
  const y = Math.max(0, y0 - margin);
  return {
    x,
    y,
    w: Math.min(width, x1 + margin + 1) - x,
    h: Math.min(height, y1 + margin + 1) - y,
  };
}

/** How much of the picture the cut keeps, 0 to 1: almost nothing means the fill went too far. */
export function keptShare(mask: Uint8Array): number {
  if (!mask.length) return 0;
  let kept = 0;
  for (let p = 0; p < mask.length; p++) if (mask[p] > 127) kept += 1;
  return kept / mask.length;
}

/** The first mask for a picture: the fill when its edge is a backdrop, else the picture whole. */
export function firstMask(px: Pixels, backdrop: Backdrop, sensitivity: number): Uint8Array {
  if (backdrop.kind === "plain" || backdrop.kind === "checker") {
    return fillFromEdge(px, backdrop.colors, toleranceOf(sensitivity));
  }
  if (backdrop.kind === "clear") return fillFromEdge(px, [], 0);
  return new Uint8Array(px.width * px.height).fill(255);
}
