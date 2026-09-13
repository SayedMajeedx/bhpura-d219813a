import { describe, expect, it } from "vitest";
import {
  getOrderWorkflow,
  getFulfillmentStage,
  type OrderWorkflowInput,
} from "../src/lib/order-workflow";
import {
  resolvePaymentStatus,
  derivePaymentStatus,
  formatPaymentBadgeDetail,
} from "../src/lib/payment-status";
import { orderRequiresCourier } from "../src/lib/order-fulfillment";

describe("Order Workflow & Payment Status Behavioral Suite", () => {
  describe("Courier Requirement Logic", () => {
    it("returns true only when fulfillment method is delivery", () => {
      expect(orderRequiresCourier({ fulfillment_method: "delivery" })).toBe(true);
      expect(orderRequiresCourier({ fulfillment_method: "DELIVERY" })).toBe(true);
      expect(orderRequiresCourier({ fulfillment_method: " delivery " })).toBe(true);
    });

    it("returns false for pickup, digital, and null/empty methods", () => {
      expect(orderRequiresCourier({ fulfillment_method: "pickup" })).toBe(false);
      expect(orderRequiresCourier({ fulfillment_method: "digital" })).toBe(false);
      expect(orderRequiresCourier({ fulfillment_method: null })).toBe(false);
      expect(orderRequiresCourier({ fulfillment_method: "" })).toBe(false);
      expect(orderRequiresCourier({})).toBe(false);
    });
  });

  describe("Payment Status Resolution", () => {
    it("derives unpaid, partial, and paid based on total and advance paid", () => {
      expect(derivePaymentStatus("pending", 50, 0)).toBe("unpaid");
      expect(derivePaymentStatus("pending", 50, 20)).toBe("partial");
      expect(derivePaymentStatus("pending", 50, 50)).toBe("paid");
      expect(derivePaymentStatus("pending", 50, 55)).toBe("paid");
    });

    it("respects manual payment status overrides with mathematical consistency", () => {
      // Manual 'paid' overrides unpaid balance
      expect(resolvePaymentStatus("paid", "pending", 50, 0)).toBe("paid");

      // Manual 'refunded' sets refunded badge
      expect(resolvePaymentStatus("refunded", "confirmed", 50, 50)).toBe("refunded");

      // Manual 'partial' with zero remaining balance resolves to paid
      expect(resolvePaymentStatus("partial", "pending", 50, 50)).toBe("paid");

      // Manual 'unpaid' with positive advance paid resolves to partial
      expect(resolvePaymentStatus("unpaid", "pending", 50, 25)).toBe("partial");
    });

    it("formats payment badge detail text in English and Arabic", () => {
      const enDetail = formatPaymentBadgeDetail("partial", 50, 20, "BHD", "en");
      expect(enDetail).toBe("Partially Paid (Paid BHD 20.000 / Due BHD 30.000)");

      const arDetail = formatPaymentBadgeDetail("partial", 50, 20, "BHD", "ar");
      expect(arDetail).toBe("مدفوع جزئياً (مدفوع 20.000 BHD / متبقي 30.000 BHD)");

      const paidDetail = formatPaymentBadgeDetail("paid", 50, 50, "BHD", "ar");
      expect(paidDetail).toBe("مدفوع");
    });
  });

  describe("Fulfillment Stage State Machine", () => {
    it("prefers canonical fulfillment_status over legacy status", () => {
      const order: OrderWorkflowInput = {
        fulfillment_status: "received_from_tailor",
        status: "sent_to_tailor",
      };
      expect(getFulfillmentStage(order)).toBe("received_from_tailor");
    });

    it("correctly identifies terminal fulfillment states", () => {
      expect(getFulfillmentStage({ fulfillment_status: "delivered" })).toBe("completed");
      expect(getFulfillmentStage({ fulfillment_status: "completed" })).toBe("completed");
      expect(getFulfillmentStage({ fulfillment_status: "picked_up" })).toBe("completed");
      expect(getFulfillmentStage({ fulfillment_status: "cancelled" })).toBe("cancelled");
      expect(getFulfillmentStage({ fulfillment_status: "returned" })).toBe("returned");
      expect(getFulfillmentStage({ fulfillment_status: "delivery_failed" })).toBe("failed");
    });
  });

  describe("Comprehensive Order Workflow Progression", () => {
    it("handles digital orders upon full payment", () => {
      const digitalPaid = getOrderWorkflow({
        status: "confirmed",
        payment_status: "paid",
        fulfillment_method: "digital",
        total: 15,
        advance_paid: 15,
      });

      expect(digitalPaid.nextAction).toBe("deliver_digital");
      expect(digitalPaid.outstanding).toBe(0);
      expect(digitalPaid.needsAttention).toBe(true);
    });

    it("handles failed delivery with resolution action", () => {
      const failedOrder = getOrderWorkflow({
        status: "confirmed",
        fulfillment_status: "failed",
        fulfillment_method: "delivery",
        total: 30,
      });

      expect(failedOrder.nextAction).toBe("resolve_delivery_failure");
      expect(failedOrder.needsAttention).toBe(true);
    });

    it("terminates cancelled and returned orders without requiring actions", () => {
      const cancelledOrder = getOrderWorkflow({
        status: "cancelled",
        fulfillment_status: "cancelled",
        total: 45,
      });

      expect(cancelledOrder.terminal).toBe(true);
      expect(cancelledOrder.nextAction).toBe("none");
      expect(cancelledOrder.needsAttention).toBe(false);
    });

    it("progresses tailored orders through tailor dispatch, receipt, and packing", () => {
      // Step 1: Newly placed tailoring order -> send_to_tailor
      const step1 = getOrderWorkflow({
        status: "confirmed",
        payment_status: "paid",
        order_type: "tailoring",
        fulfillment_status: "on_hold",
        fulfillment_method: "delivery",
        total: 60,
      });
      expect(step1.nextAction).toBe("send_to_tailor");

      // Step 2: Sent to tailor -> receive_from_tailor
      const step2 = getOrderWorkflow({
        status: "sent_to_tailor",
        payment_status: "paid",
        order_type: "tailoring",
        fulfillment_status: "sent_to_tailor",
        fulfillment_method: "delivery",
        total: 60,
      });
      expect(step2.nextAction).toBe("receive_from_tailor");

      // Step 3: Received from tailor -> start_packing
      const step3 = getOrderWorkflow({
        status: "received_from_tailor",
        payment_status: "paid",
        order_type: "tailoring",
        fulfillment_status: "received_from_tailor",
        fulfillment_method: "delivery",
        total: 60,
      });
      expect(step3.nextAction).toBe("start_packing");

      // Step 4: Packing -> mark_shipped
      const step4 = getOrderWorkflow({
        status: "packing",
        payment_status: "paid",
        order_type: "tailoring",
        fulfillment_status: "packing",
        fulfillment_method: "delivery",
        total: 60,
      });
      expect(step4.nextAction).toBe("mark_shipped");
    });
  });
});
