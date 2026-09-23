import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  describeVariantAxes,
  formatAxisValue,
  isColorSwatchAxis,
  pickVariantForAxis,
  storeAxisDefaults,
} from "../src/lib/variant-axes";
import type { BrandAddonRow } from "../src/lib/addons/addon-types";

const installed = (addon_id: string) => ({ addon_id, status: "installed" }) as BrandAddonRow;

// The Qoffee product from the bug report: roast/grind in `color`, weight in `size`.
const coffeeVariants = [
  { id: "v1", color: "medium", size: "250", size_unit: "g", fabric: "washed" },
];

describe("variant axes", () => {
  it("never treats a coffee roast as a colour", () => {
    const defaults = storeAxisDefaults([installed("coffee-roastery")], "coffee");
    const axes = describeVariantAxes({
      variants: coffeeVariants,
      addonDefaults: defaults,
      lang: "ar",
    });

    const color = axes.find((a) => a.key === "color")!;
    expect(color.label).toBe("درجة التحميص");
    expect(color.swatch).toBe(false);

    const size = axes.find((a) => a.key === "size")!;
    expect(size.label).toBe("الوزن / الحجم");
    expect(formatAxisValue(size, "250", "ar", coffeeVariants)).toBe("250 غرام");

    // The third column (process) is shown too, under its coffee label.
    expect(axes.find((a) => a.key === "fabric")?.label).toBe("المعالجة");
  });

  it("keeps real colour swatches for fashion stores", () => {
    const defaults = storeAxisDefaults([], "fashion");
    const axes = describeVariantAxes({
      variants: [
        { color: "أسود", size: "M" },
        { color: "Beige", size: "L" },
      ],
      addonDefaults: defaults,
      lang: "en",
    });
    expect(axes.find((a) => a.key === "color")?.swatch).toBe(true);
    expect(axes.find((a) => a.key === "size")?.swatch).toBe(false);
  });

  it("needs both a colour label and a paintable value to draw swatches", () => {
    expect(isColorSwatchAxis("اللون", ["medium"])).toBe(false);
    expect(isColorSwatchAxis("Roast Level", ["Black"])).toBe(false);
    expect(isColorSwatchAxis("Colour", ["Navy", "Custom print"])).toBe(true);
  });

  it("honours a per-product label override", () => {
    const axes = describeVariantAxes({
      product: { variant_label_color_ar: "نوع الطحنة" },
      variants: coffeeVariants,
      addonDefaults: storeAxisDefaults([installed("coffee-roastery")], "coffee"),
      lang: "ar",
    });
    expect(axes.find((a) => a.key === "color")?.label).toBe("نوع الطحنة");
  });

  it("keeps other choices when switching one option, and falls back when impossible", () => {
    const variants = [
      { id: "a", color: "Black", size: "S" },
      { id: "b", color: "Black", size: "M" },
      { id: "c", color: "White", size: "M" },
    ];
    expect(pickVariantForAxis(variants, variants[1], "color", "White")?.id).toBe("c");
    expect(pickVariantForAxis(variants, variants[0], "color", "White")?.id).toBe("c");
    expect(pickVariantForAxis(variants, variants[2], "size", "S")?.id).toBe("a");
  });
});

describe("storefront surfaces use the axis system", () => {
  const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "..", file), "utf-8");

  it("quick view has no hard-coded Color/Size labels", () => {
    const code = read("src/components/storefront/QuickViewModal.tsx");
    expect(code).toContain("useVariantAxes(");
    expect(code).not.toContain('t("اللون", "Color")');
    expect(code).not.toContain('t("المقاس", "Size")');
  });

  it("category filters and colour dots resolve the store's labels", () => {
    expect(read("src/components/storefront/CategoryFilters.tsx")).toContain("isColorSwatchAxis(");
    expect(read("src/components/storefront/ColorDots.tsx")).toContain("isColorSwatchAxis(");
    expect(read("src/routes/$slug.product.$id.tsx")).toContain("isColorSwatchAxis(");
  });
});
