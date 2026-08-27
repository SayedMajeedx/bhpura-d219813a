import { describe, expect, it } from "vitest";
import { getDashboardOrderStatus } from "../src/lib/dashboard-order-status";

const baseOrder = {
  id: "order-1",
  invoice_number: 1093,
  created_at: "2026-08-25T00:00:00.000Z",
  currency: "BHD",
  total: 8,
  payment_status: "paid",
};

describe("dashboard recent order status", () => {
  it("prefers the live fulfillment status over the legacy order status", () => {
    expect(
      getDashboardOrderStatus(
        {
          ...baseOrder,
          status: "confirmed",
          fulfillment_status: "completed",
        },
        "ar",
      ),
    ).toMatchObject({ label: "مكتمل", variant: "success", effectiveStatus: "completed" });
  });

  it("falls back to the order status when fulfillment has not started", () => {
    expect(
      getDashboardOrderStatus(
        {
          ...baseOrder,
          status: "confirmed",
          fulfillment_status: null,
        },
        "ar",
      ),
    ).toMatchObject({ label: "مؤكد", variant: "warning", effectiveStatus: "confirmed" });
  });

  it("uses destructive styling for cancelled fulfillment", () => {
    expect(
      getDashboardOrderStatus(
        {
          ...baseOrder,
          status: "confirmed",
          fulfillment_status: "cancelled",
        },
        "ar",
      ).variant,
    ).toBe("destructive");
  });
});
