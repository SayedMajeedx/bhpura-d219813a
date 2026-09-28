import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ease,
  frameCount,
  mix,
  presence,
  progress,
  stagger,
} from "../src/features/content-studio/engine/timeline";
import {
  fitText,
  textDirection,
  wrapText,
} from "../src/features/content-studio/engine/text-layout";
import { coverCrop, withAlpha } from "../src/features/content-studio/engine/draw";
import type {
  BrandKit,
  SceneData,
  StudioTemplate,
} from "../src/features/content-studio/engine/scene";
import { drawBrandMark, logoColor } from "../src/features/content-studio/engine/brand-mark";

// The content studio's animation engine: timing, text layout, image framing
// and the exporters (the video encoder is mocked; jsdom has no canvas).

const encoder = vi.hoisted(() => ({
  added: [] as Array<[number, number | undefined]>,
  finalize: vi.fn(async () => undefined),
  cancel: vi.fn(async () => undefined),
  videoTrack: vi.fn(),
  codecConfig: undefined as unknown,
}));
vi.mock("mediabunny", () => {
  class BufferTarget {
    buffer: ArrayBuffer | null = new ArrayBuffer(8);
  }
  class Mp4OutputFormat {
    constructor(public options: unknown) {}
  }
  class CanvasSource {
    constructor(_canvas: unknown, config: unknown) {
      encoder.codecConfig = config;
    }
    add = vi.fn(async (t: number, d?: number) => {
      encoder.added.push([t, d]);
    });
  }
  class Output {
    constructor(public options: unknown) {}
    addVideoTrack = encoder.videoTrack;
    start = vi.fn(async () => undefined);
    finalize = encoder.finalize;
    cancel = encoder.cancel;
  }
  return { BufferTarget, Mp4OutputFormat, CanvasSource, Output, canEncodeVideo: async () => true };
});

const { exportTemplateMp4, exportTemplatePng, canExportMp4 } =
  await import("../src/features/content-studio/engine/export");

beforeEach(() => {
  encoder.added = [];
  vi.clearAllMocks();
});

describe("timeline", () => {
  it("eases from 0 to 1 and clamps outside the move", () => {
    for (const curve of Object.values(ease)) {
      expect(curve(0)).toBeCloseTo(0, 5);
      expect(curve(1)).toBeCloseTo(1, 5);
    }
    expect(progress(-1, 0, 1)).toBe(0);
    expect(progress(0.5, 0, 1)).toBe(0.5);
    expect(progress(3, 0, 1)).toBe(1);
    expect(progress(1, 1, 0)).toBe(1);
    expect(mix(10, 20, 0.25)).toBe(12.5);
  });

  it("brings a layer in, holds it, and takes it out before the end", () => {
    const layer = { start: 1, end: 6 };
    expect(presence(0.5, layer)).toBe(0);
    expect(presence(1.4, layer)).toBeGreaterThan(0.9);
    expect(presence(3, layer)).toBe(1);
    expect(presence(5.95, layer)).toBeLessThan(0.5);
    expect(presence(6, layer)).toBe(0);
  });

  it("staggers items and counts frames", () => {
    expect(stagger(1, 0)).toBe(1);
    expect(stagger(1, 3)).toBeCloseTo(1.3);
    expect(frameCount(7, 30)).toBe(210);
    expect(frameCount(0, 30)).toBe(1);
  });
});

describe("text layout", () => {
  // One unit per character: easy to reason about.
  const measure = (text: string) => text.length;

  it("wraps at spaces and keeps line breaks", () => {
    expect(wrapText("Run your boutique beautifully", 18, measure)).toEqual([
      "Run your boutique",
      "beautifully",
    ]);
    expect(wrapText("One\nTwo three", 20, measure)).toEqual(["One", "Two three"]);
  });

  it("never splits a word, so Arabic keeps its joined script", () => {
    expect(wrapText("عباية مطرزة يدوياً", 6, measure)).toEqual(["عباية", "مطرزة", "يدوياً"]);
    expect(wrapText("Extraordinarily", 5, measure)).toEqual(["Extraordinarily"]);
  });

  it("finds the largest size that fits the lines allowed", () => {
    // At size s each character is s/10 wide.
    const measureAt = (size: number) => (text: string) => (text.length * size) / 10;
    const fit = fitText(
      "The Noor abaya",
      { maxWidth: 100, maxLines: 2, min: 20, max: 120 },
      measureAt,
    );
    expect(fit.lines.length).toBeLessThanOrEqual(2);
    expect(fit.size).toBe(120);
    expect(fit.lines).toEqual(["The Noor", "abaya"]);
    const oneLine = fitText(
      "The Noor abaya",
      { maxWidth: 100, maxLines: 1, min: 20, max: 120 },
      measureAt,
    );
    expect(oneLine).toEqual({ size: 70, lines: ["The Noor abaya"] });
    const tooLong = fitText(
      "a b c d e f",
      { maxWidth: 5, maxLines: 1, min: 40, max: 50 },
      measureAt,
    );
    expect(tooLong.size).toBe(40);
  });

  it("reads the direction from the text", () => {
    expect(textDirection("The Noor")).toBe("ltr");
    expect(textDirection("عباية نور")).toBe("rtl");
  });
});

describe("coverCrop", () => {
  it("crops a wide photo to fill a tall frame, centred", () => {
    const crop = coverCrop(2000, 1000, { x: 0, y: 0, w: 1080, h: 1920 });
    expect(crop.h).toBe(1000);
    expect(crop.w).toBeCloseTo(562.5);
    expect(crop.x).toBeCloseTo((2000 - 562.5) / 2);
  });

  it("zooms around the focus point without leaving the photo", () => {
    const crop = coverCrop(
      1000,
      1000,
      { x: 0, y: 0, w: 500, h: 500 },
      { zoom: 2, focusX: 1, focusY: 0 },
    );
    expect(crop).toEqual({ x: 500, y: 0, w: 500, h: 500 });
  });
});

describe("the exporters", () => {
  const scene: SceneData = {
    width: 1080,
    height: 1920,
    format: "story",
    lang: "en",
    brand: {
      name: "Pura",
      logo: null,
      handle: "@pura.bh",
      contact: null,
      palette: { ground: "#2a0707", ink: "#fbf1ec", accent: "#c9a27a", muted: "#b9a7a2" },
    },
    productName: "Noor",
    headline: "The Noor abaya",
    body: "",
    price: "42.000 BHD",
    originalPrice: null,
    media: null,
  };
  const render = vi.fn();
  const template: StudioTemplate = {
    id: "test",
    name: { en: "Test", ar: "تجربة" },
    goal: { en: "Launch", ar: "إطلاق" },
    duration: 0.2,
    render,
  };
  const fakeCanvas = () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({}) as CanvasRenderingContext2D,
      toBlob: (done: (blob: Blob) => void) => done(new Blob(["png"], { type: "image/png" })),
    };
    return () => canvas as unknown as HTMLCanvasElement;
  };

  it("draws and encodes every frame at its exact time, then finishes the file", async () => {
    const progressSeen: number[] = [];
    const blob = await exportTemplateMp4({
      template,
      scene,
      fps: 30,
      onProgress: (p) => progressSeen.push(p),
      createCanvas: fakeCanvas(),
    });
    expect(render).toHaveBeenCalledTimes(6);
    expect(render.mock.calls.map((call) => call[1])).toEqual([
      0,
      1 / 30,
      2 / 30,
      3 / 30,
      4 / 30,
      5 / 30,
    ]);
    expect(encoder.added.map(([t]) => t)).toEqual([0, 1 / 30, 2 / 30, 3 / 30, 4 / 30, 5 / 30]);
    expect(encoder.added.every(([, d]) => d === 1 / 30)).toBe(true);
    expect(encoder.codecConfig).toMatchObject({ codec: "avc", bitrate: 8_000_000 });
    expect(encoder.videoTrack).toHaveBeenCalledWith(expect.anything(), { frameRate: 30 });
    expect(encoder.finalize).toHaveBeenCalledTimes(1);
    expect(progressSeen.at(-1)).toBe(1);
    expect(blob.type).toBe("video/mp4");
  });

  it("draws the product video's own frame at each time", async () => {
    const frame = { width: 1080, height: 1920 } as unknown as HTMLCanvasElement;
    const frameAt = vi.fn(async () => frame);
    await exportTemplateMp4({ template, scene, fps: 10, frameAt, createCanvas: fakeCanvas() });
    expect(frameAt.mock.calls.map((call) => call[0])).toEqual([0, 0.1]);
    expect(render.mock.calls.every((call) => call[2].media === frame)).toBe(true);
  });

  it("stops and discards the file when the export is cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      exportTemplateMp4({ template, scene, signal: controller.signal, createCanvas: fakeCanvas() }),
    ).rejects.toThrow("Export cancelled");
    expect(encoder.cancel).toHaveBeenCalledTimes(1);
    expect(encoder.finalize).not.toHaveBeenCalled();
  });

  it("renders a still at the chosen time", async () => {
    const blob = await exportTemplatePng({ template, scene, t: 0.1, createCanvas: fakeCanvas() });
    expect(render).toHaveBeenCalledWith(expect.anything(), 0.1, scene);
    expect(blob.type).toBe("image/png");
  });

  it("reports whether the browser can encode H.264", async () => {
    expect(await canExportMp4(1080, 1920)).toBe(true);
  });
});

describe("withAlpha", () => {
  it("turns a palette hex into a translucent rgba, and leaves other colours alone", () => {
    expect(withAlpha("#330a0a", 0.5)).toBe("rgba(51, 10, 10, 0.5)");
    expect(withAlpha("#fff", 0)).toBe("rgba(255, 255, 255, 0)");
    expect(withAlpha("rgba(0,0,0,0.4)", 1)).toBe("rgba(0,0,0,0.4)");
  });
});

describe("the brand mark", () => {
  const brand = (overrides: Partial<BrandKit> = {}): BrandKit => ({
    name: "Pura",
    logo: null,
    logoScale: 1,
    logoTint: "original",
    handle: null,
    contact: null,
    palette: { ground: "#2a0707", ink: "#fbf1ec", accent: "#c9a27a", muted: "#b9a7a2" },
    ...overrides,
  });
  const fakeCtx = () => {
    const calls: Array<[string, unknown[]]> = [];
    const ctx = new Proxy(
      {},
      {
        get: (_target, prop: string) =>
          prop === "measureText"
            ? () => ({ width: 120 })
            : (...args: unknown[]) => calls.push([prop, args]),
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D;
    return { ctx, calls };
  };

  it("colours the mark to suit the template unless told otherwise", () => {
    expect(logoColor("auto", { onPhoto: true, ink: "#330a0a" })).toBe("#ffffff");
    expect(logoColor("auto", { onPhoto: false, ink: "#330a0a" })).toBe("#330a0a");
    expect(logoColor("original", { onPhoto: true, ink: "#330a0a" })).toBeNull();
    expect(logoColor("white", { onPhoto: false, ink: "#330a0a" })).toBe("#ffffff");
    expect(logoColor("black", { onPhoto: true, ink: "#330a0a" })).toBe("#111111");
  });

  it("draws the logo at the merchant's size, keeping its proportions", () => {
    const logo = { width: 400, height: 100 } as unknown as HTMLCanvasElement;
    const { ctx, calls } = fakeCtx();
    const width = drawBrandMark(ctx, brand({ logo, logoScale: 1.5 }), {
      x: 80,
      y: 200,
      u: 1,
      align: "left",
      onPhoto: false,
      ink: "#fbf1ec",
    });
    const draw = calls.find(([name]) => name === "drawImage");
    // 48 px tall at size 1, so 72 px at 150%; 4:1 logo → 288 px wide.
    expect(draw?.[1].slice(1)).toEqual([80, 164, 288, 72]);
    expect(width).toBe(288);
  });

  it("writes the store name when there is no logo", () => {
    const { ctx, calls } = fakeCtx();
    drawBrandMark(ctx, brand(), {
      x: 1000,
      y: 200,
      u: 1,
      align: "right",
      onPhoto: false,
      ink: "#fbf1ec",
    });
    expect(calls.find(([name]) => name === "fillText")?.[1]).toEqual(["Pura", 1000, 200]);
  });
});
