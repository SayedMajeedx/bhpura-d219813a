import { describe, expect, it } from "vitest";
import { variantSpecs } from "../src/lib/order-variant-specs";
import { blankOrderItem } from "../src/features/orders/lib/order-editor";
import { orderItemRow } from "../src/features/orders/lib/order-save";

// A whole product_variants row, as the admin product search used to store it.
const variantRow = {
  id: "v1",
  product_id: "p1",
  size: "52",
  color: "Black",
  fabric: null,
  sku: "AB-52",
  barcode: "2901234567890",
  cost_price: 12.5,
  selling_price: 30,
  stock_main: 7,
  stock_incubator: 2,
};

describe("variantSpecs", () => {
  it("keeps only size, colour and fabric", () => {
    expect(variantSpecs(variantRow)).toEqual({ size: "52", color: "Black", fabric: null });
  });

  it("returns null for anything that is not an object", () => {
    expect(variantSpecs(null)).toBeNull();
    expect(variantSpecs(undefined)).toBeNull();
    expect(variantSpecs("52")).toBeNull();
    expect(variantSpecs([variantRow])).toBeNull();
  });

  it("keeps the empty specs of a manual line", () => {
    expect(variantSpecs({ size: "", color: "", fabric: "" })).toEqual({
      size: "",
      color: "",
      fabric: "",
    });
  });
});

describe("saving order lines", () => {
  it("never writes cost, stock or codes into selected_variant", () => {
    const row = orderItemRow(
      { ...blankOrderItem(), selected_variant: variantRow as never },
      { user_id: "u1", brand_id: "b1", order_id: "o1" },
    );
    expect(row.selected_variant).toEqual({ size: "52", color: "Black", fabric: null });
    expect(JSON.stringify(row)).not.toContain("cost_price");
    expect(JSON.stringify(row)).not.toContain("stock_main");
  });
});
