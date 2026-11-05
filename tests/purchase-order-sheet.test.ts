import { describe, expect, it } from "vitest";
import {
  pieceSpecs,
  purchaseOrderHtml,
  specLine,
} from "../src/features/supplier-orders/lib/purchase-order-sheet";
import type { SupplierOrderLine } from "../src/features/supplier-orders/lib/order-state";

// A customer's piece sent to the workshop is recorded on the supplier's order with what the
// customer's order says (the owner's report of 2026-11-04), and the order prints as a document:
// each piece with its size or "made to measure", measurements, notes and extras, the customer's
// order by number only, and prices only when asked.

const tailored = {
  id: "l1",
  product_id: "p1",
  variant_id: "v56",
  description: "Black abaya",
  quantity: 1,
  location: "custom",
  selected_variant: { color: "Black", made_to_measure: true },
  custom_field_values: [
    { key: "made_to_measure", label_en: "Made to measure", value: "true" },
    { key: "fit_passport_unit", label_en: "Length unit", label_ar: "وحدة القياس", value: "in" },
    { key: "fit_passport_abaya_length", label_en: "Length", label_ar: "الطول", value: "58" },
    { key: "fit_passport_abaya_bust", label_en: "Bust", label_ar: "الصدر", value: "22" },
    {
      key: "tailoring_notes",
      label_en: "Notes for the workshop",
      label_ar: "ملاحظات",
      value: "Full lining <b>",
    },
  ],
};
const sized = {
  id: "l2",
  product_id: "p1",
  variant_id: "v54",
  description: "Black abaya",
  quantity: 2,
  location: "custom",
  selected_variant: { size: "54", color: "Black" },
  custom_field_values: [],
};

const line = (over: Partial<SupplierOrderLine>): SupplierOrderLine => ({
  id: "pi",
  variant_id: null,
  product_id: "p1",
  description: "Black abaya",
  quantity: 1,
  received_quantity: 0,
  unit_cost: 20,
  line_total: 20,
  sort_order: 0,
  ...over,
});

const order = {
  po_number: "PO-0007",
  created_at: "2026-11-04T08:00:00Z",
  expected_at: "2026-11-20",
  vendor_name: "Umm Ali",
  notes: "Deliver on Thursday",
  total_amount: 75,
  items: [
    line({
      id: "pi1",
      order_item_id: "l1",
      customer_order: { id: "o1", invoice_number: 1042 },
      line_revision: 2,
      sheet_revision: 2,
    }),
    line({
      id: "pi2",
      order_item_id: "l2",
      customer_order: { id: "o2", invoice_number: 1043 },
      quantity: 2,
      line_total: 40,
      sort_order: 1,
      price_pending: true,
    }),
    line({ id: "pi3", variant_id: "v52", quantity: 1, line_total: 10, sort_order: 2 }),
    line({ id: "pi4", product_id: null, description: "Delivery", line_total: 5, sort_order: 3 }),
  ],
};

describe("a customer's piece's specification", () => {
  it("is read from its order line: made to measure with its measurements, or its size", () => {
    const specs = pieceSpecs([tailored, sized], [], { lang: "en" });
    const made = specs.get("l1");
    expect(made?.options).toContainEqual(
      expect.objectContaining({ value: expect.stringMatching(/made to measure/i) }),
    );
    expect(made?.details).toEqual([
      { label: "Length", value: "58" },
      { label: "Bust", value: "22" },
    ]);
    expect(made?.notes).toEqual(["Full lining <b>"]);
    // A piece made to the customer's measurements never names a size.
    expect(specLine(made)).not.toContain("56");
    expect(specLine(specs.get("l2"))).toContain("54");
  });
});

describe("the printed supplier order", () => {
  const specs = pieceSpecs([tailored, sized], [], { lang: "en" });
  const html = (withPrices: boolean) =>
    purchaseOrderHtml({
      brand: "Pura",
      order,
      specs,
      sizeName: (id) => (id === "v52" ? "52" : ""),
      lang: "en",
      withPrices,
      currency: "BHD",
      numberFormat: { order_number_prefix: "PL-", order_number_digits: 5 },
    });

  it("lists every piece with its details, its customer's order by number and its revision", () => {
    const page = html(false);
    expect(page).toContain("Purchase order");
    expect(page).toContain("PO-0007");
    expect(page).toContain("Umm Ali");
    expect(page).toContain("PL-01042");
    expect(page).toContain("Revision 2");
    expect(page).toContain('<b dir="auto">58</b>');
    expect(page).toContain("Full lining &lt;b&gt;");
    expect(page).toContain("Deliver on Thursday");
    // A stock piece with its size; four pieces in all (the delivery is not a piece).
    expect(page).toContain("· 52");
    expect(page).toContain("4 pieces");
  });

  it("shows no price unless asked, and then the costs and the total", () => {
    const without = html(false);
    expect(without).not.toContain("BHD");
    expect(without).not.toContain("Delivery");
    const priced = html(true);
    expect(priced).toContain("Delivery");
    expect(priced).toMatch(/BHD\s*75\.000/);
    // A piece sent with no price says so instead of 0.
    expect(priced).toContain("Price to be added");
  });

  it("is written in Arabic for an Arabic-reading supplier", () => {
    const page = purchaseOrderHtml({
      brand: "بيورا",
      order,
      specs: pieceSpecs([tailored], [], { lang: "ar" }),
      sizeName: () => "",
      lang: "ar",
      withPrices: false,
      currency: "BHD",
    });
    expect(page).toContain('dir="rtl"');
    expect(page).toContain("طلبية مورّد");
    expect(page).toContain("الطول");
    expect(page).toContain("النسخة 2");
  });
});
