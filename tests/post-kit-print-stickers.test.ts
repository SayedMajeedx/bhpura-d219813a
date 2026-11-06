import { describe, expect, it } from "vitest";
import { A4_MM, chunk, gridLayout, mmToPx, withPngDpi } from "../src/addons/post-kit/lib/print-png";
import { BAG_SIZES_MM, bagLabelsPerSheet } from "../src/addons/post-kit/lib/bag-label";
import { printableStickerIds, stickerPages } from "../src/addons/post-kit/lib/sticker-sheet";
import { STICKERS } from "../src/addons/post-kit/lib/stickers";

/** A 1x1 PNG, as a canvas writes it, with no physical size. */
const TINY_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  ),
  (ch) => ch.charCodeAt(0),
);

describe("print files", () => {
  it("turns millimetres into pixels at 300 dpi", () => {
    expect(mmToPx(A4_MM.w)).toBe(2480);
    expect(mmToPx(A4_MM.h)).toBe(3508);
    expect(mmToPx(25.4)).toBe(300);
  });

  it("writes the print size into a PNG and keeps the picture", () => {
    const out = withPngDpi(TINY_PNG);
    expect(out.length).toBe(TINY_PNG.length + 21);
    const text = new TextDecoder("latin1").decode(out);
    expect(text).toContain("pHYs");
    const at = text.indexOf("pHYs") + 4;
    const view = new DataView(out.buffer, out.byteOffset);
    expect(view.getUint32(at)).toBe(11811);
    expect(view.getUint32(at + 4)).toBe(11811);
    expect(out[at + 8]).toBe(1);
    // Everything of the original is still there, in order.
    expect(Array.from(out.subarray(0, 33))).toEqual(Array.from(TINY_PNG.subarray(0, 33)));
    expect(Array.from(out.subarray(out.length - 12))).toEqual(
      Array.from(TINY_PNG.subarray(TINY_PNG.length - 12)),
    );
  });

  it("leaves a file that is not a PNG alone", () => {
    const junk = new Uint8Array([1, 2, 3]);
    expect(withPngDpi(junk)).toBe(junk);
  });

  it("lays squares inside the margin, centred, never overlapping", () => {
    const { cols, rows, cells } = gridLayout(1000, 1000, 50, 200, 20);
    expect(cols).toBe(4);
    expect(rows).toBe(4);
    expect(cells).toHaveLength(16);
    const last = cells[15];
    expect(last.x + 200).toBeLessThanOrEqual(950);
    expect(cells[0].x - 0).toBeCloseTo(1000 - (last.x + 200), 5);
    expect(gridLayout(100, 100, 10, 200, 5).cells).toHaveLength(0);
  });

  it("splits a list into pages", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("the printed stickers", () => {
  it("are the die-cut ones only, each once, every one on a sheet", () => {
    const ids = printableStickerIds();
    expect(ids.length).toBeGreaterThan(20);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => {
      const def = STICKERS[id];
      expect(def.art).toBeTypeOf("function");
      expect(def.stitch).toBeFalsy();
      expect(def.photoCard).toBeFalsy();
      expect(def.text).toBeFalsy();
    });
    expect(ids).toContain("hanger-smile");
    expect(stickerPages().flat()).toEqual(ids);
  });

  it("fit on an A4 in whole numbers, and the bag label at each size", () => {
    expect(stickerPages()[0].length).toBeGreaterThanOrEqual(12);
    expect(BAG_SIZES_MM.map(bagLabelsPerSheet)).toEqual([12, 6, 6]);
  });
});
