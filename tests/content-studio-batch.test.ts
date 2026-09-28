import { describe, expect, it } from "vitest";
import {
  BATCH_MAX,
  BATCH_TEMPLATES,
  batchSceneFields,
  formatAmount,
  productCopy,
  toggleBatchPick,
} from "../src/features/content-studio/lib/batch";
import type { Product } from "../src/features/content-studio/lib/studio-content";

// Batch export: one template run across several products, each scene built
// from the product the way the studio builds it when that product is picked.

const abaya: Product = {
  id: "p1",
  name: "Silk Abaya",
  name_ar: "عباية حرير",
  name_en: null,
  description: "Flowing silk crepe for evenings.",
  description_ar: null,
  image_url: "https://cdn.example/p1.jpg",
  media: [],
  base_price: 42,
  fabric_type: " Silk crepe ",
  occasion: "Evening",
};
const photo = { width: 900, height: 1200 } as unknown as HTMLCanvasElement;
const fields = (overrides: Partial<Parameters<typeof batchSceneFields>[0]> = {}) =>
  batchSceneFields({
    product: abaya,
    lang: "en",
    showPrice: true,
    currencySymbol: "BHD",
    sale: null,
    run: null,
    media: photo,
    stopMedia: [],
    ...overrides,
  });

describe("batch export", () => {
  it("runs the templates built around one product", () => {
    expect(BATCH_TEMPLATES).toEqual([
      "atelier-reveal",
      "editorial-cover",
      "price-drop",
      "swatch-run",
      "detail-zoom",
    ]);
  });

  it("fills each product's copy the way the studio does when it is picked", () => {
    expect(productCopy(abaya, "en")).toMatchObject({ name: "Silk Abaya", headline: "Silk Abaya" });
    expect(productCopy(abaya, "ar").name).toBe("عباية حرير");
    expect(productCopy(abaya, "en").body).toContain("Flowing silk crepe");
  });

  it("prices the product, with its sale when every variant shares one", () => {
    expect(formatAmount(42)).toBe("42.000");
    expect(fields()).toMatchObject({
      productName: "Silk Abaya",
      price: "42.000 BHD",
      originalPrice: null,
      discountPercent: null,
      media: photo,
    });
    expect(fields({ sale: { price: 30, original: 42, percent: 29 } })).toMatchObject({
      price: "30.000 BHD",
      priceAmount: "30.000",
      originalPrice: "42.000 BHD",
      discountPercent: 29,
    });
    expect(fields({ showPrice: false })).toMatchObject({ price: null, priceAmount: null });
  });

  it("gives Swatch Run each option's photo (or the product's) and Detail Zoom its fabric", () => {
    const own = { width: 1, height: 1 } as unknown as HTMLCanvasElement;
    const scene = fields({
      run: {
        axisLabel: "Colour",
        swatch: true,
        stops: [
          { value: "Black", label: "Black", color: "#111111", imageUrl: "b.jpg" },
          { value: "Sand", label: "Sand", color: "#c2b280", imageUrl: null },
        ],
      },
      stopMedia: [own, null],
    });
    expect(scene.options?.stops.map((stop) => stop.media)).toEqual([own, photo]);
    expect(scene.detail).toMatchObject({ label: "Silk crepe", note: "Evening" });
    expect(fields().options).toBeNull();
  });

  it("picks and unpicks products, up to the most one batch takes", () => {
    expect(toggleBatchPick(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleBatchPick(["a", "b"], "a")).toEqual(["b"]);
    const full = Array.from({ length: BATCH_MAX }, (_, i) => `p${i}`);
    expect(toggleBatchPick(full, "new")).toBe(full);
  });
});
