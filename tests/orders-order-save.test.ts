import { describe, expect, it } from "vitest";
import { blankOrderItem, orderTotals } from "../src/features/orders/lib/order-editor";
import {
  haveOrderItemsChanged,
  orderChangeLogs,
  orderItemRow,
  orderSaveBlocker,
  orderSavePayload,
} from "../src/features/orders/lib/order-save";

const item = (overrides = {}) => ({
  ...blankOrderItem(),
  id: "i1",
  variant_id: "v1",
  description: "Abaya",
  unit_price: 30,
  line_total: 30,
  ...overrides,
});

describe("orderSaveBlocker", () => {
  it("needs a branch for pickup and an address for delivery", () => {
    expect(orderSaveBlocker({ fulfillment_method: "pickup" }, [item()], "o1", "en")).toBe(
      "Select a pickup branch",
    );
    expect(orderSaveBlocker({}, [item()], "o1", "en")).toBe("Select a delivery address");
    expect(orderSaveBlocker({ shipping_address_id: "a1" }, [item()], "o1", "en")).toBeNull();
    expect(orderSaveBlocker({ fulfillment_method: "digital" }, [item()], "o1", "en")).toBeNull();
  });
});

describe("orderSavePayload", () => {
  const totals = orderTotals([item()], { discount: 5, shipping: 2, tax_rate: 10 }, false);

  it("keeps only the chosen fulfillment method's fields", () => {
    const order = {
      fulfillment_method: "pickup",
      branch_id: "b1",
      shipping_address_id: "a1",
      digital_delivery_channel: "email",
      tax_rate: 10,
    };
    expect(orderSavePayload(order, totals, null, "BHD")).toMatchObject({
      fulfillment_method: "pickup",
      branch_id: "b1",
      shipping_address_id: null,
      digital_delivery_channel: null,
      payment_status: "unpaid",
      fulfillment_status: "ON_HOLD",
      promo_code: null,
      promo_code_id: null,
    });
  });

  it("takes money from the totals and the applied promo", () => {
    const payload = orderSavePayload(
      { shipping_address_id: "a1", tax_rate: 10 },
      totals,
      { code: "EID", id: "p1" },
      "BHD",
    );
    expect(payload).toMatchObject({
      fulfillment_method: "delivery",
      subtotal: 30,
      discount: 5,
      shipping: 2,
      promo_code: "EID",
      promo_code_id: "p1",
    });
    expect(payload.total).toBeCloseTo(29.5);
  });
});

describe("orderItemRow", () => {
  it("writes defaults for optional fields", () => {
    const row = orderItemRow(
      item({ selected_variant: undefined, custom_field_values: undefined }),
      {
        user_id: "u1",
        brand_id: "b1",
        order_id: "o1",
      },
    );
    expect(row).toMatchObject({
      order_id: "o1",
      brand_id: "b1",
      product_id: null,
      location: "main",
      selected_variant: null,
      custom_field_values: [],
      unit_cost: null,
    });
  });
});

describe("orderChangeLogs", () => {
  it("logs status, payment status and advance changes", () => {
    const logs = orderChangeLogs(
      { status: "draft", payment_status: null, advance_paid: 0 },
      { id: "o1", status: "confirmed", payment_status: "partial" },
      10,
      "BHD",
    );
    expect(logs.map((l) => l.action)).toEqual([
      "status_change",
      "payment_change",
      "advance_change",
    ]);
    expect(orderChangeLogs({ status: "draft" }, { id: "o1", status: "draft" }, 0, "BHD")).toEqual(
      [],
    );
  });
});

describe("haveOrderItemsChanged", () => {
  const row = {
    id: "i1",
    variant_id: "v1",
    description: "Abaya",
    quantity: 1,
    unit_price: "30.000",
    line_total: "30.000",
    customization_total: null,
    location: "main",
    customizations: [],
    selected_variant: { size: "", color: "", fabric: "" },
    custom_field_values: [],
  };

  it("ignores number formatting from the database", () => {
    expect(haveOrderItemsChanged([row], [item()])).toBe(false);
  });

  it("detects added, removed and edited lines", () => {
    expect(haveOrderItemsChanged([row], [item(), item({ id: undefined })])).toBe(true);
    expect(haveOrderItemsChanged([row], [item({ id: "other" })])).toBe(true);
    expect(haveOrderItemsChanged([row], [item({ quantity: 2 })])).toBe(true);
  });
});
