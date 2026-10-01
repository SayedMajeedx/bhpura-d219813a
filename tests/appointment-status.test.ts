import { describe, expect, it } from "vitest";
import {
  effectiveFulfillmentStatus,
  getFulfillmentBadgeDetails,
  getFulfillmentLabel,
  getInvoiceStatusLabel,
} from "../src/lib/status-labels";
import { getDashboardOrderStatus } from "../src/lib/dashboard-order-status";

// An appointment is not packed, shipped or delivered: until it is done or
// cancelled it reads as scheduled, on the order screen, the invoice and the lists.

describe("the status an appointment shows", () => {
  it("is scheduled until it is done or cancelled, whatever was stored", () => {
    for (const stored of ["ON_HOLD", "NEEDS_PACKING", "PACKING", "ASSIGNED", null, ""]) {
      expect(effectiveFulfillmentStatus(stored, "appointment")).toBe("SCHEDULED");
    }
    expect(effectiveFulfillmentStatus("COMPLETED", "appointment")).toBe("COMPLETED");
    expect(effectiveFulfillmentStatus("cancelled", "appointment")).toBe("CANCELLED");
  });

  it("is left alone for a delivery, a pickup or an order with no method", () => {
    expect(effectiveFulfillmentStatus("NEEDS_PACKING", "delivery")).toBe("NEEDS_PACKING");
    expect(effectiveFulfillmentStatus("PACKING", "pickup")).toBe("PACKING");
    expect(effectiveFulfillmentStatus("ON_HOLD", null)).toBe("ON_HOLD");
  });

  it("reads as a scheduled appointment in the badge, the label and the invoice", () => {
    expect(getFulfillmentLabel("SCHEDULED", "ar")).toBe("موعد مجدول");
    expect(getFulfillmentLabel("SCHEDULED", "en")).toBe("Scheduled");
    expect(getFulfillmentBadgeDetails("NEEDS_PACKING", "ar", "appointment").label).toBe(
      "موعد مجدول",
    );
    expect(getFulfillmentBadgeDetails("NEEDS_PACKING", "en", "delivery").label).toBe(
      "Needs Packing",
    );
    expect(getInvoiceStatusLabel("scheduled", "ar")).toBe("موعد مجدول");
    expect(getInvoiceStatusLabel("scheduled", "en")).toBe("Scheduled");
    // A finished appointment is completed, like any order.
    expect(getInvoiceStatusLabel("completed", "en")).toBe("Completed");
  });

  it("shows on the dashboard's recent orders too", () => {
    const row = { status: "confirmed", fulfillment_status: "NEEDS_PACKING" };
    expect(getDashboardOrderStatus({ ...row, fulfillment_method: "appointment" }, "en").label).toBe(
      "Scheduled",
    );
    expect(getDashboardOrderStatus({ ...row, fulfillment_method: "delivery" }, "en").label).toBe(
      "Needs Packing",
    );
  });
});
