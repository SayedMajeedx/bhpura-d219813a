import { describe, it, expect } from "vitest";
import { getOrderWorkflow } from "../src/lib/order-workflow";
import { printDeliveryNote } from "../src/lib/thermal-print";

describe("Stage 4 - Order Progress Model & Sales Documents", () => {
  it("distinguishes payment status from fulfillment status properly", () => {
    // Case 1: Paid online order, waiting to be prepared
    const paidOrder = {
      id: "ord-1",
      payment_status: "paid",
      status: "confirmed",
      fulfillment_status: "pending",
      payment_method: "benefit",
      total: 50,
      advance_paid: 50,
    };
    const wf1 = getOrderWorkflow(paidOrder);
    expect(wf1.payment).toBe("paid");
    expect(wf1.awaitingPayment).toBe(false);
    expect(
      !wf1.terminal &&
        [
          "pending",
          "packing",
          "on_hold",
          "needs_packing",
          "received_from_tailor",
          "sent_to_tailor",
        ].includes(wf1.fulfillment) &&
        (!wf1.awaitingPayment || wf1.isCod),
    ).toBe(true);

    // Case 2: COD unpaid order - still needs preparation because COD payment is collected on delivery
    const codOrder = {
      id: "ord-2",
      payment_status: "unpaid",
      status: "pending",
      fulfillment_status: "pending",
      payment_method: "cash_on_delivery",
      total: 35,
      advance_paid: 0,
    };
    const wf2 = getOrderWorkflow(codOrder);
    expect(wf2.isCod).toBe(true);
    expect(
      !wf2.terminal &&
        [
          "pending",
          "packing",
          "on_hold",
          "needs_packing",
          "received_from_tailor",
          "sent_to_tailor",
        ].includes(wf2.fulfillment) &&
        (!wf2.awaitingPayment || wf2.isCod),
    ).toBe(true);

    // Case 3: Non-COD unpaid order - should await payment before preparation
    const unpaidCardOrder = {
      id: "ord-3",
      payment_status: "unpaid",
      status: "pending",
      fulfillment_status: "pending",
      payment_method: "benefit",
      total: 80,
      advance_paid: 0,
    };
    const wf3 = getOrderWorkflow(unpaidCardOrder);
    expect(wf3.awaitingPayment).toBe(true);
    expect(
      !wf3.terminal &&
        [
          "pending",
          "packing",
          "on_hold",
          "needs_packing",
          "received_from_tailor",
          "sent_to_tailor",
        ].includes(wf3.fulfillment) &&
        (!wf3.awaitingPayment || wf3.isCod),
    ).toBe(false);
  });

  it("identifies out_for_delivery orders with courier", () => {
    const shippedOrder = {
      id: "ord-4",
      payment_status: "paid",
      fulfillment_status: "out_for_delivery",
      status: "processing",
      total: 40,
    };
    const wf = getOrderWorkflow(shippedOrder);
    expect(wf.withCourier).toBe(true);
    expect(wf.fulfillment).toBe("out_for_delivery");
  });

  it("flags urgent order exceptions (needsAttention)", () => {
    const needsAttentionOrder = {
      id: "ord-5",
      payment_status: "unpaid",
      payment_method: "card",
      status: "pending",
      fulfillment_status: "pending",
      total: 100,
    };
    const wf = getOrderWorkflow(needsAttentionOrder);
    expect(wf.needsAttention).toBe(true);
  });

  it("printDeliveryNote handles all delivery document parameters cleanly without throwing", () => {
    expect(() => {
      printDeliveryNote({
        brand: "Boutq Test Merchant",
        orderNumber: "INV-1092",
        orderDate: "10/09/2026",
        fulfillmentStatus: "PACKING",
        customerName: "Fatima Al-Sayed",
        customerPhone: "+97339001122",
        deliveryAddress: "Building 12, Road 34, Block 56, Riffa",
        courierName: "Ali Hasan",
        deliveryNotes: "Ring bell twice, leave with reception if absent",
        items: [
          { description: "Silk Abaya Black", quantity: 1, selected_variant: "Size 56" },
          { description: "Linen Sheila", quantity: 2, selected_variant: "Navy" },
        ],
        isPaid: false,
        balanceDue: 45,
        currency: "BHD",
        lang: "ar",
      });
    }).not.toThrow();
  });
});
