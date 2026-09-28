import { describe, expect, it, vi } from "vitest";
import {
  fromPrice,
  LOOKBOOK_MAX,
  lookbookEntries,
  lookbookProducts,
  toggleLookbookPick,
} from "../src/features/content-studio/lib/lookbook";
import type { Product } from "../src/features/content-studio/lib/studio-content";
import { lookbookCarousel } from "../src/features/content-studio/templates/lookbook-carousel";
import { exportTemplateCarousel } from "../src/features/content-studio/engine/export";
import type { SceneData, StudioTemplate } from "../src/features/content-studio/engine/scene";
import { crc32, zipStore } from "../src/lib/zip-store";
import { deliverCreativeFiles } from "../src/lib/creative-export";

// The Lookbook template: which products it carries, how it draws them, and
// its Instagram carousel export (one PNG per product, shared or zipped).

const product = (id: string, extra: Partial<Product> = {}): Product => ({
  id,
  name: `Product ${id}`,
  name_ar: `منتج ${id}`,
  name_en: null,
  description: null,
  description_ar: null,
  image_url: `https://cdn.example/${id}.jpg`,
  media: null,
  base_price: 20,
  ...extra,
});

describe("the lookbook's products", () => {
  const products = [
    product("a"),
    product("b", { image_url: null }),
    product("c"),
    product("d"),
    product("e"),
    product("f"),
  ];

  it("starts with the chosen product, then the next ones with a photo", () => {
    const ids = lookbookProducts(products, [], "c").map((p) => p.id);
    expect(ids).toEqual(["c", "a", "d", "e"]);
    // A product without a photo can still lead when it is the chosen one.
    expect(lookbookProducts(products, [], "b")[0].id).toBe("b");
  });

  it("keeps the merchant's picks in their order, skipping removed products", () => {
    const ids = lookbookProducts(products, ["e", "gone", "a"], "c").map((p) => p.id);
    expect(ids).toEqual(["e", "a"]);
  });

  it("adds at the end and removes, between two and five products", () => {
    expect(toggleLookbookPick(["a", "c"], "d")).toEqual(["a", "c", "d"]);
    expect(toggleLookbookPick(["a", "c", "d"], "c")).toEqual(["a", "d"]);
    const two = ["a", "c"];
    expect(toggleLookbookPick(two, "a")).toBe(two);
    const five = ["a", "c", "d", "e", "f"];
    expect(five).toHaveLength(LOOKBOOK_MAX);
    expect(toggleLookbookPick(five, "b")).toBe(five);
  });

  it("prices each product from its cheapest variant, or its base price", () => {
    const variants = [
      { product_id: "a", selling_price: 35 },
      { product_id: "a", selling_price: 28 },
      { product_id: "a", selling_price: null },
      { product_id: "c", selling_price: 0 },
    ];
    expect(fromPrice(products[0], variants)).toBe(28);
    expect(fromPrice(products[2], variants)).toBe(20);
    expect(fromPrice(product("z", { base_price: null }), [])).toBeNull();
  });

  it("names each product in the studio's language", () => {
    const [en] = lookbookEntries([product("a", { name_en: "Noor" })], [], "en");
    expect(en).toEqual({
      id: "a",
      name: "Noor",
      price: 20,
      imageUrl: "https://cdn.example/a.jpg",
    });
    expect(lookbookEntries([product("a")], [], "ar")[0].name).toBe("منتج a");
  });
});

/** A canvas context that records what is drawn and measures 10 px per character. */
function recordingContext() {
  const texts: string[] = [];
  const images: unknown[] = [];
  const ctx = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === "fillText") return (text: string) => texts.push(text);
        if (key === "drawImage") return (image: unknown) => images.push(image);
        if (key === "measureText") return (text: string) => ({ width: text.length * 10 });
        if (key === "getTransform") return () => ({ a: 1, b: 0 });
        return () => undefined;
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, texts, images };
}

const photo = (name: string) =>
  ({ width: 900, height: 1200, name }) as unknown as HTMLCanvasElement;

const scene = (overrides: Partial<SceneData> = {}): SceneData => ({
  width: 1080,
  height: 1350,
  format: "portrait",
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
  headline: "The Pura Edit",
  body: "Softly tailored pieces.",
  price: "42.000 BHD",
  originalPrice: null,
  priceAmount: "42.000",
  originalAmount: null,
  currencyLabel: "BHD",
  issueLabel: "September 2026",
  discountPercent: null,
  media: null,
  options: null,
  collection: [
    { name: "Noor", price: "30.000 BHD", media: photo("noor") },
    { name: "Layla", price: "25.000 BHD", media: photo("layla") },
    { name: "Reem", price: null, media: photo("reem") },
  ],
  ...overrides,
});

describe("the Lookbook template", () => {
  it("settles each slide before the next glides in, all within the loop", () => {
    const times = lookbookCarousel.slideTimes!(scene());
    expect(times).toHaveLength(3);
    times.forEach((t, index) => {
      expect(t).toBeGreaterThan(index === 0 ? 0 : times[index - 1]);
      expect(t).toBeLessThan(lookbookCarousel.duration);
    });
  });

  it("shows the settled slide's name, price and number", () => {
    const [, second] = lookbookCarousel.slideTimes!(scene());
    const { ctx, texts, images } = recordingContext();
    lookbookCarousel.render(ctx, second, scene());
    expect(texts).toContain("Layla");
    expect(texts).toContain("25.000 BHD");
    expect(texts).toContain("02 / 03");
    expect(texts).toContain("THE PURA EDIT");
    expect(texts).toContain("Softly tailored pieces.");
    // Its neighbours peek in on both sides.
    expect(images.map((image) => (image as { name: string }).name)).toEqual([
      "noor",
      "layla",
      "reem",
    ]);
    expect(texts).not.toContain("Noor");
  });

  it("falls back to the chosen product alone, without numbers", () => {
    const { ctx, texts } = recordingContext();
    const single = scene({ collection: null });
    expect(lookbookCarousel.slideTimes!(single)).toHaveLength(1);
    lookbookCarousel.render(ctx, 5, single);
    expect(texts).toContain("Noor");
    expect(texts).toContain("42.000 BHD");
    expect(texts.some((text) => text.includes(" / "))).toBe(false);
  });
});

describe("the carousel export", () => {
  const fakeCanvas = () =>
    ({
      width: 0,
      height: 0,
      getContext: () => ({}) as CanvasRenderingContext2D,
      toBlob: (done: (blob: Blob) => void) => done(new Blob(["png"], { type: "image/png" })),
    }) as unknown as HTMLCanvasElement;

  it("renders one PNG per slide, at each slide's settled time", async () => {
    const render = vi.fn();
    const template: StudioTemplate = {
      id: "t",
      name: { en: "T", ar: "ت" },
      goal: { en: "T", ar: "ت" },
      duration: 6,
      render,
      slideTimes: () => [1.5, 3.5],
    };
    const slides = await exportTemplateCarousel({
      template,
      scene: scene(),
      createCanvas: fakeCanvas,
    });
    expect(slides).toHaveLength(2);
    expect(render.mock.calls.map((call) => call[1])).toEqual([1.5, 3.5]);
    expect(
      await exportTemplateCarousel({
        template: { ...template, slideTimes: undefined },
        scene: scene(),
        createCanvas: fakeCanvas,
      }),
    ).toEqual([]);
  });
});

describe("zipStore", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("packs the files, stored, with their names and a central directory", async () => {
    const zip = await zipStore(
      [
        { name: "pura-01.png", data: new Blob(["first"]) },
        { name: "لوك-02.png", data: new Blob(["second!"]) },
      ],
      new Date(2026, 8, 28, 14, 30, 10),
    );
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const text = (from: number, length: number) =>
      new TextDecoder().decode(bytes.slice(from, from + length));

    // The first local header, its name and its data.
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(8, true)).toBe(0); // stored
    const nameLength = view.getUint16(26, true);
    expect(text(30, nameLength)).toBe("pura-01.png");
    expect(text(30 + nameLength, 5)).toBe("first");
    expect(view.getUint32(14, true)).toBe(crc32(new TextEncoder().encode("first")));

    // The end record counts both files and points at the central directory.
    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const centralStart = view.getUint32(end + 16, true);
    expect(view.getUint32(centralStart, true)).toBe(0x02014b50);
    expect(centralStart + view.getUint32(end + 12, true)).toBe(end);
    // The second entry keeps its Arabic name (UTF-8 flagged).
    const second = centralStart + 46 + view.getUint16(centralStart + 28, true);
    expect(view.getUint16(second + 8, true)).toBe(0x0800);
    expect(text(second + 46, view.getUint16(second + 28, true))).toBe("لوك-02.png");
    expect(zip.type).toBe("application/zip");
  });
});

describe("deliverCreativeFiles", () => {
  const files = [
    { name: "pura-01.png", blob: new Blob(["a"]), type: "image/png" },
    { name: "pura-02.png", blob: new Blob(["b"]), type: "image/png" },
  ];

  it("shares every slide at once on a phone, and downloads a ZIP elsewhere", async () => {
    const originalMatchMedia = window.matchMedia;
    const originalWidth = window.innerWidth;
    const setDevice = (phone: boolean) => {
      window.matchMedia = ((query: string) => ({
        matches: phone && query === "(pointer: coarse)",
      })) as unknown as typeof window.matchMedia;
      Object.defineProperty(window, "innerWidth", {
        value: phone ? 390 : 1440,
        configurable: true,
      });
    };
    const share = vi.fn(async () => undefined);
    Object.assign(navigator, { share, canShare: () => true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const objectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:zip");
    try {
      setDevice(true);
      expect(await deliverCreativeFiles(files, "pura-lookbook.zip", "Edit")).toBe("shared");
      expect(share).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Edit", files: [expect.any(File), expect.any(File)] }),
      );
      share.mockRejectedValueOnce(new DOMException("closed", "AbortError"));
      expect(await deliverCreativeFiles(files, "pura-lookbook.zip", "Edit")).toBe("cancelled");
      expect(click).not.toHaveBeenCalled();

      setDevice(false);
      expect(await deliverCreativeFiles(files, "pura-lookbook.zip", "Edit")).toBe("downloaded");
      expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe("pura-lookbook.zip");
      const zip = objectUrl.mock.calls[0][0] as Blob;
      expect(zip.type).toBe("application/zip");
    } finally {
      window.matchMedia = originalMatchMedia;
      Object.defineProperty(window, "innerWidth", { value: originalWidth, configurable: true });
      Reflect.deleteProperty(navigator, "share");
      Reflect.deleteProperty(navigator, "canShare");
      click.mockRestore();
      objectUrl.mockRestore();
    }
  });
});
