import { beforeEach, describe, expect, it, vi } from "vitest";

// A size or colour a product does not have, added from a supplier's order: what is asked for is
// matched against the product (a size it has is ordered, an archived one comes back, only the rest
// are made), and the inventory's one rule for a product sold with no options holds on both screens.

const data = vi.hoisted(() => ({
  createVariants: vi.fn(async (_brand: string, rows: unknown[]) => rows.map((_, i) => `new-${i}`)),
  updateVariant: vi.fn(async () => undefined),
  removeVariants: vi.fn(async () => ({ deleted: 1, archived: 0 })),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("../src/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/data/catalog", () => data);
vi.mock("../src/lib/data/catalog", () => data);

const { newSizePrice, orderFirstSizes, planNewSizes, sharedOptions, wantedSizes, newSizeRow } =
  await import("../src/features/supplier-orders/lib/new-sizes");
const { searchProducts, sizesLine } = await import("../src/features/supplier-orders/lib/catalog");
const { addSizesToProduct } = await import("../src/features/inventory/lib/add-sizes");

const variant = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  product_id: "p1",
  sku: null,
  size: null,
  color: null,
  fabric: null,
  option_four: null,
  option_five: null,
  stock_main: 0,
  stock_incubator: 0,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("what is asked for", () => {
  it("is every size in every colour, each once, a list left empty not being an option", () => {
    expect(wantedSizes(["L", " l ", "XL"], [])).toEqual([
      { size: "L", color: null },
      { size: "XL", color: null },
    ]);
    expect(wantedSizes(["L"], ["Black", "Navy"])).toEqual([
      { size: "L", color: "Black" },
      { size: "L", color: "Navy" },
    ]);
    expect(wantedSizes([], ["Navy"])).toEqual([{ size: null, color: "Navy" }]);
    expect(wantedSizes([], [])).toEqual([]);
  });

  it("is a size the product has, one archived to bring back, or a new one", () => {
    const inUse = [
      variant("m", { size: "M", fabric: "Crepe" }),
      variant("s", { size: "S", fabric: "Crepe" }),
    ];
    const archived = [variant("xl", { size: "XL", fabric: "Crepe" })];
    expect(sharedOptions(inUse)).toEqual({ fabric: "Crepe", option_four: null, option_five: null });
    const plan = planNewSizes(wantedSizes(["m", "XL", "L"], []), inUse, archived);
    expect(plan.map((p) => [p.choice.size, p.kind, "variantId" in p ? p.variantId : null])).toEqual(
      [
        ["m", "has", "m"],
        ["XL", "restore", "xl"],
        ["L", "new", null],
      ],
    );
    // The new one is in crepe too, at the price the sizes share, with no stock.
    const price = newSizePrice(
      [
        { selling_price: 30, original_price: null },
        { selling_price: 30, original_price: null },
      ],
      25,
    );
    expect(newSizeRow({ size: "L", color: null }, inUse, price)).toMatchObject({
      size: "L",
      fabric: "Crepe",
      selling_price: 30,
      original_price: null,
      stock_main: 0,
      sku: null,
      barcode: null,
    });
    // Sizes at different prices: the product's own price.
    expect(newSizePrice([{ selling_price: 30 }, { selling_price: 35 }], 25)).toEqual({
      selling_price: 25,
      original_price: null,
    });
  });
});

describe("a product sold so far with no options", () => {
  it("keeps the inventory's rule, and a default this order names becomes a size too", () => {
    const empty = [variant("d")];
    expect(orderFirstSizes(empty, () => false)).toEqual({ kind: "replace", defaultId: "d" });
    expect(orderFirstSizes(empty, (id) => id === "d")).toEqual({
      kind: "become",
      defaultId: "d",
      pieces: 0,
    });
    expect(orderFirstSizes([variant("d", { stock_main: 3 })], () => false)).toEqual({
      kind: "become",
      defaultId: "d",
      pieces: 3,
    });
    expect(orderFirstSizes([variant("m", { size: "M" })], () => true)).toEqual({ kind: "add" });
  });
});

describe("adding sizes, on either screen", () => {
  const row = (size: string) => ({
    size,
    size_unit: null,
    color: null,
    fabric: null,
    option_four: null,
    option_five: null,
    sku: null,
    barcode: null,
    selling_price: 20,
    original_price: null,
    product_id: "p1",
  });

  it("makes them, and answers their ids in order", async () => {
    const out = await addSizesToProduct({
      brandId: "b1",
      first: { kind: "add" },
      sizes: [row("S"), row("M")],
      becomeAt: -1,
    });
    expect(out).toEqual({ ids: ["new-0", "new-1"], leftover: false });
    expect(data.removeVariants).not.toHaveBeenCalled();
  });

  it("turns the default into the chosen size, keeping its id", async () => {
    const out = await addSizesToProduct({
      brandId: "b1",
      first: { kind: "become", defaultId: "d", pieces: 4 },
      sizes: [row("S"), row("M"), row("L")],
      becomeAt: 1,
    });
    expect(out.ids).toEqual(["new-0", "d", "new-1"]);
    expect(data.updateVariant).toHaveBeenCalledWith(
      "b1",
      "d",
      expect.objectContaining({ size: "M" }),
    );
    expect(data.updateVariant.mock.calls[0]).not.toContainEqual(
      expect.objectContaining({ stock_main: expect.anything() }),
    );
  });

  it("removes an empty default only after the sizes are in, and says when it could not", async () => {
    data.removeVariants.mockRejectedValueOnce(new Error("VARIANT_HAS_STOCK"));
    const out = await addSizesToProduct({
      brandId: "b1",
      first: { kind: "replace", defaultId: "d" },
      sizes: [row("S")],
      becomeAt: -1,
    });
    expect(out).toEqual({ ids: ["new-0"], leftover: true });
    expect(data.createVariants.mock.invocationCallOrder[0]).toBeLessThan(
      data.removeVariants.mock.invocationCallOrder[0],
    );
  });
});

describe("the product picker", () => {
  const sizes = new Map([
    [
      "p1",
      [
        variant("a", { size: "S" }),
        variant("b", { size: "M" }),
        variant("c", { size: "L", color: "Navy" }),
      ],
    ],
  ]);
  const products = [
    { id: "p1", name: "Abaya", name_ar: null, name_en: null, image_url: null },
    { id: "p2", name: "Scarf", name_ar: null, name_en: null, image_url: null },
  ];

  it("names each product's sizes, so what is missing shows before picking", () => {
    expect(sizesLine(sizes.get("p1")!, "en")).toBe("S · M · L / Navy");
    expect(sizesLine(sizes.get("p1")!, "en", 2)).toBe("S · M +1 more");
    expect(sizesLine([variant("d")], "en")).toBe("No options");
  });

  it("finds a product by a size's name or colour", () => {
    expect(searchProducts(products, sizes, "navy").map((p) => p.id)).toEqual(["p1"]);
    expect(searchProducts(products, sizes, "scarf").map((p) => p.id)).toEqual(["p2"]);
  });
});
