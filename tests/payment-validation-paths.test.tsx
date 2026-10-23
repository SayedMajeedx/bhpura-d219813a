import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Every screen that records a payment does it through the one server step that records the
// amount: a transfer is approved (the advance of an order placed under an advance rule, or the
// whole total), a balance is collected with the hand-over. No button writes "paid" by itself:
// the list's "Validate payment" once did, and marked an order that had paid only its advance
// as paid in full.

const mocks = vi.hoisted(() => ({
  approveBenefitPayment: vi.fn(
    async (_orderId: string) => ({ advanceOnly: true, alreadyPaid: false }) as object,
  ),
  courierCompleteDelivery: vi.fn(async () => null as unknown),
  updateOrder: vi.fn(async () => undefined),
  invalidateOrders: vi.fn(async () => undefined),
  logActivity: vi.fn(async () => undefined),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));
const ordersData = {
  approveBenefitPayment: mocks.approveBenefitPayment,
  courierCompleteDelivery: mocks.courierCompleteDelivery,
  updateOrder: mocks.updateOrder,
  invalidateOrders: mocks.invalidateOrders,
  ordersKeys: { lists: (brandId: string) => ["orders", brandId, "list"] },
};
vi.mock("../src/lib/data/orders", () => ordersData);
vi.mock("@/lib/data/orders", () => ordersData);
const activityLog = { logActivity: mocks.logActivity };
vi.mock("../src/lib/activity-log", () => activityLog);
vi.mock("@/lib/activity-log", () => activityLog);
const activityLogsData = { invalidateActivityLogs: vi.fn() };
vi.mock("../src/lib/data/activity-logs", () => activityLogsData);
vi.mock("@/lib/data/activity-logs", () => activityLogsData);
const orderLinks = { authenticatedJsonHeaders: async () => ({ Authorization: "Bearer t" }) };
vi.mock("../src/features/orders/actions/order-links", () => orderLinks);
vi.mock("@/features/orders/actions/order-links", () => orderLinks);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

const { renderOrderQueueAction } =
  await import("../src/features/orders/components/order-queue-action");
const { renderOrderPrimaryAction } =
  await import("../src/features/orders/components/order-primary-action");
const { BenefitReceiptReview } =
  await import("../src/features/orders/components/BenefitReceiptReview");
const { transferApprovedMessage, transferRefusedMessage, transferApproved } =
  await import("../src/features/orders/lib/transfer-approval");
const { getOrderWorkflow } = await import("../src/lib/order-workflow");
const { isToPrepare } = await import("../src/features/orders/lib/order-queue");
const { DEFAULT_VOCABULARY } = await import("../src/lib/store-vocabulary");

type QueueCtx = Parameters<typeof renderOrderQueueAction>[0];
type QueueOrder = Parameters<typeof renderOrderQueueAction>[1];
type PrimaryCtx = Parameters<typeof renderOrderPrimaryAction>[0];

/** A storefront order paid by transfer under a 50% advance rule: 14 of 30 is owed up front. */
const transferOrder = {
  id: "11111111-1111-4111-8111-111111111111",
  invoice_number: 1101,
  status: "pending",
  fulfillment_status: "ON_HOLD",
  fulfillment_method: "delivery",
  payment_status: "unpaid",
  payment_method: "benefit",
  total: 30,
  advance_paid: 0,
  order_items: [],
};
const advanceApproved = { payment_status: "partially_paid", advance_paid: 14, status: "confirmed" };

const handleCompleteDelivery = vi.fn(async () => undefined);
const queueCtx = (patch: Record<string, unknown> = {}) =>
  ({
    brandId: "b1",
    handleCompleteDelivery,
    hasMadeToOrder: false,
    isSubmittingCash: false,
    lang: "en",
    qc: { setQueriesData: vi.fn() },
    slug: "pura",
    updatingOrderId: null,
    setUpdatingOrderId: vi.fn(),
    setCashCollectedAmount: vi.fn(),
    setCashModalNotes: vi.fn(),
    setCashModalOrder: vi.fn(),
    setFulfillNotes: vi.fn(),
    setIsFulfillModalOpen: vi.fn(),
    setSelectedCourierId: vi.fn(),
    setSelectedFulfillOrder: vi.fn(),
    vocabulary: DEFAULT_VOCABULARY,
    ...patch,
  }) as unknown as QueueCtx;
const listRow = (patch: Record<string, unknown> = {}) =>
  render(
    <>
      {renderOrderQueueAction(queueCtx(), { ...transferOrder, ...patch } as unknown as QueueOrder)}
    </>,
  );

/** The bodies sent to the status route. */
const statusRequests = () =>
  mocks.fetch.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockClear());
  handleCompleteDelivery.mockClear();
  mocks.approveBenefitPayment.mockResolvedValue({ advanceOnly: true, alreadyPaid: false });
  mocks.courierCompleteDelivery.mockResolvedValue(null);
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ order: {} }) });
  vi.stubGlobal("fetch", mocks.fetch);
});

describe("'Validate payment' on the orders list", () => {
  it("approves the transfer, and never writes a payment status itself", async () => {
    listRow();
    fireEvent.click(screen.getByRole("button", { name: /validate payment/i }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(mocks.approveBenefitPayment).toHaveBeenCalledWith(transferOrder.id);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Advance approved; the balance is collected on delivery",
    );
    expect(mocks.invalidateOrders).toHaveBeenCalled();
  });

  it("says why when the approval is refused, and changes nothing", async () => {
    mocks.approveBenefitPayment.mockRejectedValueOnce(new Error("FORBIDDEN"));
    listRow();
    fireEvent.click(screen.getByRole("button", { name: /validate payment/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Only an admin of this store can approve a payment",
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("for a pickup: approves, then prepares the order without touching its payment", async () => {
    listRow({ fulfillment_method: "pickup" });
    fireEvent.click(screen.getByRole("button", { name: /validate & prepare/i }));

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    expect(mocks.approveBenefitPayment).toHaveBeenCalledWith(transferOrder.id);
    expect(statusRequests()).toEqual([
      { id: transferOrder.id, admin_override: true, fulfillment_status: "READY_FOR_PICKUP" },
    ]);
  });

  it("for a pickup: a refused approval prepares nothing", async () => {
    mocks.approveBenefitPayment.mockRejectedValueOnce(new Error("NOT_A_TRANSFER_ORDER"));
    listRow({ fulfillment_method: "pickup" });
    fireEvent.click(screen.getByRole("button", { name: /validate & prepare/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("is not offered again once the advance is approved", () => {
    listRow(advanceApproved);
    expect(screen.queryByRole("button", { name: /validate/i })).toBeNull();
  });

  it("an appointment's balance is collected with its completion, with the amount", () => {
    const started = { starts_at: new Date(Date.now() - 3_600_000).toISOString() };
    listRow({ ...advanceApproved, fulfillment_method: "appointment", bookings: [started] });
    fireEvent.click(screen.getByRole("button", { name: "Collect & complete" }));

    expect(handleCompleteDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ id: transferOrder.id }),
      16,
      undefined,
      "Service completed",
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("handing an order over from its own page", () => {
  const primary = (order: Record<string, unknown>) =>
    render(
      <>
        {renderOrderPrimaryAction({
          approveBenefitPayment: async () => undefined,
          approvingBenefit: false,
          brandId: "b1",
          isCreationMode: false,
          items: [],
          lang: "en",
          order: { ...transferOrder, ...advanceApproved, ...order },
          orderQ: { refetch: vi.fn(async () => undefined) },
          qc: {},
          storeProfile: { addons: [], vertical: "fashion", modules: { made_to_order: false } },
          vocabulary: DEFAULT_VOCABULARY,
        } as unknown as PrimaryCtx)}
      </>,
    );
  const collected = () => mocks.courierCompleteDelivery.mock.calls;
  const completedWithoutPayment = {
    fulfillment_status: "COMPLETED",
    status: "completed",
    delivered_at: expect.any(String),
    updated_at: expect.any(String),
  };

  it("a delivery with a balance records what was collected", async () => {
    primary({ fulfillment_status: "SHIPPED" });
    fireEvent.click(screen.getByRole("button", { name: "Collect balance & deliver" }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(collected()).toEqual([[transferOrder.id, 16, null]]);
    expect(mocks.updateOrder).not.toHaveBeenCalled();
  });

  it("a pickup with a balance records it too (it used to be handed over still owing)", async () => {
    primary({ fulfillment_method: "pickup", fulfillment_status: "READY_FOR_PICKUP" });
    fireEvent.click(screen.getByRole("button", { name: "Collect balance & hand over" }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(collected()).toEqual([[transferOrder.id, 16, null]]);
    expect(mocks.updateOrder).not.toHaveBeenCalled();
  });

  it("a service with a balance records it with its completion", async () => {
    const started = { starts_at: new Date(Date.now() - 3_600_000).toISOString() };
    primary({ fulfillment_method: "appointment", bookings: [started] });
    fireEvent.click(screen.getByRole("button", { name: "Collect balance & complete" }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(collected()).toEqual([[transferOrder.id, 16, null]]);
    expect(mocks.updateOrder).not.toHaveBeenCalled();
  });

  it("an order with nothing left to collect is completed without touching its payment", async () => {
    primary({ payment_status: "paid", advance_paid: 30, fulfillment_status: "SHIPPED" });
    fireEvent.click(screen.getByRole("button", { name: "Mark Delivered" }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(mocks.updateOrder).toHaveBeenCalledWith("b1", transferOrder.id, completedWithoutPayment);
    expect(collected()).toEqual([]);
  });

  it("says so when the server refuses, and reports no success", async () => {
    mocks.courierCompleteDelivery.mockResolvedValueOnce(new Error("Order not found"));
    primary({ fulfillment_status: "SHIPPED" });
    fireEvent.click(screen.getByRole("button", { name: "Collect balance & deliver" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});

describe("the receipt card on the order page", () => {
  const card = (order: Record<string, unknown>) =>
    render(
      <BenefitReceiptReview
        approveBenefitPayment={vi.fn()}
        approvingBenefit={false}
        lang="en"
        order={{ ...transferOrder, ...order } as never}
        receiptViewQ={{ isLoading: false, data: { url: "https://media.test/r.jpg" } } as never}
        rejectBenefitPayment={vi.fn()}
        rejectReason=""
        rejectReasonOpen={false}
        rejectingBenefit={false}
        setRejectReason={vi.fn()}
        setRejectReasonOpen={vi.fn()}
      />,
    );

  it("offers to approve or reject a transfer that is waiting", () => {
    card({});
    expect(screen.getByText("Pending verification")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve Payment" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject Receipt" })).toBeTruthy();
  });

  it("an approved advance is verified: it cannot be rejected (that would cancel a paid order)", () => {
    card(advanceApproved);
    expect(screen.getByText("Advance verified")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reject Receipt" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve Payment" })).toBeNull();
  });

  it("a full payment reads 'Verified'", () => {
    card({ payment_status: "paid", advance_paid: 30 });
    expect(screen.getByText("Verified")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reject Receipt" })).toBeNull();
  });
});

describe("what staff read", () => {
  it("says whether the advance or the whole payment was approved", () => {
    expect(transferApprovedMessage({ advanceOnly: true, alreadyPaid: false }, "en")).toContain(
      "balance is collected on delivery",
    );
    expect(transferApprovedMessage({ advanceOnly: false, alreadyPaid: false }, "en")).toBe(
      "Payment verified and approved",
    );
    // A booking's transfer paid its deposit: the rest follows the booking's terms, not delivery.
    expect(
      transferApprovedMessage({ advanceOnly: true, alreadyPaid: false }, "en", {
        appointment: true,
      }),
    ).toBe("Deposit approved and the date confirmed; the rest is collected by the booking terms");
    expect(transferApprovedMessage({ advanceOnly: false, alreadyPaid: true }, "en")).toBe(
      "This payment was already approved",
    );
    expect(transferApprovedMessage({ advanceOnly: true, alreadyPaid: false }, "ar")).toContain(
      "العربون",
    );
  });

  it("puts a refusal in words, never a code", () => {
    expect(transferRefusedMessage(new Error("FORBIDDEN"), "en")).toMatch(/only an admin/i);
    expect(transferRefusedMessage({ message: "NOT_A_TRANSFER_ORDER" }, "ar")).toContain("التحويل");
    expect(transferRefusedMessage(new Error("connection reset"), "en")).toBe(
      "Could not approve the payment",
    );
    expect(transferRefusedMessage(null, "ar")).toBe("تعذر اعتماد الدفع");
  });

  it("knows an approved transfer by its payment status", () => {
    expect(["paid", "partially_paid", "partial"].map((s) => transferApproved(s))).toEqual([
      true,
      true,
      true,
    ]);
    expect(["unpaid", "", null, undefined].map((s) => transferApproved(s))).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("an order whose advance was approved", () => {
  const made = { ...transferOrder, ...advanceApproved, fulfillment_status: "NEEDS_PACKING" };

  it("is not waiting for a payment: it is to be prepared, like a cash-on-delivery order", () => {
    const workflow = getOrderWorkflow(made, { productionStages: false });
    expect(workflow.awaitingPayment).toBe(false);
    expect(workflow.outstanding).toBe(16);
    expect(isToPrepare(workflow, false)).toBe(true);
  });

  it("while a transfer nobody approved is still waiting, and is not to be prepared", () => {
    const workflow = getOrderWorkflow(transferOrder, { productionStages: false });
    expect(workflow.awaitingPayment).toBe(true);
    expect(workflow.nextAction).toBe("validate_payment");
    expect(isToPrepare(workflow, false)).toBe(false);
  });
});
