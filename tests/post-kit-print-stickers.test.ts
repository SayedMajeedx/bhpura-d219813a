import { afterEach, describe, expect, it, vi } from "vitest";
import { A4_MM, chunk, gridLayout, mmToPx, withPngDpi } from "../src/addons/post-kit/lib/print-png";
import {
  BAG_SIZES_MM,
  bagLabelsPerSheet,
  drawBagLabel,
  LABEL_DESIGNS,
  renderBagLabel,
} from "../src/addons/post-kit/lib/bag-label";
import { drawFineLabel, FINE_WORDS } from "../src/addons/post-kit/lib/fine-label";
import {
  printableStickerIds,
  renderStickerSheet,
  STICKER_CELL,
  stickerPages,
} from "../src/addons/post-kit/lib/sticker-sheet";
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

type Call = { name: string; args: unknown[] };

/** A canvas that writes down what it was told, as a test has no real one. */
function recorder() {
  const calls: Call[] = [];
  const ctx: unknown = new Proxy(
    {},
    {
      get(target: Record<string, unknown>, name: string) {
        if (name in target) return target[name];
        if (name === "measureText") return () => ({ width: 100 });
        return (...args: unknown[]) => {
          calls.push({ name, args });
        };
      },
      set(target: Record<string, unknown>, name: string, value: unknown) {
        target[name] = value;
        if (name === "font") calls.push({ name: "font", args: [value] });
        return true;
      },
    },
  );
  return { calls, ctx: ctx as CanvasRenderingContext2D };
}

describe("the printed labels' edges", () => {
  afterEach(() => vi.unstubAllGlobals());
  const paths = () => vi.stubGlobal("Path2D", class {});

  it("fill the whole square, with nothing cutting its corners", () => {
    paths();
    for (const draw of [drawBagLabel, drawFineLabel]) {
      const { calls, ctx } = recorder();
      draw(ctx);
      expect(calls.some((call) => call.name === "clip")).toBe(false);
      expect(calls.find((call) => call.name === "fillRect")?.args).toEqual([0, 0, 1000, 1000]);
    }
  });

  it("print the store's number on both labels, and nothing in its place without one", () => {
    paths();
    const written = (draw: typeof drawBagLabel, phone?: string) => {
      const { calls, ctx } = recorder();
      draw(ctx, "@x", phone);
      return calls.filter((call) => call.name === "fillText").map((call) => String(call.args[0]));
    };
    expect(written(drawFineLabel, "+973 1")).toEqual([FINE_WORDS, "@x", "+973 1"]);
    expect(written(drawFineLabel)).toEqual([FINE_WORDS, "@x"]);
    expect(written(drawBagLabel, "+973 1").at(-1)).toBe("@x  ·  +973 1");
    expect(written(drawBagLabel).at(-1)).toBe("@x");
  });

  it("write Shammoua's words in the clear face, not the hand one", () => {
    paths();
    const { calls, ctx } = recorder();
    drawBagLabel(ctx);
    const fonts = calls.filter((call) => call.name === "font").map((call) => String(call.args[0]));
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.some((font) => font.includes("Marhey"))).toBe(false);
  });

  it("frame the quiet label with straight lines and no drawing", () => {
    paths();
    const { calls, ctx } = recorder();
    drawFineLabel(ctx);
    expect(calls.filter((call) => call.name === "strokeRect")).toHaveLength(2);
    expect(calls.some((call) => call.name === "arcTo" || call.name === "ellipse")).toBe(false);
    const text = calls.filter((call) => call.name === "fillText").map((call) => call.args[0]);
    expect(text).toEqual([FINE_WORDS, "@puraline.bh"]);
  });

  it("draw the design asked for, Shammoua's by default", () => {
    paths();
    expect(LABEL_DESIGNS).toEqual(["shammoua", "fine"]);
    const draw = (design?: "shammoua" | "fine") => {
      const { calls, ctx } = recorder();
      const canvas = { getContext: () => ctx, width: 0, height: 0 } as unknown as HTMLCanvasElement;
      renderBagLabel(canvas, 60, "@x", design);
      return calls.filter((call) => call.name === "strokeRect").length;
    };
    // The quiet label has its two gold lines; Shammoua's has its one stitched border.
    expect(draw("fine")).toBe(2);
    expect(draw("shammoua")).toBe(1);
    expect(draw()).toBe(draw("shammoua"));
  });

  it("cuts a sticker sheet along straight lines, one square a sticker, only when asked", () => {
    const ids = stickerPages()[0].slice(0, 3);
    const lines = (cutLine: boolean) => {
      const { calls, ctx } = recorder();
      const canvas = { getContext: () => ctx, width: 0, height: 0 } as unknown as HTMLCanvasElement;
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
        recorder().ctx as unknown as null,
      );
      renderStickerSheet(canvas, ids, cutLine);
      return calls.filter((call) => call.name === "strokeRect");
    };
    expect(lines(false)).toHaveLength(0);
    const cuts = lines(true);
    expect(cuts).toHaveLength(3);
    expect(cuts[0].args.slice(2)).toEqual([STICKER_CELL, STICKER_CELL]);
  });
});
