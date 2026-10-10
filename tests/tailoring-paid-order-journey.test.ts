import { describe, expect, it } from "vitest";
import { getOrderWorkflow, type OrderWorkflowInput } from "../src/lib/order-workflow";
import { getFulfillmentBadgeDetails } from "../src/lib/status-labels";
import { DEFAULT_VOCABULARY, workshopActionLabels } from "../src/lib/store-vocabulary";

// A made-to-order order paid by a confirmed BenefitPay transfer waits as NEEDS_PACKING. It must
// go to the tailor, come back, be packed and shipped, in that order, instead of jumping to
// "update shipping" the moment the payment is confirmed.

const tailored = [{ custom_field_values: [{ label: "الطول", value: "54" }], quantity: 1 }];
const ready = [{ variant_id: "v1", size: "52", quantity: 1 }];

const order = (over: Partial<OrderWorkflowInput> = {}): OrderWorkflowInput => ({
  status: "confirmed",
  payment_status: "paid",
  payment_method: "benefit",
  fulfillment_method: "delivery",
  fulfillment_status: "NEEDS_PACKING",
  total: 33.9,
  order_items: tailored,
  ...over,
});
const flow = (over: Partial<OrderWorkflowInput> = {}, productionStages = true) =>
  getOrderWorkflow(order(over), { productionStages });

describe("a paid made-to-order order, step by step", () => {
  it("waits to be sent to the tailor once its payment is confirmed", () => {
    const wf = flow();
    expect(wf.isTailoring).toBe(true);
    expect(wf.fulfillment).toBe("awaiting_tailor");
    expect(wf.nextAction).toBe("send_to_tailor");
    expect(wf.needsAttention).toBe(true);
  });

  it("goes tailor, back from the tailor, packed, shipped, delivered", () => {
    expect(flow({ fulfillment_status: "SENT_TO_TAILOR" }).nextAction).toBe("receive_from_tailor");
    expect(flow({ fulfillment_status: "RECEIVED_FROM_TAILOR" }).nextAction).toBe("start_packing");
    expect(flow({ fulfillment_status: "PACKING" }).nextAction).toBe("mark_shipped");
    expect(flow({ fulfillment_status: "SHIPPED" }).nextAction).toBe("mark_completed");
  });

  it("is handed over at the branch for a pickup", () => {
    const pickup = { fulfillment_method: "pickup" };
    expect(flow(pickup).nextAction).toBe("send_to_tailor");
    expect(flow({ ...pickup, fulfillment_status: "PACKING" }).nextAction).toBe("mark_ready_pickup");
  });

  it("is also handed over when it has not been paid yet (cash on delivery, held)", () => {
    const wf = flow({
      payment_method: "cod",
      payment_status: "unpaid",
      fulfillment_status: "ON_HOLD",
    });
    expect(wf.nextAction).toBe("send_to_tailor");
  });

  it("a mixed order (tailored and ready pieces) goes to the tailor first too", () => {
    expect(flow({ order_items: [...tailored, ...ready] }).nextAction).toBe("send_to_tailor");
  });
});

describe("what does not change", () => {
  it("a ready piece waiting as NEEDS_PACKING is still in the packing queue", () => {
    const wf = flow({ order_items: ready });
    expect(wf.isTailoring).toBe(false);
    expect(wf.fulfillment).toBe("packing");
    expect(wf.nextAction).toBe("mark_shipped");
  });

  it("a store without production stages treats the order as ready stock", () => {
    const wf = flow({}, false);
    expect(wf.fulfillment).toBe("packing");
    expect(wf.nextAction).toBe("mark_shipped");
  });

  it("an unconfirmed BenefitPay transfer is still asked to be validated first", () => {
    const wf = flow({ payment_status: "unpaid", status: "pending_verification" });
    expect(wf.nextAction).toBe("validate_payment");
  });
});

describe("the words", () => {
  const tailor = { ...DEFAULT_VOCABULARY, workshop: { ar: "الخياط", en: "Tailor" } };

  it("a button says what it will do, in the store's own noun", () => {
    expect(workshopActionLabels(tailor, "ar")).toEqual({
      send: "إرسال إلى الخياط",
      receive: "استلام من الخياط",
      awaiting: "بانتظار الإرسال إلى الخياط",
    });
    expect(workshopActionLabels(tailor, "en").send).toBe("Send to Tailor");
    expect(workshopActionLabels(DEFAULT_VOCABULARY, "en").receive).toBe("Receive from Workshop");
  });

  it("the badge of a paid piece that has not gone yet says it is waiting", () => {
    const stage = flow().fulfillment;
    expect(getFulfillmentBadgeDetails(stage, "ar", "delivery", tailor).label).toBe(
      "بانتظار الإرسال إلى الخياط",
    );
    expect(getFulfillmentBadgeDetails(stage, "en", "delivery", tailor).label).toBe(
      "Waiting to send to Tailor",
    );
  });
});
