import { describe, expect, it } from "vitest";
import {
  defaultVariantLabel,
  isDefaultSize,
  isDefaultVariant,
  realSize,
  sizeWorthNaming,
} from "../src/lib/default-variant";
import { displayVariantParts } from "../src/lib/variant-sku-utils";
import { offeredSizes } from "../src/features/product-page/lib/variant-options";
import { optionLabel } from "../src/features/leads/lib/leads";
import { cartLines } from "../src/features/outreach/lib/outreach";
import { pieceName } from "../src/features/incubators/lib/partner-stock";
import { transferRows } from "../src/features/incubators/lib/batch-transfer";
import { newVariantDraft } from "../src/features/inventory/lib/variant-draft";
import {
  keepOneVariantMessage,
  leavesAVariant,
  variantDeleteError,
} from "../src/features/inventory/lib/variant-delete";
import type { StorefrontVariant } from "../src/lib/data/storefront";
import type { Product, Variant } from "../src/features/inventory/types";

/**
 * A product with no options is sold as its default variant: no option value at all. Before
 * 2026-11 the editor wrote "قياسي" or "Standard" into its size; those rows, and the orders that
 * keep them in their snapshot, read the same way everywhere (src/lib/default-variant.ts).
 */

describe("the default variant's size", () => {
  it("names nothing when it is empty or the word the editor once wrote", () => {
    for (const size of [null, undefined, "", "  ", "قياسي", " قياسي ", "Standard", "standard"]) {
      expect(isDefaultSize(size)).toBe(true);
      expect(realSize(size)).toBeNull();
    }
  });

  it("keeps a real size, trimmed", () => {
    expect(realSize(" 52 ")).toBe("52");
    expect(realSize("M")).toBe("M");
    expect(realSize("Free Size")).toBe("Free Size");
    expect(realSize("One size")).toBe("One size");
  });

  it("names to a customer only a size that tells them something", () => {
    expect(sizeWorthNaming("54")).toBe("54");
    expect(sizeWorthNaming("قياسي")).toBeNull();
    expect(sizeWorthNaming("One size")).toBeNull();
    expect(sizeWorthNaming("مقاس واحد")).toBeNull();
  });
});

describe("isDefaultVariant", () => {
  it("is a variant with no option value, its size aside", () => {
    expect(isDefaultVariant({})).toBe(true);
    expect(isDefaultVariant({ size: null, color: null, fabric: "" })).toBe(true);
    expect(isDefaultVariant({ size: "قياسي" })).toBe(true);
    expect(isDefaultVariant({ size: "Standard" })).toBe(true);
  });

  it("is not a variant with any option", () => {
    expect(isDefaultVariant({ size: "قياسي", color: "أسود" })).toBe(false);
    expect(isDefaultVariant({ size: "Standard", fabric: "حرير" })).toBe(false);
    expect(isDefaultVariant({ option_four: "Gift box" })).toBe(false);
    expect(isDefaultVariant({ size: "52" })).toBe(false);
    expect(isDefaultVariant(null)).toBe(false);
    expect(isDefaultVariant(undefined)).toBe(false);
  });

  it("reads as no options to staff, in their language", () => {
    expect(defaultVariantLabel("ar")).toBe("بدون خيارات");
    expect(defaultVariantLabel("en")).toBe("No options");
  });
});

describe("displayVariantParts", () => {
  it("leaves the default size out and keeps the other options", () => {
    expect(displayVariantParts({ size: "قياسي" })).toEqual([]);
    expect(displayVariantParts({ size: "Standard" })).toEqual([]);
    expect(displayVariantParts({ size: "قياسي", color: "كحلي", fabric: "كتان" })).toEqual([
      "كحلي",
      "كتان",
    ]);
    expect(displayVariantParts({ size: "56", color: "أسود", fabric: "حرير" })).toEqual([
      "56",
      "أسود",
      "حرير",
    ]);
  });

  it("writes a size with its unit", () => {
    expect(
      displayVariantParts({ size: "250", size_unit: "g", color: "medium", fabric: "washed" }, "ar"),
    ).toEqual(["250 غرام", "وسط", "washed"]);
    expect(
      displayVariantParts({ size: "250", size_unit: "g", color: "medium", fabric: "washed" }, "en"),
    ).toEqual(["250g", "medium", "washed"]);
  });
});

const storefrontVariant = (id: string, size: string | null, color: string | null = null) =>
  ({ id, size, color, stock_main: 1, stock_incubator: 0 }) as unknown as StorefrontVariant;

describe("the product page's sizes", () => {
  it("never offers the default size beside the real ones", () => {
    // A product saved first, then given its sizes, kept its "قياسي" beside them.
    expect(
      offeredSizes([
        storefrontVariant("std", "قياسي"),
        storefrontVariant("a", "52"),
        storefrontVariant("b", "54"),
      ]),
    ).toEqual(["52", "54"]);
    expect(offeredSizes([storefrontVariant("std", null), storefrontVariant("a", "M")])).toEqual([
      "M",
    ]);
  });

  it("offers no size for a product sold in colours only", () => {
    expect(
      offeredSizes([
        storefrontVariant("a", "قياسي", "Black"),
        storefrontVariant("b", "قياسي", "White"),
      ]),
    ).toEqual([]);
    expect(offeredSizes([storefrontVariant("std", "Standard")])).toEqual([]);
  });
});

describe("words for staff and customers", () => {
  it("never names the default size in a waiting-list or cart message", () => {
    const waited = { id: "v", product_id: "p", size: "قياسي", color: "بني" };
    expect(optionLabel(waited)).toBe("بني");
    expect(optionLabel({ ...waited, size: "Standard", color: null })).toBe("");
    expect(optionLabel({ ...waited, size: "54", color: null })).toBe("54");
    expect(
      cartLines([
        { name: "عباية", size: "قياسي" },
        { name: "Dress", size: "M" },
      ]),
    ).toEqual([
      { name: "عباية", size: null, quantity: 1 },
      { name: "Dress", size: "M", quantity: 1 },
    ]);
  });

  it("names a partner's piece by its product, never 'قياسي'", () => {
    const variant = { size: "قياسي", color: null, products: { name: "Abaya", name_ar: "عباية" } };
    expect(pieceName(variant, "ar")).toBe("عباية");
    expect(pieceName({ ...variant, size: "54", color: "Black" }, "en")).toBe("Abaya · 54 / Black");
  });

  it("labels a transfer's default variant as having no options", () => {
    const variants = [
      {
        id: "v1",
        product_id: "p",
        size: "قياسي",
        stock_main: 3,
        stock_incubator: 0,
        selling_price: 9,
      },
      {
        id: "v2",
        product_id: "p",
        size: null,
        stock_main: 1,
        stock_incubator: 0,
        selling_price: 9,
      },
      {
        id: "v3",
        product_id: "p",
        size: "54",
        stock_main: 1,
        stock_incubator: 0,
        selling_price: 9,
      },
    ];
    const rows = transferRows(variants, [{ id: "p", name: "Abaya" }], false, false);
    expect(rows.map((row) => [row.variantLabel, row.size])).toEqual([
      ["No options", ""],
      ["No options", ""],
      ["54", "54"],
    ]);
  });
});

describe("a new variant row in the editor", () => {
  const product = { id: "p", base_price: 30, cost_price: 0 } as unknown as Product;
  const variant = (size: string | null) =>
    ({ id: size ?? "blank", size, size_unit: null, selling_price: 30 }) as unknown as Variant;

  it("starts from a size the product sells, never the default's", () => {
    expect(newVariantDraft(product, [variant("قياسي"), variant("54")]).size).toBe("54");
    expect(newVariantDraft(product, [variant("قياسي")]).size).toBe("");
    expect(newVariantDraft(product, [], variant("Standard")).size).toBe("");
  });
});

describe("deleting a variant", () => {
  it("never takes a product's last one", () => {
    const abaya = { item_kind: "product" };
    expect(leavesAVariant(abaya, 1)).toBe(false);
    expect(leavesAVariant(abaya, 3, 3)).toBe(false);
    expect(leavesAVariant(abaya, 3, 2)).toBe(true);
    expect(leavesAVariant(abaya, 2)).toBe(true);
    // A service's lengths are one set its editor saves whole.
    expect(leavesAVariant({ item_kind: "service" }, 1)).toBe(true);
  });

  it("says why in the reader's language, for the database's refusal too", () => {
    expect(keepOneVariantMessage(false)).toMatch(/keeps at least one variant/);
    expect(keepOneVariantMessage(true)).toMatch(/خيار واحد على الأقل/);
    expect(variantDeleteError({ message: "PRODUCT_NEEDS_A_VARIANT" }, false)).toBe(
      keepOneVariantMessage(false),
    );
    expect(variantDeleteError(new Error("network down"), true)).toBe("network down");
  });
});
