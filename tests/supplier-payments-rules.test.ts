import { describe, expect, it } from "vitest";
import {
  lateOrderMessage,
  paymentProblem,
  supplierBalances,
  supplierDashboardLine,
} from "../src/features/supplier-orders/lib/payments";
import { paymentOf, type SupplierOrder } from "../src/features/supplier-orders/lib/order-state";
import {
  productAttentionReasons,
  productMissingCost,
} from "../src/features/inventory/lib/attention";

const TODAY = "2026-10-19";

const order = (over: Partial<SupplierOrder> = {}): SupplierOrder => ({
  id: "po1",
  po_number: "PO-0001",
  status: "ordered",
  vendor_id: "umm-ali",
  vendor_name: "Umm Ali",
  vendor_phone: "39950016",
  total_amount: 200,
  paid_amount: 50,
  expected_at: "2026-10-15",
  received_at: null,
  created_at: "2026-10-01T08:00:00Z",
  notes: null,
  items: [
    {
      id: "l1",
      variant_id: "v-s",
      product_id: "p",
      description: "",
      quantity: 10,
      received_quantity: 4,
      unit_cost: 20,
      line_total: 200,
      sort_order: 0,
    },
  ],
  ...over,
});

describe("a payment the database would take", () => {
  it("is above zero, to the fils, up to what is owed, on a day that has come", () => {
    const base = { paidOn: TODAY, owed: 150, today: TODAY };
    expect(paymentProblem({ ...base, amount: "150" })).toBeNull();
    expect(paymentProblem({ ...base, amount: "0.125" })).toBeNull();
    expect(paymentProblem({ ...base, amount: "" })).toBe("amount");
    expect(paymentProblem({ ...base, amount: "0" })).toBe("amount");
    expect(paymentProblem({ ...base, amount: "150.001" })).toBe("amount");
    expect(paymentProblem({ ...base, amount: "1.0005" })).toBe("amount");
    expect(paymentProblem({ ...base, amount: "abc" })).toBe("amount");
    expect(paymentProblem({ ...base, amount: "10", paidOn: "2026-10-20" })).toBe("date");
    expect(paymentProblem({ ...base, amount: "10", paidOn: "" })).toBe("date");
  });

  it("says what was paid beyond the order's value", () => {
    expect(paymentOf(order({ status: "cancelled", paid_amount: 40 }))).toMatchObject({
      total: 0,
      owed: 0,
      credit: 40,
    });
  });
});

describe("what is owed to each supplier", () => {
  it("adds up each supplier's orders, most owed first, drafts left out", () => {
    const balances = supplierBalances(
      [
        order(),
        order({ id: "po2", expected_at: "2026-11-01", total_amount: 60, paid_amount: 0 }),
        order({
          id: "po3",
          vendor_id: "silk",
          vendor_name: "Silk house",
          vendor_phone: null,
          status: "received",
          total_amount: 500,
          paid_amount: 200,
        }),
        order({ id: "po4", vendor_id: "draft-only", status: "draft" }),
        order({
          id: "po5",
          vendor_id: "settled",
          status: "received",
          total_amount: 80,
          paid_amount: 80,
        }),
      ],
      TODAY,
    );
    expect(balances).toEqual([
      {
        vendorId: "silk",
        name: "Silk house",
        phone: null,
        owed: 300,
        openOrders: 0,
        lateOrders: 0,
      },
      {
        vendorId: "umm-ali",
        name: "Umm Ali",
        phone: "39950016",
        owed: 210,
        openOrders: 2,
        lateOrders: 1,
      },
    ]);
  });
});

describe("a late order", () => {
  it("is asked about in the reader's language, with what is still to come", () => {
    expect(lateOrderMessage(order(), "Pura Line", "en")).toBe(
      "Hello Umm Ali,\nAbout Pura Line's order PO-0001 (6 pieces to come), due on 15/10/2026.\nWhen can we expect it? Thank you.",
    );
    expect(lateOrderMessage(order(), "بيورا", "ar")).toBe(
      "السلام عليكم Umm Ali،\nبخصوص طلبية بيورا رقم PO-0001 (باقي 6 قطع)، وكان موعد التسليم 15/10/2026.\nمتى نتوقع وصولها؟ شكراً لك.",
    );
  });

  it("puts one line on the dashboard with what is late and what is owed, or none", () => {
    expect(supplierDashboardLine([order()], TODAY)).toEqual({ late: 1, owed: 150 });
    expect(
      supplierDashboardLine([order({ paid_amount: 200, expected_at: "2026-12-01" })], TODAY),
    ).toBeNull();
    expect(supplierDashboardLine([order({ status: "draft" })], TODAY)).toBeNull();
  });
});

describe("a product with no cost", () => {
  it("has a size with no cost while the product has none either", () => {
    expect(productMissingCost({ cost_price: 0 }, [{ cost_price: 12 }, { cost_price: 0 }])).toBe(
      true,
    );
    // A size with no cost of its own costs what its product costs.
    expect(productMissingCost({ cost_price: 10 }, [{ cost_price: 0 }])).toBe(false);
    expect(productMissingCost({ cost_price: 0 }, [])).toBe(true);
    expect(productMissingCost({ cost_price: 0, item_kind: "service" }, [{ cost_price: 0 }])).toBe(
      false,
    );
    expect(productMissingCost({ cost_price: 0, is_package: true }, [])).toBe(false);
  });

  it("needs attention only when the reader may see costs (the list passes it then)", () => {
    const product = {
      is_made_to_order: false,
      item_kind: "product",
      image_url: "x.jpg",
      category: "Abayas",
      is_active: true,
    };
    expect(
      productAttentionReasons(product, { stock: 40, lowestPrice: 30, missingCost: true }).map(
        (r) => r.key,
      ),
    ).toEqual(["missing_cost"]);
    expect(productAttentionReasons(product, { stock: 40, lowestPrice: 30 })).toEqual([]);
  });
});
