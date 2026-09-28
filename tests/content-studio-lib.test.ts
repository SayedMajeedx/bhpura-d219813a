import { afterEach, describe, expect, it, vi } from "vitest";
import {
  containsArabic,
  extractSnappySnippet,
  firstImage,
  instagramHandle,
  type Product,
} from "../src/features/content-studio/lib/studio-content";
import { getExactVideoDuration } from "../src/features/content-studio/lib/video-duration";
import { studioSale } from "../src/features/content-studio/lib/sale-price";

// The content studio's pure helpers, moved out of the route in the split.

const product = (overrides: Partial<Product>): Product => ({
  id: "p1",
  name: "Silk Abaya",
  name_ar: null,
  name_en: null,
  description: null,
  description_ar: null,
  image_url: null,
  media: [],
  base_price: 42,
  ...overrides,
});

describe("firstImage", () => {
  it("prefers the main image, else the first gallery picture that is not a video", () => {
    expect(firstImage(product({ image_url: "main.jpg" }))).toBe("main.jpg");
    expect(firstImage(product({ media: ["clip.mp4", { url: "back.webp" }, "side.jpg"] }))).toBe(
      "back.webp",
    );
    expect(firstImage(product({ media: [{ url: "clip.MOV?v=2" }] }))).toBeNull();
    expect(firstImage(undefined)).toBeNull();
  });
});

describe("instagramHandle", () => {
  it("turns the store's Instagram link into a handle", () => {
    expect(
      instagramHandle([{ name: "Instagram", url: "https://www.instagram.com/pura.bh/" }]),
    ).toBe("@pura.bh");
    expect(instagramHandle([{ name: "IG", url: "https://instagram.com/@pura" }])).toBe("@pura");
    expect(instagramHandle([{ name: "TikTok", url: "https://tiktok.com/@pura" }])).toBeNull();
    expect(instagramHandle(null)).toBeNull();
  });
});

describe("containsArabic", () => {
  it("detects Arabic letters in mixed text", () => {
    expect(containsArabic("The Pura Edit")).toBe(false);
    expect(containsArabic("إصدار Pura")).toBe(true);
  });
});

describe("extractSnappySnippet", () => {
  const fallback = "Quiet elegance.";

  it("uses the first line when it is a readable length", () => {
    expect(extractSnappySnippet("Flowing silk crepe.\nHand-finished cuffs.", fallback)).toBe(
      "Flowing silk crepe.",
    );
  });

  it("falls back to the first sentence, then trims long text at a word", () => {
    expect(
      extractSnappySnippet("Short. A much longer second sentence follows here.", fallback),
    ).toBe("Short. A much longer second sentence follows here.");
    const long = "word ".repeat(40).trim();
    const snippet = extractSnappySnippet(long, fallback);
    expect(snippet.endsWith("...")).toBe(true);
    expect(snippet.length).toBeLessThanOrEqual(108);
    expect(snippet.slice(0, -3).endsWith(" ")).toBe(false);
  });

  it("uses the fallback when there is no description", () => {
    expect(extractSnappySnippet(null, fallback)).toBe(fallback);
    expect(extractSnappySnippet("", fallback)).toBe(fallback);
  });
});

describe("getExactVideoDuration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** An MP4 header with an `mvhd` atom (version 0): timescale and duration. */
  function mp4Header(timescale: number, duration: number) {
    const bytes = new Uint8Array(96);
    bytes.set([0x6d, 0x76, 0x68, 0x64], 8); // "mvhd" at offset 8
    const view = new DataView(bytes.buffer, 8);
    view.setUint8(4, 0); // version 0
    view.setUint32(16, timescale);
    view.setUint32(20, duration);
    return bytes;
  }

  it("uses the element's own duration when it is known", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const video = { duration: 7.2 } as HTMLVideoElement;
    expect(await getExactVideoDuration(video, "https://cdn/clip.mp4")).toBe(7.2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reads the length from the file's mvhd atom when the element does not know it", async () => {
    vi.stubGlobal("fetch", async () => new Response(mp4Header(1000, 12_500)));
    const video = { duration: Number.NaN } as HTMLVideoElement;
    expect(await getExactVideoDuration(video, "https://cdn/clip.mp4")).toBe(12.5);
  });

  it("returns 0 when the file has no mvhd atom or cannot be read", async () => {
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array(64)));
    const video = { duration: Infinity } as HTMLVideoElement;
    expect(await getExactVideoDuration(video, "https://cdn/clip.mp4")).toBe(0);
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    expect(await getExactVideoDuration(video, "https://cdn/clip.mp4")).toBe(0);
  });
});

describe("studioSale", () => {
  const variant = (selling_price: number | null, original_price: number | null) => ({
    selling_price,
    original_price,
  });

  it("uses the chosen variant's own sale", () => {
    expect(studioSale([], variant(31.5, 42))).toEqual({ original: 42, price: 31.5, percent: 25 });
    expect(studioSale([], variant(42, null))).toBeNull();
    expect(studioSale([], variant(42, 42))).toBeNull();
  });

  it("without a chosen variant, shows a sale only when every variant shares it", () => {
    expect(studioSale([variant(30, 40), variant(30, 40)], null)).toEqual({
      original: 40,
      price: 30,
      percent: 25,
    });
    expect(studioSale([variant(30, 40), variant(35, 40)], null)).toBeNull();
    expect(studioSale([variant(30, 40), variant(40, null)], null)).toBeNull();
    expect(studioSale([], null)).toBeNull();
  });

  it("rounds the saving and never shows 0%", () => {
    expect(studioSale([], variant(39, 42))?.percent).toBe(7);
    expect(studioSale([], variant(41.9, 42))?.percent).toBe(1);
  });
});
