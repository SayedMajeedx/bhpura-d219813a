import { describe, expect, it } from "vitest";
import {
  cartTargetVariant,
  productCartLine,
  productSelectionError,
} from "../src/features/product-page/lib/cart-line";
import { withOfferedAxes } from "../src/features/product-page/lib/variant-options";
import { productMediaList } from "../src/features/product-page/lib/product-media";
import type { CustomField } from "../src/features/product-page/types";
import type { StorefrontProductDetail, StorefrontVariant } from "../src/lib/data/storefront";

type LineInput = Parameters<typeof productCartLine>[0];
type ErrorInput = Parameters<typeof productSelectionError>[0];

const t = (_ar: string, en: string) => en;

const variant = (overrides: Partial<StorefrontVariant> = {}): StorefrontVariant =>
  ({
    id: "v52",
    size: "52",
    size_unit: null,
    color: "Black",
    fabric: null,
    option_four: null,
    option_five: null,
    image_url: null,
    selling_price: 30,
    stock_main: 2,
    stock_incubator: 0,
    ...overrides,
  }) as StorefrontVariant;

const engraving: CustomField = {
  key: "engraving",
  label_ar: "نقش",
  label_en: "Engraving",
  type: "text",
  required: true,
};

const errorInput = (overrides: Partial<ErrorInput> = {}): ErrorInput => ({
  showSizeModeToggle: false,
  sizeMode: "ready",
  hasVariants: true,
  variant: variant(),
  hasMeasurementFields: false,
  measurementsApplied: false,
  visibleCustomFields: [],
  cfValues: {},
  hasCustomFields: false,
  uniqueSizes: ["52"],
  isTailoringActive: false,
  cfLabel: (f) => f.label_en ?? f.key,
  t,
  ...overrides,
});

describe("productSelectionError", () => {
  it("accepts an in-stock choice", () => {
    expect(productSelectionError(errorInput())).toBeNull();
  });

  it("asks for an option, then refuses one out of stock", () => {
    expect(productSelectionError(errorInput({ variant: null }))).toBe(
      "Please select a size or option first",
    );
    expect(productSelectionError(errorInput({ variant: variant({ stock_main: 0 }) }))).toBe(
      "This option is out of stock",
    );
  });

  it("does not need an option when the product is custom-only", () => {
    expect(
      productSelectionError(errorInput({ variant: null, hasCustomFields: true, uniqueSizes: [] })),
    ).toBeNull();
  });

  it("needs required fields filled", () => {
    const input = errorInput({ visibleCustomFields: [engraving] });
    expect(productSelectionError(input)).toBe("Required field: Engraving");
    expect(productSelectionError({ ...input, cfValues: { engraving: "  " } })).toBe(
      "Required field: Engraving",
    );
    expect(productSelectionError({ ...input, cfValues: { engraving: "AB" } })).toBeNull();
  });

  it("with the ready/custom toggle, checks the chosen mode only", () => {
    const toggle = errorInput({
      showSizeModeToggle: true,
      hasMeasurementFields: true,
      visibleCustomFields: [engraving],
    });
    expect(productSelectionError({ ...toggle, variant: null })).toBe(
      "Please select a ready size first",
    );
    expect(productSelectionError({ ...toggle, variant: variant({ stock_main: 0 }) })).toBe(
      "This size is out of stock",
    );
    // Ready mode ignores measurements and custom fields.
    expect(productSelectionError(toggle)).toBeNull();

    const custom = { ...toggle, sizeMode: "custom" as const, variant: null };
    expect(productSelectionError(custom)).toBe(
      "Please apply the required measurements to continue",
    );
    expect(productSelectionError({ ...custom, measurementsApplied: true })).toBe(
      "Required field: Engraving",
    );
  });
});

describe("cartTargetVariant", () => {
  const variants = [variant({ id: "navy", color: "Navy" }), variant({ id: "black" })];

  it("adds the chosen variant for ready items", () => {
    expect(
      cartTargetVariant({
        isTailoringActive: false,
        variant: null,
        matchingVariants: variants,
        variants,
        selectedColor: null,
      }),
    ).toBeNull();
  });

  it("falls back to the closest variant for made-to-order items", () => {
    const base = { isTailoringActive: true, variant: null, variants, selectedColor: "Black" };
    expect(cartTargetVariant({ ...base, matchingVariants: [variants[0]] })?.id).toBe("navy");
    expect(cartTargetVariant({ ...base, matchingVariants: [] })?.id).toBe("black");
    expect(
      cartTargetVariant({ ...base, matchingVariants: [], variants: [], selectedColor: null }),
    ).toBeNull();
  });
});

const product = {
  id: "p1",
  name_ar: "عباية",
  name_en: "Abaya",
  image_url: "https://cdn/cover.jpg",
} as StorefrontProductDetail;

const lineInput = (overrides: Partial<LineInput> = {}): LineInput => ({
  showSizeModeToggle: false,
  sizeMode: "ready",
  visibleCustomFields: [],
  cfValues: {},
  measurementsApplied: false,
  isMeasurementField: () => false,
  lang: "en",
  applicableAddons: [],
  selectedAddonIds: [],
  currency: "BHD",
  t,
  tailoringNotes: "",
  vocabulary: {} as LineInput["vocabulary"],
  targetVariant: variant(),
  isTailoringActive: false,
  product,
  displayName: "Abaya",
  media: [],
  displayPrice: 30,
  originalPriceWithAddons: 0,
  selectedColor: null,
  selectedFabric: null,
  selectedOptionFour: null,
  selectedOptionFive: null,
  qty: 2,
  ...overrides,
});

describe("productCartLine", () => {
  it("builds a ready-size line capped at the variant's stock", () => {
    const line = productCartLine(lineInput());
    expect(line).toMatchObject({
      variant_id: "v52",
      product_id: "p1",
      name: "Abaya",
      image: "https://cdn/cover.jpg",
      price: 30,
      original_price: null,
      size: "52",
      color: "Black",
      qty: 2,
      max_stock: 2,
      custom_fields: [],
    });
  });

  it("keeps the struck-through price only when it is higher", () => {
    expect(productCartLine(lineInput({ originalPriceWithAddons: 40 })).original_price).toBe(40);
    expect(productCartLine(lineInput({ originalPriceWithAddons: 30 })).original_price).toBeNull();
  });

  it("records filled fields, price additions and tailoring notes", () => {
    const line = productCartLine(
      lineInput({
        visibleCustomFields: [engraving, { ...engraving, key: "empty", required: false }],
        cfValues: { engraving: " Gold + 5 BHD " },
        tailoringNotes: " shorter sleeves ",
      }),
    );
    expect(line.custom_fields).toEqual([
      {
        key: "engraving",
        label_ar: "نقش",
        label_en: "Engraving",
        value: "Gold + 5 BHD",
        type: "text",
        price_delta: 5,
      },
      expect.objectContaining({ key: "tailoring_notes", value: "shorter sleeves" }),
    ]);
    expect(line.selected_customizations.custom_text).toBe("shorter sleeves");
    expect(line.selected_customizations.options[0]).toEqual({
      name: "Engraving",
      value: "Gold + 5 BHD",
      price_delta: 5,
    });
  });

  it("drops custom fields when the ready size is chosen", () => {
    const line = productCartLine(
      lineInput({
        showSizeModeToggle: true,
        visibleCustomFields: [engraving],
        cfValues: { engraving: "AB" },
      }),
    );
    expect(line.custom_fields).toEqual([]);
  });

  it("labels custom sizing and lifts the stock cap for made-to-order", () => {
    const line = productCartLine(
      lineInput({
        showSizeModeToggle: true,
        sizeMode: "custom",
        isTailoringActive: true,
        targetVariant: variant({ stock_main: 0 }),
      }),
    );
    expect(line.size).toBe("Custom Sizing");
    expect(line.max_stock).toBe(999);
  });
});

describe("withOfferedAxes", () => {
  const hidden = { visible: false, label: "x" };
  const base = { size: hidden, color: hidden, fabric: hidden, four: hidden, five: hidden };

  it("shows an axis the product offers values for", () => {
    const axes = withOfferedAxes(
      { ...base, fabric: { visible: true, label: "Fabric" } },
      { size: ["52"], color: [], fabric: [], four: [], five: ["Gift box"] },
    );
    expect(axes.size).toEqual({ visible: true, label: "x" });
    expect(axes.color.visible).toBe(false);
    expect(axes.fabric).toEqual({ visible: true, label: "Fabric" });
    expect(axes.four.visible).toBe(false);
    expect(axes.five.visible).toBe(true);
  });
});

describe("productMediaList", () => {
  it("puts the variant image, then the cover, before the product media", () => {
    const list = productMediaList(
      {
        image_url: "cover.jpg",
        media: [{ type: "video", url: "clip.mp4" }],
      } as Pick<StorefrontProductDetail, "media" | "image_url">,
      "variant.jpg",
    );
    expect(list.map((m) => m.url)).toEqual(["variant.jpg", "cover.jpg", "clip.mp4"]);
  });

  it("does not repeat an image already in the media", () => {
    const list = productMediaList(
      {
        image_url: "cover.jpg",
        media: [{ type: "image", url: "cover.jpg" }],
      } as Pick<StorefrontProductDetail, "media" | "image_url">,
      "cover.jpg",
    );
    expect(list.map((m) => m.url)).toEqual(["cover.jpg"]);
  });

  it("is empty before the product loads", () => {
    expect(productMediaList(null, "variant.jpg")).toEqual([]);
  });
});
