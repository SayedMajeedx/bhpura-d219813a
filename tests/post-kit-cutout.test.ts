import { describe, expect, it } from "vitest";
import {
  ERASED,
  KEPT,
  applyMask,
  brushStroke,
  combineMask,
  edgeSamples,
  fillFromEdge,
  firstMask,
  keptBounds,
  keptShare,
  offersCutout,
  readBackdrop,
  softenEdge,
  toleranceOf,
  trimEdge,
  type Pixels,
  type Rgb,
} from "../src/addons/post-kit/lib/cutout";
import { edgeColorOf, edgeShare } from "../src/addons/post-kit/lib/photo-shape";
import { laidSticker, withCutout } from "../src/addons/post-kit/lib/post-rules";
import { fromStored } from "../src/addons/post-kit/lib/stored";
import type { Post } from "../src/addons/post-kit/lib/types";

/** A made-up picture: `paint` gives each pixel's RGBA. */
function picture(w: number, h: number, paint: (x: number, y: number) => number[]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data.set(paint(x, y), (y * w + x) * 4);
  }
  return { data, width: w, height: h };
}

const RED = [190, 30, 40, 255];
/** A red square in the middle of a 20 by 20 picture, on what `bg` paints. */
const square = (bg: (x: number, y: number) => number[]) =>
  picture(20, 20, (x, y) => (x >= 6 && x < 14 && y >= 6 && y < 14 ? RED : bg(x, y)));
const at = (mask: Uint8Array, x: number, y: number, w = 20) => mask[y * w + x];

describe("reading a picture's edge", () => {
  it("finds a white background, even with a JPEG's noise", () => {
    const px = square((x, y) => [255 - ((x + y) % 3), 254, 255, 255]);
    const backdrop = readBackdrop(edgeSamples(px));
    expect(backdrop.kind).toBe("plain");
    expect(offersCutout(backdrop)).toBe(true);
  });

  it("finds a flat colour that is not white", () => {
    const backdrop = readBackdrop(edgeSamples(square(() => [40, 120, 200, 255])));
    expect(backdrop).toEqual({ kind: "plain", colors: [[40, 120, 200]] });
  });

  it("finds the grey and white squares of fake transparency", () => {
    const checker = (x: number, y: number) =>
      (Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? [204, 204, 204, 255] : [255, 255, 255, 255];
    const backdrop = readBackdrop(edgeSamples(square(checker)));
    expect(backdrop.kind).toBe("checker");
    expect(offersCutout(backdrop)).toBe(true);
  });

  it("says a picture that is already see-through is clear, and a scene is busy", () => {
    expect(readBackdrop(edgeSamples(square(() => [0, 0, 0, 0]))).kind).toBe("clear");
    const scene = square((x, y) => [(x * 37) % 255, (y * 53) % 255, (x * y * 11) % 255, 255]);
    const busy = readBackdrop(edgeSamples(scene));
    expect(busy.kind).toBe("busy");
    expect(offersCutout(busy)).toBe(false);
  });
});

describe("taking the background off", () => {
  it("takes a white background and keeps the subject", () => {
    const px = square(() => [255, 255, 255, 255]);
    const mask = fillFromEdge(px, [[255, 255, 255]], toleranceOf(30));
    expect(at(mask, 0, 0)).toBe(0);
    expect(at(mask, 5, 10)).toBe(0);
    expect(at(mask, 10, 10)).toBe(255);
    expect(keptShare(mask)).toBeCloseTo(64 / 400);
  });

  it("takes both colours of the fake squares", () => {
    const checker = (x: number, y: number) =>
      (x + y) % 2 ? [204, 204, 204, 255] : [255, 255, 255, 255];
    const px = square(checker);
    const backdrop = readBackdrop(edgeSamples(px));
    const mask = firstMask(px, backdrop, 30);
    expect(keptShare(mask)).toBeCloseTo(64 / 400);
  });

  it("keeps a white inside the subject that the edge cannot reach", () => {
    // A red ring with a white middle: the middle is cut off from the edge, so it stays.
    const px = picture(20, 20, (x, y) => {
      const ring = x >= 4 && x < 16 && y >= 4 && y < 16;
      const hole = x >= 8 && x < 12 && y >= 8 && y < 12;
      return ring && !hole ? RED : [255, 255, 255, 255];
    });
    const mask = fillFromEdge(px, [[255, 255, 255]], toleranceOf(30));
    expect(at(mask, 10, 10)).toBe(255);
    expect(at(mask, 1, 1)).toBe(0);
  });

  it("goes further as the sensitivity rises", () => {
    const px = square(() => [255, 255, 255, 255]);
    const pink: Rgb = [235, 200, 205];
    const pinkSquare = picture(20, 20, (x, y) =>
      x >= 6 && x < 14 && y >= 6 && y < 14 ? [...pink, 255] : [255, 255, 255, 255],
    );
    expect(keptShare(fillFromEdge(pinkSquare, [[255, 255, 255]], toleranceOf(10)))).toBeGreaterThan(
      0,
    );
    expect(keptShare(fillFromEdge(pinkSquare, [[255, 255, 255]], toleranceOf(100)))).toBe(0);
    expect(keptShare(fillFromEdge(px, [[255, 255, 255]], toleranceOf(100)))).toBeGreaterThan(0);
  });

  it("starts a scene whole, for the brush, and a clear picture without its clear edge", () => {
    const scene = square((x, y) => [(x * 37) % 255, (y * 53) % 255, 9, 255]);
    expect(keptShare(firstMask(scene, { kind: "busy" }, 30))).toBe(1);
    const clear = square(() => [0, 0, 0, 0]);
    expect(keptShare(firstMask(clear, { kind: "clear" }, 30))).toBeCloseTo(64 / 400);
  });
});

describe("the brush and the finished sticker", () => {
  it("erases and brings back, the last stroke winning", () => {
    const px = square(() => [255, 255, 255, 255]);
    const fill = fillFromEdge(px, [[255, 255, 255]], toleranceOf(30));
    const paint = new Uint8Array(400);
    brushStroke(paint, 20, 20, { x: 10, y: 10 }, { x: 10, y: 10 }, 2, ERASED);
    expect(at(combineMask(fill, paint), 10, 10)).toBe(0);
    brushStroke(paint, 20, 20, { x: 1, y: 1 }, { x: 18, y: 1 }, 1, KEPT);
    const mask = combineMask(fill, paint);
    expect(at(mask, 1, 1)).toBe(255);
    expect(at(mask, 9, 1)).toBe(255);
    brushStroke(paint, 20, 20, { x: 10, y: 10 }, { x: 10, y: 10 }, 2, KEPT);
    expect(at(combineMask(fill, paint), 10, 10)).toBe(255);
  });

  it("softens only the cut's edge, and never raises a pixel's own alpha", () => {
    const px = square(() => [255, 255, 255, 255]);
    const mask = fillFromEdge(px, [[255, 255, 255]], toleranceOf(30));
    const soft = softenEdge(mask, 20, 20);
    expect(at(soft, 6, 6)).toBeGreaterThan(0);
    expect(at(soft, 6, 6)).toBeLessThan(255);
    expect(at(soft, 10, 10)).toBe(255);
    expect(at(soft, 0, 0)).toBe(0);
    const half = picture(1, 1, () => [1, 2, 3, 100]);
    expect(applyMask(half, new Uint8Array([255]))[3]).toBe(100);
    expect(applyMask(half, new Uint8Array([0]))[3]).toBe(0);
  });

  it("takes the blended pixel at the cut's edge, and nothing inside", () => {
    const px = square(() => [255, 255, 255, 255]);
    const mask = trimEdge(fillFromEdge(px, [[255, 255, 255]], toleranceOf(30)), 20, 20);
    expect(at(mask, 6, 10)).toBe(0);
    expect(at(mask, 7, 10)).toBe(255);
    expect(keptShare(mask)).toBeCloseTo(36 / 400);
  });

  it("trims to what is kept, with a margin inside the picture", () => {
    const px = square(() => [255, 255, 255, 255]);
    const mask = fillFromEdge(px, [[255, 255, 255]], toleranceOf(30));
    expect(keptBounds(mask, 20, 20, 2)).toEqual({ x: 4, y: 4, w: 12, h: 12 });
    expect(keptBounds(mask, 20, 20, 10)).toEqual({ x: 0, y: 0, w: 20, h: 20 });
    expect(keptBounds(new Uint8Array(400), 20, 20)).toBe(null);
  });
});

describe("a sticker on the post", () => {
  const post = (stickers: Post["stickers"]): Post => ({
    key: "k",
    series: "s",
    title: "t",
    tpl: "joke",
    tone: "wine",
    size: "post",
    caption: "",
    stickers,
  });

  it("takes the place of the photo it was cut from, as a thin-edged sticker", () => {
    const start = post([
      { id: "eyes", x: 0.2, y: 0.2, s: 200 },
      {
        id: "photo",
        photo: "upload-a",
        x: 0.3,
        y: 0.7,
        s: 400,
        r: 12,
        frame: "none",
        crop: { z: 2 },
      },
    ]);
    const { post: next, index } = withCutout(start, "upload-a", "upload-b");
    expect(index).toBe(1);
    expect(next.stickers[1]).toEqual({
      id: "photo",
      photo: "upload-b",
      x: 0.3,
      y: 0.7,
      s: 400,
      r: 12,
      frame: "cut",
      edge: "thin",
      crop: undefined,
    });
  });

  it("is laid on top when the photo was not laid on the post", () => {
    const start = post([{ id: "eyes", x: 0.2, y: 0.2, s: 200 }]);
    const { post: next, index } = withCutout(start, "piece-1", "upload-b");
    expect(index).toBe(1);
    expect(next.stickers[1]).toEqual(laidSticker("upload-b"));
  });

  it("draws a thin or wide edge in white or cream, and keeps only what it knows", () => {
    expect(edgeShare(laidSticker("x"))).toBeLessThan(
      edgeShare({ ...laidSticker("x"), edge: undefined }),
    );
    expect(edgeColorOf({ ...laidSticker("x"), edgeColor: "cream" })).not.toBe(
      edgeColorOf(laidSticker("x")),
    );
    const template = post([]);
    const kept = fromStored(
      {
        ...template,
        stickers: [
          { ...laidSticker("x"), edgeColor: "cream" },
          { ...laidSticker("x"), edge: "huge", edgeColor: "gold" },
        ],
      },
      template,
      { photos: {}, prices: {}, from: null },
    );
    expect(kept?.stickers[0]).toMatchObject({ edge: "thin", edgeColor: "cream" });
    expect(kept?.stickers[1].edge).toBe(undefined);
    expect(kept?.stickers[1].edgeColor).toBe(undefined);
  });
});
