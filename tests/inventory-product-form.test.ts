import { describe, expect, it } from "vitest";
import {
  cleanPassportCustomFields,
  defaultVariantValues,
  hasExtraAxisLabels,
  primaryImageUrl,
  productColumnsFrom,
  productFormFrom,
  validateProductForm,
} from "../src/features/inventory/lib/product-form";
import { isDefaultVariant } from "../src/lib/default-variant";
import type { CustomField, Product } from "../src/features/inventory/types";

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
      // An unknown cost is empty, not 0 (the field once showed "0" for every product with none).
      cost_price: "",
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
      cost_price: "",
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

  it("builds the default variant with no option and the opening stock", () => {
    // No word in its size and not the product's fabric: either made it read as an option.
    expect(defaultVariantValues(form)).toMatchObject({
      size: null,
      color: null,
      fabric: null,
      selling_price: 30,
      cost_price: 0,
      stock_main: 4,
      stock: 4,
      // No picture of its own: a variant with none shows the product's. A copy of the
      // product's picture is a second pointer to a file that can be replaced.
      image_url: null,
    });
    expect(defaultVariantValues({ ...form, initial_stock: "-3" })).toMatchObject({
      size: null,
      stock_main: 0,
    });
    expect(isDefaultVariant(defaultVariantValues(form))).toBe(true);
  });
});

describe("cleanPassportCustomFields", () => {
  const field = (key: string, label_en: string): CustomField => ({
    key,
    label_ar: null,
    label_en,
    type: "number",
  });

  it("drops hand-made measurement fields once the product asks for Fit Passport ones", () => {
    const fields = [
      field("passport_abaya_length", "Length"),
      field("length", "Length"),
      field("chest_cm", "Chest"),
      field("engraving", "Engraving text"),
    ];
    expect(cleanPassportCustomFields(fields).map((f) => f.key)).toEqual([
      "passport_abaya_length",
      "engraving",
    ]);
  });

  it("keeps every field on a product without Fit Passport fields", () => {
    const fields = [field("length", "Length"), field("engraving", "Engraving text")];
    expect(cleanPassportCustomFields(fields)).toEqual(fields);
    expect(
      productColumnsFrom(productFormFrom(product({ custom_fields: fields } as Partial<Product>)))
        .custom_fields,
    ).toEqual(fields);
  });
});

describe("hasExtraAxisLabels", () => {
  it("opens option axes four and five when the product names them", () => {
    expect(hasExtraAxisLabels(null)).toBe(false);
    expect(hasExtraAxisLabels(product({ variant_label_five_en: "Engraving" }))).toBe(true);
  });
});
