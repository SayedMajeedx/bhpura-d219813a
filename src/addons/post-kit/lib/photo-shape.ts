import type { Crop, Geometry, PhotoBook, PhotoFrame, Post, Sticker } from "./types";

/*
 * The shape of what sits on a post, worked out without drawing it: how big a laid photo is, where
 * a finger or the mouse lands on a turned sticker, and when a photo is stretched past what it holds.
 */

export const PHOTO_FRAMES: readonly PhotoFrame[] = ["none", "cut", "polaroid", "tape"];

/** A photo's frame: one written before the frames existed is a print, as it was drawn then. */
export const frameOf = (st: Sticker): PhotoFrame =>
  st.frame && PHOTO_FRAMES.includes(st.frame) ? st.frame : "polaroid";

/** Whether a photo casts a shadow: what it says, else its frame's own (a bare photo has none). */
export const shadowOf = (st: Sticker): boolean => st.shadow ?? frameOf(st) !== "none";

/** A cut-out's white edge, as a share of its long side: thin, or as it always was. */
export const edgeShare = (st: Sticker) => (st.edge === "thin" ? 0.016 : 0.035);
export const EDGE_COLORS = { white: "#fff", cream: "#F3E6CF" } as const;
export const edgeColorOf = (st: Sticker) =>
  st.edgeColor === "cream" ? EDGE_COLORS.cream : EDGE_COLORS.white;

/** The smallest and largest a sticker can be, in the post's own pixels (1080 wide). */
export const SIZE_MIN = 60;
export const SIZE_MAX = 1620;
export const clampSize = (s: number) => Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(s)));

/** A turn kept to -180..180, settling on straight when it is within 3 degrees of it. */
export function clampTurn(r: number): number {
  let turn = ((((r + 180) % 360) + 360) % 360) - 180;
  if (Math.abs(turn) < 3) turn = 0;
  return Math.round(turn);
}

type Size = { width: number; height: number };

/**
 * The box a photo is drawn in. A print keeps its 4:5 card; any other frame keeps the photo's own
 * shape, its long side the sticker's size, so a wide meme is never cut to a portrait.
 */
export function photoBox(st: Pick<Sticker, "s" | "frame">, img?: Size | null) {
  if (frameOf(st as Sticker) === "polaroid") return { w: st.s * 0.8, h: st.s };
  const ratio = img && img.width > 0 && img.height > 0 ? img.width / img.height : 0.8;
  return ratio >= 1 ? { w: st.s, h: st.s / ratio } : { w: st.s * ratio, h: st.s };
}

/**
 * The box a sticker covers on the post. A drawn sticker fills its square but leaves a margin of
 * air round its drawing, so it is held by the middle of that square, as it always was.
 */
export function stickerBox(st: Sticker, photos: PhotoBook = {}) {
  if (st.id === "photo") return { ...photoBox(st, photos[st.photo ?? ""]?.img), grip: 0.5 };
  return { w: st.s, h: st.s, grip: 0.42 };
}

/** A point of the post (0..1 each way) in a sticker's own turned frame, in post pixels. */
export function localPoint(st: Sticker, x: number, y: number, g: Pick<Geometry, "W" | "H">) {
  const dx = (x - st.x) * g.W;
  const dy = (y - st.y) * g.H;
  const a = (-(st.r ?? 0) * Math.PI) / 180;
  return { lx: dx * Math.cos(a) - dy * Math.sin(a), ly: dx * Math.sin(a) + dy * Math.cos(a) };
}

/** Whether a point lands on a sticker, its turn counted. */
export function onSticker(
  st: Sticker,
  x: number,
  y: number,
  g: Pick<Geometry, "W" | "H">,
  photos: PhotoBook = {},
): boolean {
  const box = stickerBox(st, photos);
  const { lx, ly } = localPoint(st, x, y, g);
  return Math.abs(lx) <= box.w * box.grip && Math.abs(ly) <= box.h * box.grip;
}

export type Handle = "size" | "turn";

/**
 * The two handles of a selected sticker, in post pixels: one at a corner to make it bigger or
 * smaller, one above it to turn it. `radius` is how far a handle reaches, sized for a finger.
 */
export function handlesOf(st: Sticker, g: Pick<Geometry, "W" | "H">, photos: PhotoBook = {}) {
  const box = stickerBox(st, photos);
  const a = ((st.r ?? 0) * Math.PI) / 180;
  const at = (lx: number, ly: number) => ({
    x: st.x * g.W + lx * Math.cos(a) - ly * Math.sin(a),
    y: st.y * g.H + lx * Math.sin(a) + ly * Math.cos(a),
  });
  return {
    box,
    size: at(box.w / 2, box.h / 2),
    turn: at(0, -box.h / 2 - 70),
  };
}

/** Which handle of the selected sticker a point lands on, if any. */
export function handleAt(
  st: Sticker,
  x: number,
  y: number,
  g: Pick<Geometry, "W" | "H">,
  radius: number,
  photos: PhotoBook = {},
): Handle | null {
  const h = handlesOf(st, g, photos);
  const near = (p: { x: number; y: number }) => Math.hypot(x * g.W - p.x, y * g.H - p.y) <= radius;
  if (near(h.size)) return "size";
  if (near(h.turn)) return "turn";
  return null;
}

/** The sticker under a point of the post, topmost first, its turn counted. */
export function topStickerAt(
  post: Post,
  x: number,
  y: number,
  g: Pick<Geometry, "W" | "H">,
  photos: PhotoBook = {},
): number {
  for (let i = post.stickers.length - 1; i >= 0; i--) {
    if (onSticker(post.stickers[i], x, y, g, photos)) return i;
  }
  return -1;
}

/**
 * Whether a photo is shown larger than it holds: each pixel of the photo drawn over more than 1.6
 * of the post's. A sticker saved from a Pinterest grid is about 236 pixels wide and goes soft fast.
 */
export function photoTooSmall(
  st: Sticker,
  img: Size | null | undefined,
  crop: Crop = st.crop ?? {},
): boolean {
  if (!img || img.width <= 0 || img.height <= 0) return false;
  const box = photoBox(st, img);
  const z = crop.z ?? 1;
  const cover = Math.max(box.w / img.width, box.h / img.height) * z;
  return cover > 1.6;
}

/** The size that makes a laid photo as wide as the post. */
export function fullWidthSize(st: Sticker, img: Size | null | undefined, W: number): number {
  const box = photoBox(st, img);
  return clampSize((st.s * W) / box.w);
}

type Point = { x: number; y: number };

/** A size dragged by its corner handle: grows as the handle moves away from the middle. */
export function sizedFrom(s0: number, center: Point, start: Point, now: Point): number {
  const d0 = Math.max(1, Math.hypot(start.x - center.x, start.y - center.y));
  return clampSize((s0 * Math.hypot(now.x - center.x, now.y - center.y)) / d0);
}

/** A turn that points the sticker's top at the turn handle, wherever it was dragged. */
export function turnedTo(center: Point, now: Point): number {
  return clampTurn((Math.atan2(now.y - center.y, now.x - center.x) * 180) / Math.PI + 90);
}

/** Two fingers: the sticker grows as they spread and turns as they turn. */
export function pinched(
  start: { s: number; r: number; a: Point; b: Point },
  a: Point,
  b: Point,
): { s: number; r: number } {
  const d0 = Math.max(1, Math.hypot(start.b.x - start.a.x, start.b.y - start.a.y));
  const angle = (p: Point, q: Point) => (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
  return {
    s: clampSize((start.s * Math.hypot(b.x - a.x, b.y - a.y)) / d0),
    r: clampTurn(start.r + angle(a, b) - angle(start.a, start.b)),
  };
}
