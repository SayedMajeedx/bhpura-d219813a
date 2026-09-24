import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isOrderDirty, orderItemFromRow } from "../src/features/orders/lib/order-editor";
import { orderItemRow } from "../src/features/orders/lib/order-save";

const orderDetail = readFileSync("src/routes/_authenticated/admin.b.$slug.orders.$id.tsx", "utf8");
const invoiceFn = readFileSync("src/lib/public-invoice.functions.ts", "utf8");
const publicInvoice = readFileSync("src/routes/invoice.$id.tsx", "utf8");
const thermalPrint = readFileSync("src/lib/thermal-print.ts", "utf8");
const quickView = readFileSync("src/components/orders/OrderQuickViewModal.tsx", "utf8");
const orderItems = readFileSync("src/components/orders/OrderItemsSection.tsx", "utf8");

describe("Custom Tailoring & Made-To-Order Specifications", () => {
  it("includes tailoring and variant specifications for size, color, fabric, and custom notes", () => {
    // The order editor's item type moved to src/features/orders/types.ts (Phase 5).
    const orderTypes = readFileSync("src/features/orders/types.ts", "utf8");
    expect(orderDetail).toContain("selected_variant");
    expect(orderTypes).toContain("fabric?: string | null");
    expect(orderTypes).toContain("color?: string | null");
    expect(orderTypes).toContain("size?: string | null");
  });

  it("persists selected_variant and custom_field_values in order_items creation and updates", () => {
    const specs = { size: "52", color: "Black", fabric: "Crepe" };
    const fields = [{ key: "sleeve", label_ar: null, label_en: "Sleeve", value: "60" }];
    const row = orderItemRow(
      {
        description: "Abaya",
        quantity: 1,
        unit_price: 30,
        customizations: [],
        customization_total: 0,
        line_total: 30,
        location: "custom",
        selected_variant: specs,
        custom_field_values: fields,
      },
      { user_id: "u1", brand_id: "b1", order_id: "o1" },
    );
    expect(row).toMatchObject({ selected_variant: specs, custom_field_values: fields });
    // Both new orders and edits save lines through orderItemRow.
    expect(orderDetail.match(/orderItemRow\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(
      orderItemFromRow({ selected_variant: specs, custom_field_values: fields }),
    ).toMatchObject({ selected_variant: specs, custom_field_values: fields });
  });

  it("fetches selected_variant in public invoice query and renders variant specs", () => {
    expect(invoiceFn).toContain("selected_variant");
    expect(publicInvoice).toContain("it.selected_variant?.color");
    expect(publicInvoice).toContain("it.selected_variant?.size");
    expect(publicInvoice).toContain("it.selected_variant?.fabric");
  });

  it("prints custom tailoring specs on thermal POS receipts", () => {
    expect(thermalPrint).toContain("selected_variant");
    expect(thermalPrint).toContain("it.selected_variant?.color");
    expect(thermalPrint).toContain("it.selected_variant?.size");
    expect(thermalPrint).toContain("it.selected_variant?.fabric");
  });

  it("displays custom variant specs in quick view modal and order items section", () => {
    expect(quickView).toContain("selected_variant?.color");
    expect(quickView).toContain("selected_variant?.size");
    expect(quickView).toContain("selected_variant?.fabric");

    expect(orderItems).toContain("selected_variant?.color");
    expect(orderItems).toContain("selected_variant?.size");
    expect(orderItems).toContain("selected_variant?.fabric");
  });

  it("accurately tracks form dirtiness for description, selected_variant, and custom fields", () => {
    const item = {
      description: "Abaya",
      quantity: 1,
      unit_price: 30,
      customizations: [],
      customization_total: 0,
      line_total: 30,
      location: "custom" as const,
      selected_variant: { size: "52", color: null, fabric: null },
      custom_field_values: [{ key: "sleeve", label_ar: null, label_en: "Sleeve", value: "60" }],
    };
    const snapshot = { order: { id: "o1", notes: "" }, items: [item] };
    const dirty = (items: (typeof item)[]) => isOrderDirty(snapshot, snapshot.order, items);

    expect(dirty([{ ...item }])).toBe(false);
    expect(dirty([{ ...item, description: " Abaya " }])).toBe(false);
    expect(dirty([{ ...item, description: "Kaftan" }])).toBe(true);
    expect(dirty([{ ...item, selected_variant: { size: "54", color: null, fabric: null } }])).toBe(
      true,
    );
    expect(
      dirty([
        {
          ...item,
          custom_field_values: [{ key: "sleeve", label_ar: null, label_en: "Sleeve", value: "62" }],
        },
      ]),
    ).toBe(true);
    expect(isOrderDirty(snapshot, { id: "o1", notes: "Rush" }, [item])).toBe(true);
    expect(orderDetail).toContain("brand_id: brandId");
  });
});
