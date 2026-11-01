import { describe, expect, it } from "vitest";
import {
  billAmount,
  billSummary,
  settleBill,
  shareBill,
} from "../src/features/supplier-orders/lib/bill";
import {
  formFigures,
  startingSizes,
  type SupplierOrderForm,
} from "../src/features/supplier-orders/lib/order-form";
import {
  newProductColumns,
  newProductProblems,
  newProductSizes,
  usualSizes,
  withSize,
} from "../src/features/supplier-orders/lib/new-product";

/** A new collection: 10 abayas (price 40) and 5 kaftans (price 60), costs not typed yet. */
const order = (over: Partial<SupplierOrderForm> = {}): SupplierOrderForm => ({
  vendorId: "tailor",
  expectedAt: "",
  notes: "",
  products: [
    {
      key: "abaya",
      productId: "p-abaya",
      unitCost: "",
      sizes: { s: { quantity: "4", received: 0 }, m: { quantity: "6", received: 0 } },
    },
    {
      key: "kaftan",
      productId: "p-kaftan",
      unitCost: "",
      sizes: { one: { quantity: "5", received: 0 } },
    },
  ],
  costs: [],
  ...over,
});
const prices: Record<string, number> = { "p-abaya": 40, "p-kaftan": 60 };
const priceOf = (id: string) => prices[id] ?? 0;
const costs = (form: SupplierOrderForm) => form.products.map((p) => p.unitCost);

describe("the supplier's bill", () => {
  it("is a number above zero, to the fils", () => {
    expect(billAmount("1200")).toBe(1200);
    expect(billAmount(" 99.9995 ")).toBe(100);
    expect(billAmount("")).toBeNull();
    expect(billAmount("0")).toBeNull();
    expect(billAmount("abc")).toBeNull();
  });

  it("shared equally gives every piece the same cost, and the order adds up to the bill", () => {
    const shared = shareBill(order(), 900, "equal", priceOf, false)!;
    expect(costs(shared)).toEqual(["60", "60"]);
    expect(shared.costs).toEqual([]);
    expect(formFigures(shared).total).toBe(900);
  });

  it("shared by selling price costs a dearer piece more", () => {
    // 10 x 40 + 5 x 60 = 700 of prices; 1,050 over them: 1.5 times each price.
    const shared = shareBill(order(), 1050, "price", priceOf, false)!;
    expect(costs(shared)).toEqual(["60", "90"]);
    expect(billSummary(shared, 1050).difference).toBe(0);
  });

  it("puts what rounding leaves on the rest of the bill, so nothing is lost", () => {
    const shared = shareBill(order(), 1000, "equal", priceOf, true)!;
    // 1,000 over 15 pieces: 66.666 each, 0.010 left over.
    expect(costs(shared)).toEqual(["66.666", "66.666"]);
    expect(shared.costs).toMatchObject([
      { description: "باقي فاتورة المورد", amount: "0.01", rest: true },
    ]);
    expect(formFigures(shared).total).toBe(1000);
  });

  it("shares the bill less the order's other costs, and keeps a cost that has arrived", () => {
    const form = order({
      costs: [{ key: "fabric", description: "Fabric", amount: "150" }],
    });
    form.products[1] = { ...form.products[1], unitCost: "50" };
    form.products[1].sizes.one = { quantity: "5", received: 2 };
    const shared = shareBill(form, 1150, "equal", priceOf, false)!;
    // 1,150 - 150 fabric - 250 kaftans already received at 50 = 750 over 10 abayas.
    expect(costs(shared)).toEqual(["75", "50"]);
    expect(formFigures(shared).total).toBe(1150);
  });

  it("is not shared with no piece to share it over, or less than the other costs", () => {
    expect(shareBill(order({ products: [] }), 500, "equal", priceOf, false)).toBeNull();
    const fabric = order({ costs: [{ key: "f", description: "Fabric", amount: "600" }] });
    expect(shareBill(fabric, 500, "equal", priceOf, false)).toBeNull();
  });

  it("checks typed costs against the bill and settles the difference as the rest of it", () => {
    const typed = order();
    typed.products = typed.products.map((p) => ({ ...p, unitCost: "50" }));
    expect(billSummary(typed, 800)).toMatchObject({ pieces: 750, total: 750, difference: 50 });
    const settled = settleBill(typed, 800, false)!;
    expect(settled.costs).toMatchObject([
      { description: "Rest of the supplier's bill", amount: "50" },
    ]);
    expect(billSummary(settled, 800).difference).toBe(0);
    // The bill changes: the same line moves, no second one.
    expect(settleBill(settled, 820, false)!.costs).toMatchObject([{ amount: "70" }]);
    // Costs typed above the bill are not settled: they are to be checked.
    expect(settleBill(typed, 700, false)).toBeNull();
    expect(billSummary(typed, 700).difference).toBe(-50);
  });
});

describe("a new product from the order", () => {
  it("offers the sizes the store sells most, in the store's order, never the placeholder", () => {
    const sizes = usualSizes([
      { size: "52" },
      { size: "54" },
      { size: "Standard" },
      { size: "56" },
      { size: "54" },
      { size: null },
      { size: "52" },
    ]);
    expect(sizes).toEqual(["52", "54", "56"]);
    expect(withSize(["52"], " 58 ")).toEqual(["52", "58"]);
    expect(withSize(["XL"], "xl")).toEqual(["XL"]);
    expect(withSize(["52"], "قياسي")).toEqual(["52"]);
  });

  it("needs a name in either language; a price is optional", () => {
    expect(newProductProblems({ nameAr: "", nameEn: " ", sizes: [], price: "" })).toEqual(["name"]);
    expect(newProductProblems({ nameAr: "عباية", nameEn: "", sizes: [], price: "-1" })).toEqual([
      "price",
    ]);
    expect(newProductProblems({ nameAr: "", nameEn: "Kaftan", sizes: [], price: "" })).toEqual([]);
  });

  it("is hidden from the store, sold from stock, and has no stock until it is received", () => {
    const form = { nameAr: "عباية الربيع", nameEn: "", sizes: ["52", "54"], price: "45.5" };
    expect(newProductColumns(form)).toEqual({
      name: "عباية الربيع",
      name_ar: "عباية الربيع",
      name_en: null,
      base_price: 45.5,
      is_active: false,
      is_made_to_order: false,
      item_kind: "product",
    });
    const sizes = newProductSizes(form);
    expect(sizes.map((s) => [s.size, s.selling_price, s.stock_main, s.cost_price])).toEqual([
      ["52", 45.5, 0, 0],
      ["54", 45.5, 0, 0],
    ]);
    // No size chosen: the default variant every product with no options has, with no size.
    expect(newProductSizes({ ...form, sizes: [] }).map((s) => s.size)).toEqual([null]);
  });
});

describe("a product joining the order", () => {
  it("starts at one piece of each size, the least it can be ordered at", () => {
    expect(startingSizes(["s", "m"])).toEqual({
      s: { quantity: "1", received: 0 },
      m: { quantity: "1", received: 0 },
    });
  });
});
