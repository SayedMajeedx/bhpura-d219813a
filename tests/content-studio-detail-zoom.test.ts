import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { coverPoint, drawShade } from "../src/features/content-studio/engine/draw";
import type { SceneData } from "../src/features/content-studio/engine/scene";
import {
  DEFAULT_DETAIL_POINT,
  detailZoom,
} from "../src/features/content-studio/templates/detail-zoom";
import { useDetailZoom } from "../src/features/content-studio/hooks/use-detail-zoom";
import type { Product } from "../src/features/content-studio/lib/studio-content";

// Detail Zoom: the camera pushes into the point the merchant tapped, a
// hotspot pings there and a card names the detail.

describe("coverPoint", () => {
  const frame = { x: 0, y: 0, w: 1080, h: 1920 };

  it("maps the photo's centre to the frame's centre when nothing is zoomed", () => {
    expect(coverPoint(1200, 1600, frame, { x: 0.5, y: 0.5 })).toEqual({ x: 540, y: 960 });
  });

  it("follows a point as the camera zooms in on it", () => {
    const point = { x: 0.4, y: 0.6 };
    const zoomed = coverPoint(1200, 1600, frame, point, { zoom: 2, focusX: 0.4, focusY: 0.6 });
    // Focused on the point, it lands in the middle of the frame.
    expect(zoomed.x).toBeCloseTo(540);
    expect(zoomed.y).toBeCloseTo(960);
  });

  it("keeps a point near the edge where it is, since the camera stops at the photo's edge", () => {
    const corner = coverPoint(
      1200,
      1600,
      frame,
      { x: 0.95, y: 0.05 },
      {
        zoom: 2,
        focusX: 0.95,
        focusY: 0.05,
      },
    );
    expect(corner.x).toBeGreaterThan(900);
    expect(corner.y).toBeLessThan(200);
  });
});

describe("drawShade", () => {
  afterEach(() => vi.restoreAllMocks());

  it("paints the shading once per size and stamps it on every frame", () => {
    const painted: Array<{ width: number; height: number }> = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return realCreate(tag);
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          createLinearGradient: () => ({ addColorStop: () => undefined }),
          fillRect: () => undefined,
          fillStyle: "",
        }),
      };
      painted.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
    const stamps: unknown[] = [];
    const ctx = {
      drawImage: (image: unknown) => stamps.push(image),
    } as unknown as CanvasRenderingContext2D;
    const top = { height: 0.2, alpha: 0.3 };
    const foot = { from: 0.5, alpha: 0.6 };
    drawShade(ctx, 1080, 1920, top, foot);
    drawShade(ctx, 1080, 1920, top, foot);
    expect(painted).toEqual([{ width: 1080, height: 1920, getContext: expect.any(Function) }]);
    expect(stamps).toEqual([painted[0], painted[0]]);
    drawShade(ctx, 1080, 1350, top, foot);
    expect(painted).toHaveLength(2);
  });
});

/** A canvas context that records the text drawn and the arcs (the hotspot). */
function recordingContext() {
  const texts: string[] = [];
  const arcs: Array<[number, number, number]> = [];
  const ctx = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === "fillText") return (text: string) => texts.push(text);
        if (key === "arc") return (x: number, y: number, r: number) => arcs.push([x, y, r]);
        if (key === "measureText") return (text: string) => ({ width: text.length * 12 });
        if (key === "getTransform") return () => ({ a: 1, b: 0 });
        if (key === "createLinearGradient") return () => ({ addColorStop: () => undefined });
        return () => undefined;
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, texts, arcs };
}

const scene = (overrides: Partial<SceneData> = {}): SceneData => ({
  width: 1080,
  height: 1920,
  format: "story",
  lang: "en",
  brand: {
    name: "Pura",
    logo: null,
    logoScale: 1,
    logoTint: "auto",
    handle: "@pura.bh",
    contact: null,
    palette: { ground: "#f3ede7", ink: "#330a0a", accent: "#9c6f4c", muted: "#b9a7a2" },
  },
  productName: "Noor",
  headline: "Silk, as it should be",
  body: "A fluid cut.",
  price: "42.000 BHD",
  originalPrice: null,
  priceAmount: "42.000",
  originalAmount: null,
  currencyLabel: "BHD",
  issueLabel: "September 2026",
  discountPercent: null,
  media: { width: 1200, height: 1600 } as unknown as HTMLCanvasElement,
  options: null,
  collection: null,
  detail: { x: 0.4, y: 0.6, label: "Silk satin", note: "For evenings" },
  ...overrides,
});

describe("the Detail Zoom template", () => {
  // drawShade needs a canvas; jsdom's has no 2D context, so it simply draws nothing.
  it("opens on the headline over the whole look", () => {
    const { ctx, texts } = recordingContext();
    detailZoom.render(ctx, 0.9, scene());
    expect(texts).toContain("IN DETAIL");
    expect(texts).toContain("Silk, as it should be");
    expect(texts).not.toContain("Silk satin");
  });

  it("names the detail beside a hotspot on the tapped point, once the camera is in", () => {
    const { ctx, texts, arcs } = recordingContext();
    detailZoom.render(ctx, 4.2, scene());
    expect(texts).toEqual(expect.arrayContaining(["IN DETAIL", "Silk satin", "For evenings"]));
    // Fully in, the camera is centred on the point, so the hotspot is at the frame's centre.
    const [x, y] = arcs.at(-1)!;
    expect(x).toBeCloseTo(540);
    expect(y).toBeCloseTo(960);
  });

  it("falls back to the product's name when the detail has no label", () => {
    const { ctx, texts } = recordingContext();
    detailZoom.render(ctx, 4.2, scene({ detail: { x: 0.5, y: 0.5, label: " ", note: "" } }));
    expect(texts).toContain("Noor");
    expect(texts).not.toContain("For evenings");
  });

  it("closes on the product, its price and the body copy", () => {
    const { ctx, texts } = recordingContext();
    detailZoom.render(ctx, 7.2, scene());
    expect(texts).toEqual(expect.arrayContaining(["Noor", "42.000 BHD", "A fluid cut."]));
    expect(texts).not.toContain("Silk satin");
  });

  it("uses the default point when there is no detail", () => {
    const { ctx, arcs } = recordingContext();
    detailZoom.render(ctx, 4.2, scene({ detail: null }));
    const [x, y] = arcs.at(-1)!;
    const expected = coverPoint(
      1200,
      1600,
      { x: 0, y: 0, w: 1080, h: 1920 },
      DEFAULT_DETAIL_POINT,
      {
        zoom: 2.3,
        focusX: DEFAULT_DETAIL_POINT.x,
        focusY: DEFAULT_DETAIL_POINT.y,
      },
    );
    expect(x).toBeCloseTo(expected.x);
    expect(y).toBeCloseTo(expected.y);
  });
});

describe("useDetailZoom", () => {
  const product = (id: string, extra: Partial<Product> = {}): Product => ({
    id,
    name: id,
    name_ar: null,
    name_en: null,
    description: null,
    description_ar: null,
    image_url: null,
    media: null,
    base_price: null,
    ...extra,
  });
  const silk = product("p1", { fabric_type: " ألماس كريب ", occasion: "مناسبات" });

  it("starts from the product's fabric and occasion, at the default point", () => {
    const { result } = renderHook(() =>
      useDetailZoom({ active: true, selected: silk, mediaUrl: "a.jpg" }),
    );
    expect(result.current.detail).toEqual({
      ...DEFAULT_DETAIL_POINT,
      label: "ألماس كريب",
      note: "مناسبات",
    });
  });

  it("keeps the merchant's edits for the product and the point for the photo", () => {
    const { result, rerender } = renderHook(
      (props: { selected: Product; mediaUrl: string }) => useDetailZoom({ active: true, ...props }),
      { initialProps: { selected: silk, mediaUrl: "a.jpg" } },
    );
    act(() => {
      result.current.setDetailPoint({ x: 1.4, y: 0.25 });
      result.current.setDetailLabel("Hand beading");
    });
    expect(result.current.detail).toMatchObject({ x: 1, y: 0.25, label: "Hand beading" });

    // Another photo of the same product: the point starts over, the label stays.
    rerender({ selected: silk, mediaUrl: "b.jpg" });
    expect(result.current.detail).toMatchObject({ ...DEFAULT_DETAIL_POINT, label: "Hand beading" });

    // Another product: its own fabric.
    rerender({ selected: product("p2", { fabric_type: "Linen" }), mediaUrl: "b.jpg" });
    expect(result.current.detail).toMatchObject({ label: "Linen", note: "" });
  });

  it("gives the scene no detail on other templates", () => {
    const { result } = renderHook(() =>
      useDetailZoom({ active: false, selected: silk, mediaUrl: "a.jpg" }),
    );
    expect(result.current.detail).toBeNull();
  });
});
