import { describe, expect, it } from "vitest";
import { getOrderWorkflow } from "../src/lib/order-workflow";

const order = (overrides: Record<string, unknown> = {}) => ({
  status: "confirmed",
  payment_status: "unpaid",
  payment_method: "benefit",
  fulfillment_status: "ON_HOLD",
  fulfillment_method: "delivery",
  total: 13,
  advance_paid: 0,
  ...overrides,
});

describe("getOrderWorkflow", () => {
  it("requires manual BenefitPay validation", () => {
    const result = getOrderWorkflow(order());
    expect(result.nextAction).toBe("validate_payment");
    expect(result.needsAttention).toBe(true);
    expect(result.awaitingPayment).toBe(true);
  });

  it("treats unpaid COD as fulfillment work, not awaiting payment", () => {
    const result = getOrderWorkflow(order({ payment_method: "cod" }));
    expect(result.nextAction).toBe("pack_and_ship");
    expect(result.needsAttention).toBe(true);
    expect(result.awaitingPayment).toBe(false);
  });

  it("moves paid pickup orders through preparation and handover", () => {
    expect(
      getOrderWorkflow(order({ payment_status: "paid", fulfillment_method: "pickup" })).nextAction,
    ).toBe("prepare_pickup");
    expect(
      getOrderWorkflow(
        order({
          payment_status: "paid",
          fulfillment_method: "pickup",
          fulfillment_status: "READY_FOR_PICKUP",
        }),
      ).nextAction,
    ).toBe("hand_over_pickup");
  });

  it("collects COD only at pickup or delivery completion", () => {
    expect(
      getOrderWorkflow(
        order({
          payment_method: "cod",
          fulfillment_method: "pickup",
          fulfillment_status: "READY_FOR_PICKUP",
        }),
      ).nextAction,
    ).toBe("collect_and_hand_over");
    expect(
      getOrderWorkflow(order({ payment_method: "cod", fulfillment_status: "OUT_FOR_DELIVERY" }))
        .nextAction,
    ).toBe("collect_and_deliver");
  });

  it("does not request collection if COD order has already been marked as paid", () => {
    // Order #1090 scenario: marked as paid by agent / customer paid upfront
    const paidPickupOrder = getOrderWorkflow(
      order({
        payment_method: "cash_on_delivery",
        payment_status: "paid",
        fulfillment_method: "pickup",
        fulfillment_status: "READY_FOR_PICKUP",
      }),
    );
    expect(paidPickupOrder.nextAction).toBe("hand_over_pickup");
    expect(paidPickupOrder.outstanding).toBe(0);

    const paidDeliveryOrder = getOrderWorkflow(
      order({
        payment_method: "cash_on_delivery",
        payment_status: "paid",
        fulfillment_method: "delivery",
        fulfillment_status: "OUT_FOR_DELIVERY",
      }),
    );
    expect(paidDeliveryOrder.nextAction).toBe("mark_delivered");
    expect(paidDeliveryOrder.outstanding).toBe(0);
  });

  it("correctly requires collection for partially paid orders", () => {
    const partialOrder = getOrderWorkflow(
      order({
        total: 20,
        advance_paid: 8,
        payment_method: "cod",
        payment_status: "partially_paid",
        fulfillment_method: "pickup",
        fulfillment_status: "READY_FOR_PICKUP",
      }),
    );
    expect(partialOrder.nextAction).toBe("collect_and_hand_over");
    expect(partialOrder.outstanding).toBe(12);
  });

  it("never flags terminal orders even if stale payment fields remain", () => {
    for (const fulfillment_status of ["COMPLETED", "DELIVERED", "CANCELLED", "RETURNED"]) {
      const result = getOrderWorkflow(order({ fulfillment_status }));
      expect(result.nextAction).toBe("none");
      expect(result.needsAttention).toBe(false);
      expect(result.awaitingPayment).toBe(false);
    }
  });

  it("flags failed delivery for resolution", () => {
    const result = getOrderWorkflow(
      order({ payment_method: "cod", fulfillment_status: "DELIVERY_FAILED" }),
    );
    expect(result.nextAction).toBe("resolve_delivery_failure");
    expect(result.needsAttention).toBe(true);
  });
});
