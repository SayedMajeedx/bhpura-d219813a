import { describe, it, expect } from "vitest";
import {
  detectOrderType,
  isTailoringItem,
  getOrderTypeLabel,
} from "../src/lib/order-type-detector";
import { getOrderWorkflow } from "../src/lib/order-workflow";
import { getInvoiceStatusLabel } from "../src/lib/status-labels";

describe("Ready Stock vs Tailoring Order Workflow", () => {
  it("detects ready stock item correctly", () => {
    const item = {
      variant_id: "v-123",
      size: "M",
      color: "Black",
      custom_fields: [],
    };
    expect(isTailoringItem(item)).toBe(false);
  });

  it("detects tailoring item by null variant_id (custom line item)", () => {
    const item = {
      variant_id: null,
      description: "فستان داخلي - بيج - مقاس 54",
      customizations: [{ name: "Include Inner Dress" }],
    };
    expect(isTailoringItem(item)).toBe(true);
  });

  it("detects tailoring item by custom fields or measurements", () => {
    const item = {
      variant_id: "v-123",
      size: "M",
      custom_fields: [{ label: "Length (الطول)", value: "56" }],
    };
    expect(isTailoringItem(item)).toBe(true);
  });

  it("detects tailoring item by keyword in size or notes", () => {
    const item = {
      variant_id: "v-123",
      size: "مقاس خاص (تفصيل)",
      custom_fields: [],
    };
    expect(isTailoringItem(item)).toBe(true);
  });

  it("classifies order as ready_stock, tailoring, or mixed", () => {
    const readyItems = [
      { variant_id: "v-1", size: "S" },
      { variant_id: "v-2", size: "L" },
    ];
    expect(detectOrderType(readyItems)).toBe("ready_stock");

    const tailorItems = [{ variant_id: null, description: "تفصيل خاص / بدون مخزون جاهز" }];
    expect(detectOrderType(tailorItems)).toBe("tailoring");

    const mixedItems = [
      { variant_id: "v-1", size: "S" },
      { variant_id: null, description: "تفصيل" },
    ];
    expect(detectOrderType(mixedItems)).toBe("mixed");
  });

  it("returns correct next actions for tailoring workflow", () => {
    const tailoringOrder = {
      status: "pending",
      fulfillment_status: "ON_HOLD",
      order_type: "tailoring" as const,
    };
    const wf1 = getOrderWorkflow(tailoringOrder);
    expect(wf1.nextAction).toBe("send_to_tailor");

    const sentOrder = {
      status: "sent_to_tailor",
      fulfillment_status: "SENT_TO_TAILOR",
      order_type: "tailoring" as const,
    };
    const wf2 = getOrderWorkflow(sentOrder);
    expect(wf2.nextAction).toBe("receive_from_tailor");

    const receivedOrder = {
      status: "received_from_tailor",
      fulfillment_status: "RECEIVED_FROM_TAILOR",
      order_type: "tailoring" as const,
      fulfillment_method: "delivery",
    };
    const wf3 = getOrderWorkflow(receivedOrder);
    expect(wf3.nextAction).toBe("start_packing");

    const packingTailoringOrder = {
      status: "packing",
      fulfillment_status: "PACKING",
      order_type: "tailoring" as const,
      fulfillment_method: "delivery",
    };
    const wf4 = getOrderWorkflow(packingTailoringOrder);
    expect(wf4.nextAction).toBe("mark_shipped");
  });

  it("returns correct next actions for ready stock workflow", () => {
    const readyOrder = {
      status: "pending",
      fulfillment_status: "ON_HOLD",
      order_type: "ready_stock" as const,
    };
    const wf1 = getOrderWorkflow(readyOrder);
    expect(wf1.nextAction).toBe("start_packing");

    const packingOrder = {
      status: "packing",
      fulfillment_status: "PACKING",
      order_type: "ready_stock" as const,
      fulfillment_method: "delivery",
    };
    const wf2 = getOrderWorkflow(packingOrder);
    expect(wf2.nextAction).toBe("mark_shipped");
  });

  it("returns customer-facing invoice status labels correctly", () => {
    expect(getInvoiceStatusLabel("pending", "ar")).toBe("قيد الانتظار");
    expect(getInvoiceStatusLabel("sent_to_tailor", "ar")).toBe("قيد التفصيل بكل حب");
    expect(getInvoiceStatusLabel("packing", "ar")).toBe("قيد التجهيز والتغليف");
    expect(getInvoiceStatusLabel("received_from_tailor", "ar")).toBe("قيد التجهيز والتغليف");
    expect(getInvoiceStatusLabel("ready_for_pickup", "ar")).toBe("جاهز للاستلام");
    expect(getInvoiceStatusLabel("shipped", "ar")).toBe("تم الشحن");
    expect(getInvoiceStatusLabel("completed", "ar")).toBe("مكتمل");
    expect(getInvoiceStatusLabel("cancelled", "ar")).toBe("ملغى");
  });
});
