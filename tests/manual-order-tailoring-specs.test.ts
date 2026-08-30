import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const orderDetail = readFileSync("src/routes/_authenticated/admin.b.$slug.orders.$id.tsx", "utf8");
const invoiceFn = readFileSync("src/lib/public-invoice.functions.ts", "utf8");
const publicInvoice = readFileSync("src/routes/invoice.$id.tsx", "utf8");
const thermalPrint = readFileSync("src/lib/thermal-print.ts", "utf8");
const quickView = readFileSync("src/components/orders/OrderQuickViewModal.tsx", "utf8");
const orderItems = readFileSync("src/components/orders/OrderItemsSection.tsx", "utf8");

describe("Custom Tailoring & Made-To-Order Specifications", () => {
  it("includes ItemTailoringCustomizer with quick chips for size, color, fabric, and custom notes", () => {
    expect(orderDetail).toContain("QUICK_SIZES");
    expect(orderDetail).toContain("QUICK_COLORS");
    expect(orderDetail).toContain("QUICK_FABRICS");
    expect(orderDetail).toContain("function ItemTailoringCustomizer");
  });

  it("persists selected_variant and custom_field_values in order_items creation and updates", () => {
    expect(orderDetail).toContain("selected_variant: item.selected_variant ?? null");
    expect(orderDetail).toContain("custom_field_values: item.custom_field_values ?? []");
    expect(orderDetail).toContain("selected_variant: i.selected_variant ?? null");
    expect(orderDetail).toContain("custom_field_values: i.custom_field_values ?? []");
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
});
