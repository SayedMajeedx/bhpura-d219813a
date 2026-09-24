import { describe, expect, it } from "vitest";
import {
  blankOrderItem,
  filterCustomers,
  filterVariantsForSearch,
  formatDeliveryAddress,
  isUntouchedDraft,
  newDraftOrder,
  normalizeCustomFieldValues,
  orderTotals,
  promoFailureMessage,
  promoSignature,
  recalcOrderItem,
} from "../src/features/orders/lib/order-editor";

const line = (overrides = {}) => ({
  ...blankOrderItem(),
  description: "Abaya",
  unit_price: 20,
  line_total: 20,
  ...overrides,
});

describe("orderTotals", () => {
  const items = [line({ line_total: 60 }), line({ line_total: 40 })];

  it("adds tax on top after the discount, plus untaxed shipping", () => {
    const totals = orderTotals(
      items,
      { discount: 10, shipping: 2, tax_rate: 10, advance_paid: 50 },
      false,
    );
    expect(totals).toMatchObject({ subtotal: 100, discount: 10, shipping: 2, total: 101 });
    expect(totals.taxAmount).toBeCloseTo(9);
    expect(totals.remaining).toBeCloseTo(51);
  });

  it("carves VAT out of inclusive prices", () => {
    const totals = orderTotals(items, { discount: 0, shipping: 0, tax_rate: 10 }, true);
    expect(totals.total).toBe(100);
    expect(totals.taxAmount).toBeCloseTo(100 - 100 / 1.1);
  });

  it("never goes below zero for an oversized discount or advance", () => {
    const totals = orderTotals(items, { discount: 500, advance_paid: 900, tax_rate: 10 }, false);
    expect(totals.total).toBe(0);
    expect(totals.remaining).toBe(0);
  });
});

describe("order lines", () => {
  it("recalculates customization and line totals", () => {
    const item = recalcOrderItem(
      line({
        quantity: 2,
        unit_price: 20,
        customizations: [
          { name: "Embroidery", price_delta: 5 },
          { name: "Hem", price_delta: 1 },
        ],
      }),
    );
    expect(item).toMatchObject({ customization_total: 6, line_total: 52 });
  });

  it("reads old object-shaped custom field values", () => {
    expect(normalizeCustomFieldValues({ sleeve: 60 })).toEqual([
      { key: "sleeve", label_ar: null, label_en: "sleeve", value: "60" },
    ]);
    expect(normalizeCustomFieldValues(null)).toEqual([]);
  });

  it("changes the promo signature when customer, quantity or price changes", () => {
    const base = promoSignature("c1", [line({ variant_id: "v1", quantity: 1 })]);
    expect(promoSignature("c1", [line({ variant_id: "v1", quantity: 1 })])).toBe(base);
    expect(promoSignature("c2", [line({ variant_id: "v1", quantity: 1 })])).not.toBe(base);
    expect(promoSignature("c1", [line({ variant_id: "v1", quantity: 2 })])).not.toBe(base);
    expect(promoSignature("c1", [line({ variant_id: "v1", line_total: 21 })])).not.toBe(base);
  });
});

describe("drafts", () => {
  it("starts a new order with the store's first enabled fulfillment method", () => {
    const draft = newDraftOrder(
      { pickup_enabled: true, delivery_fee: 2, currency: "SAR" },
      "b1",
      "2026-09-24",
    );
    expect(draft).toMatchObject({
      fulfillment_method: "pickup",
      shipping: 0,
      total: 0,
      currency: "SAR",
      tax_rate: 15,
      order_date: "2026-09-24",
    });
    expect(newDraftOrder({ delivery_enabled: true, delivery_fee: 2 }, "b1", "x")).toMatchObject({
      fulfillment_method: "delivery",
      shipping: 2,
      total: 2,
    });
  });

  it("treats a draft as untouched until it has a customer, payment method or items", () => {
    expect(isUntouchedDraft({ status: "draft", order_items: [] })).toBe(true);
    expect(isUntouchedDraft({ status: "draft", customer_id: "c1" })).toBe(false);
    expect(isUntouchedDraft({ status: "draft", order_items: [{}] })).toBe(false);
    expect(isUntouchedDraft({ status: "confirmed" })).toBe(false);
  });
});

describe("searches", () => {
  it("finds customers by name, email or phone digits", () => {
    const list = [
      { name: "Fatima Ali", email: "f@x.com", phone: "+973 3333 1111" },
      { name: "Sara", email: "sara@x.com", phone: "3999-2222" },
    ];
    expect(filterCustomers(list, "fatima").map((c) => c.name)).toEqual(["Fatima Ali"]);
    expect(filterCustomers(list, "39992").map((c) => c.name)).toEqual(["Sara"]);
    expect(filterCustomers(list, "")).toHaveLength(2);
  });

  it("matches every word against product names and variant details", () => {
    const products = [{ id: "p1", name: "Silk Abaya", name_ar: "عباية حرير" }];
    const variants = [
      { id: "v1", product_id: "p1", size: "52", color: "Black" },
      { id: "v2", product_id: "p1", size: "54", color: "Navy" },
    ];
    expect(filterVariantsForSearch(variants, products, "abaya black").map((v) => v.id)).toEqual([
      "v1",
    ]);
    expect(filterVariantsForSearch(variants, products, "حرير 54").map((v) => v.id)).toEqual(["v2"]);
    expect(filterVariantsForSearch(variants, products, "  ")).toHaveLength(2);
  });
});

describe("text", () => {
  it("orders address parts by language", () => {
    const address = { region: null, city: "Manama", road: "12", house: "5", flat: "3" };
    expect(formatDeliveryAddress(address, "en")).toEqual(["3, 5, 12, Manama"]);
    expect(formatDeliveryAddress(address, "ar")).toEqual(["Manama، 12، 5، 3"]);
    expect(formatDeliveryAddress({ address: "Line 1\nLine 2" }, "en")).toEqual([
      "Line 1",
      "Line 2",
    ]);
  });

  it("explains promo rejections", () => {
    expect(promoFailureMessage({ reason: "CODE_NOT_FOUND" }, "en")).toContain("does not exist");
    expect(
      promoFailureMessage({ reason: "MINIMUM_NOT_MET", minimum_order_amount: 10 }, "en"),
    ).toMatch(/minimum purchase/);
    expect(promoFailureMessage(null, "ar")).toContain("تعذر تطبيق رمز الخصم");
  });
});
