import { describe, expect, it } from "vitest";
import {
  defaultVariantValues,
  hasExtraAxisLabels,
  primaryImageUrl,
  productColumnsFrom,
  productFormFrom,
  validateProductForm,
} from "../src/features/inventory/lib/product-form";
import { PLACEHOLDER_SIZE_VALUES } from "../src/lib/variant-sku-utils";
import type { Product } from "../src/features/inventory/types";

const product = (overrides: Partial<Product> = {}): Product =>
  ({
    id: "p1",
    name: "Legacy",
    name_ar: null,
    name_en: null,
    description: "Old description",
    description_ar: null,
    description_en: null,
    category: "abayas",
    image_url: null,
    is_active: false,
    featured_trending: true,
    show_sale_badge: false,
    media: [],
    custom_fields: null,
    base_price: 25,
    cost_price: 0,
    ...overrides,
  }) as Product;

describe("productFormFrom", () => {
  it("starts a new product active with a sale badge and zero prices", () => {
    expect(productFormFrom(null)).toMatchObject({
      name_en: "",
      base_price: "0",
      cost_price: "0",
      is_active: true,
      show_sale_badge: true,
      custom_fields: [],
      is_made_to_order: false,
    });
  });

  it("falls back to the legacy name and description in English", () => {
    expect(productFormFrom(product())).toMatchObject({
      name_en: "Legacy",
      description_en: "Old description",
      base_price: "25",
      cost_price: "0",
      is_active: false,
      show_sale_badge: false,
    });
  });
});

describe("validateProductForm", () => {
  const form = { ...productFormFrom(null), name_ar: "عباية", base_price: "10" };

  it("accepts a name in either language and a price", () => {
    expect(validateProductForm(form, false)).toEqual({});
  });

  it("reports a missing name, a bad price and a negative cost", () => {
    const errors = validateProductForm(
      { ...form, name_ar: " ", base_price: "-1", cost_price: "-2" },
      false,
    );
    expect(Object.keys(errors).sort()).toEqual(["cost", "name", "price"]);
    expect(validateProductForm({ ...form, cost_price: "" }, false)).toEqual({});
  });
});

describe("saving", () => {
  const form = {
    ...productFormFrom(null),
    name_ar: " عباية ",
    base_price: "30",
    cost_price: "",
    fabric_type: " Silk ",
    initial_stock: "4",
    size_guide_id: "g1",
    image_url: "https://x/legacy.jpg",
  };

  it("uses the first gallery image, else the legacy image", () => {
    expect(primaryImageUrl(form)).toBe("https://x/legacy.jpg");
    expect(
      primaryImageUrl({
        ...form,
        media: [
          { type: "video", url: "https://x/v.mp4" },
          { type: "image", url: "https://x/a.jpg" },
        ],
      }),
    ).toBe("https://x/a.jpg");
  });

  it("builds the product columns with trimmed values and legacy name", () => {
    expect(productColumnsFrom(form)).toMatchObject({
      name: "عباية",
      name_ar: "عباية",
      name_en: null,
      base_price: 30,
      cost_price: 0,
      fabric_type: "Silk",
      size_guide_id: "g1",
      is_made_to_order: false,
    });
    expect(productColumnsFrom({ ...form, size_guide_hidden: true }).size_guide_id).toBeNull();
  });

  it("builds the default variant with placeholder size and opening stock", () => {
    expect(defaultVariantValues(form, true)).toMatchObject({
      size: PLACEHOLDER_SIZE_VALUES[0],
      fabric: "Silk",
      selling_price: 30,
      cost_price: 0,
      stock_main: 4,
      stock: 4,
      image_url: "https://x/legacy.jpg",
    });
    expect(defaultVariantValues({ ...form, initial_stock: "-3" }, false)).toMatchObject({
      size: PLACEHOLDER_SIZE_VALUES[1],
      stock_main: 0,
    });
  });
});

describe("hasExtraAxisLabels", () => {
  it("opens option axes four and five when the product names them", () => {
    expect(hasExtraAxisLabels(null)).toBe(false);
    expect(hasExtraAxisLabels(product({ variant_label_five_en: "Engraving" }))).toBe(true);
  });
});
