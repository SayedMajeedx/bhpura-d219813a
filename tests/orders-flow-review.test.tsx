import React, { useState } from "react";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../src/components/ui/dropdown-menu";

// The owner's review of the orders flow (2026-10-28): a code's removal keeps the store's offers
// and the shopper's points, the profit and cost figures are for staff who see the finances, the
// list's workshop and digital steps are the order page's, the stage menu offers only what an
// order's kind can do, and the payment log writes the order's own currency.

const mocks = vi.hoisted(() => ({
  updateOrder: vi.fn(async () => undefined),
  courierCompleteDelivery: vi.fn(async () => null as unknown),
  invalidateOrders: vi.fn(async () => undefined),
  logActivity: vi.fn(async () => undefined),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
  fetch: vi.fn(),
  sendProps: vi.fn(),
  receiveProps: vi.fn(),
  profile: { canViewFinancials: true },
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, info: mocks.toastInfo, error: mocks.toastError },
}));
const ordersData = {
  approveBenefitPayment: vi.fn(),
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
const tailorButtons = {
  SendToTailorButton: (props: { orderId: string; children: React.ReactNode }) => {
    mocks.sendProps(props);
    return <button>{props.children}</button>;
  },
  ReceiveFromTailorButton: (props: { children: React.ReactNode }) => {
    mocks.receiveProps(props);
    return <button>{props.children}</button>;
  },
};
vi.mock("../src/features/supplier-orders/components/TailorButtons", () => tailorButtons);
vi.mock("@/features/supplier-orders/components/TailorButtons", () => tailorButtons);
const profileContext = {
  useProfile: () => mocks.profile,
  useProfileOptional: () => mocks.profile,
};
vi.mock("../src/lib/profile-context", () => profileContext);
vi.mock("@/lib/profile-context", () => profileContext);

const { discountParts, keptDiscount } = await import("../src/features/orders/lib/discount-parts");
const { usePromoContextGuard } =
  await import("../src/features/orders/hooks/use-promo-context-guard");
const { orderTotals } = await import("../src/features/orders/lib/order-editor");
const { stageMenuEntries, stageChangeWarning } =
  await import("../src/features/orders/lib/stage-menu");
const { OrderStageMenuItems } =
  await import("../src/features/orders/components/OrderStageMenuItems");
const { renderOrderQueueAction } =
  await import("../src/features/orders/components/order-queue-action");
const { renderOrderPrimaryAction } =
  await import("../src/features/orders/components/order-primary-action");
const { OrderFinancialCard } = await import("../src/features/orders/components/OrderFinancialCard");
const { useOrderPaymentDetails } =
  await import("../src/features/orders/hooks/use-order-payment-details");
const { DEFAULT_VOCABULARY } = await import("../src/lib/store-vocabulary");

type QueueCtx = Parameters<typeof renderOrderQueueAction>[0];
type QueueOrder = Parameters<typeof renderOrderQueueAction>[1];
type PrimaryCtx = Parameters<typeof renderOrderPrimaryAction>[0];

beforeEach(() => {
  Object.values(mocks).forEach((m) => typeof m === "function" && "mockClear" in m && m.mockClear());
  mocks.profile.canViewFinancials = true;
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ order: {} }) });
  vi.stubGlobal("fetch", mocks.fetch);
});

describe("what an order's discount is made of", () => {
  const order = { discount: 20, offer_discount: 8, loyalty_discount: 2 };

  it("splits it into the offers, the points and what is left for a code", () => {
    expect(discountParts(order)).toEqual({ offers: 8, points: 2, code: 10, total: 20 });
    expect(keptDiscount(order)).toBe(10);
  });

  it("never reads more offers and points than the order's discount", () => {
    expect(discountParts({ discount: 5, offer_discount: 8, loyalty_discount: 2 })).toEqual({
      offers: 5,
      points: 0,
      code: 0,
      total: 5,
    });
    expect(keptDiscount(null)).toBe(0);
  });

  it("a promo code taken off for new lines leaves the offers and points", () => {
    const initial = { ...order, promo_code: "EID10", promo_code_id: "p1" };
    const items = [{ variant_id: "v1", quantity: 1, line_total: 50 }];
    const { result } = renderHook(() => {
      const [order, setOrder] = useState<Record<string, unknown> | null>(initial);
      const [promo, setPromo] = useState<{ code: string; id: string; amount: number } | null>({
        code: "EID10",
        id: "p1",
        amount: 10,
      });
      const [list, setList] = useState(items);
      const ref = React.useRef<string | null>(null);
      usePromoContextGuard({
        appliedPromo: promo,
        contextRef: ref,
        customerId: "c1",
        items: list as never,
        lang: "en",
        setAppliedPromo: setPromo,
        setOrder: setOrder as never,
        setPromoInput: () => undefined,
      });
      return { order, promo, setList };
    });
    expect(result.current.promo).not.toBeNull();
    React.act(() => result.current.setList([{ variant_id: "v1", quantity: 2, line_total: 100 }]));
    expect(result.current.promo).toBeNull();
    expect(result.current.order).toMatchObject({
      discount: 10,
      promo_code: null,
      promo_code_id: null,
    });
    expect(mocks.toastInfo).toHaveBeenCalled();
  });
});

describe("what the goods sold for", () => {
  it("is the lines after the discount, with neither the delivery fee nor the tax", () => {
    const line = { line_total: 100 } as never;
    const exclusive = orderTotals([line], { discount: 10, shipping: 5, tax_rate: 10 }, false);
    expect(exclusive.total).toBeCloseTo(104);
    expect(exclusive.netSales).toBe(90);
    const inclusive = orderTotals([line], { discount: 10, shipping: 5, tax_rate: 10 }, true);
    expect(inclusive.netSales).toBeCloseTo(90 - 90 + 90 / 1.1);
    expect(orderTotals([line], { discount: 500 }, false).netSales).toBe(0);
  });
});

describe("the order's cost and profit are for staff who see the finances", () => {
  const card = () =>
    render(
      <OrderFinancialCard
        {...({
          appliedPromo: null,
          approveBenefitPayment: vi.fn(),
          approvingBenefit: false,
          bomItemsQ: { data: [] },
          checkingPromo: false,
          currency: "BHD",
          discountMode: "fixed",
          discountPercentInput: "",
          isEditingFees: false,
          isReadOnly: true,
          items: [
            { line_total: 100, quantity: 1, unit_cost: 40, description: "Abaya", location: "main" },
          ],
          lang: "en",
          lastNonZeroTaxRate: 10,
          mobileTab: "items",
          order: {
            id: "o1",
            payment_method: "cod",
            currency: "BHD",
            order_date: "2026-10-28",
            discount: 0,
            shipping: 10,
            tax_rate: 10,
            total: 120,
            advance_paid: 0,
            status: "pending",
            payment_status: "unpaid",
          },
          packagingMaterialsQ: { data: [] },
          paymentBadge: "unpaid",
          productsQ: { data: [] },
          promoInput: "",
          receiptViewQ: { isLoading: false, data: null },
          rejectReason: "",
          rejectReasonOpen: false,
          rejectingBenefit: false,
          t: (key: string) => key,
          totals: orderTotals(
            [{ line_total: 100 } as never],
            { shipping: 10, tax_rate: 10 },
            false,
          ),
          variantsQ: { data: [] },
        } as never)}
      />,
    );

  it("shows the cost and a profit worked on the goods' price, not the total with VAT and delivery", () => {
    card();
    expect(screen.getByText("What this order cost to make and pack")).toBeTruthy();
    // 100 sold for, 40 cost: 60. The total (120) would have said 80.
    expect(screen.getByText(/60\.000/)).toBeTruthy();
    expect(screen.queryByText(/80\.000/)).toBeNull();
  });

  it("shows neither to staff without the permission", () => {
    mocks.profile.canViewFinancials = false;
    card();
    expect(screen.queryByText("What this order cost to make and pack")).toBeNull();
    expect(screen.queryByText(/Estimated gross profit/)).toBeNull();
  });
});

describe("the stage menu offers what this kind of order can do", () => {
  const keys = (method: string, workshop = false) =>
    stageMenuEntries(
      { fulfillment_method: method, fulfillment_status: "PENDING" },
      { workshop },
    ).map((entry) => entry.key);

  it("a delivery is shipped, never made ready for pickup", () => {
    expect(keys("delivery")).toEqual(["packing", "shipped", "complete", "hold", "cancel"]);
  });
  it("a pickup is made ready, never shipped", () => {
    expect(keys("pickup")).toEqual(["packing", "ready_pickup", "complete", "hold", "cancel"]);
  });
  it("a digital order is not packed, shipped or picked up", () => {
    expect(keys("digital")).toEqual(["complete", "hold", "cancel"]);
  });
  it("an appointment is done or cancelled", () => {
    expect(keys("appointment")).toEqual(["complete", "cancel"]);
  });
  it("the workshop steps follow the store's production stages", () => {
    expect(keys("delivery", true).slice(0, 2)).toEqual(["workshop_sent", "workshop_received"]);
  });

  it("draws those entries with the current stage ticked and the words of the order's kind", () => {
    const onChoose = vi.fn();
    render(
      <OrderStageMenuItems
        currentStage="PENDING"
        lang="en"
        method="digital"
        onChoose={onChoose}
        vocabulary={DEFAULT_VOCABULARY}
        workshop={false}
      />,
      {
        wrapper: ({ children }) => (
          <DropdownMenu open>
            <DropdownMenuTrigger>menu</DropdownMenuTrigger>
            <DropdownMenuContent>{children}</DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    );
    expect(screen.queryByText("Mark Shipped")).toBeNull();
    fireEvent.click(screen.getByText("Mark digital order delivered"));
    expect(onChoose).toHaveBeenCalledWith("completed", "COMPLETED");
  });

  const money = (n: number) => `BHD ${n.toFixed(3)}`;
  it("warns that completing an order that still owes records no payment", () => {
    const warning = stageChangeWarning(
      { total: 30, advance_paid: 14, payment_status: "partially_paid" },
      "COMPLETED",
      "en",
      money,
    );
    expect(warning).toContain("BHD 16.000");
    expect(
      stageChangeWarning({ total: 30, payment_status: "paid" }, "COMPLETED", "en", money),
    ).toBe(null);
  });
  it("warns that cancelling a paid order does not return the money", () => {
    const warning = stageChangeWarning(
      { total: 30, advance_paid: 14, payment_status: "partially_paid" },
      "CANCELLED",
      "en",
      money,
    );
    expect(warning).toContain("BHD 14.000");
    expect(warning).toContain("refund");
    expect(
      stageChangeWarning({ total: 30, payment_status: "unpaid" }, "CANCELLED", "ar", money),
    ).toContain("المخزون");
    expect(
      stageChangeWarning(
        { total: 30, payment_status: "unpaid", fulfillment_method: "appointment" },
        "CANCELLED",
        "en",
        money,
      ),
    ).toContain("booking");
  });
});

describe("the list's workshop and digital steps", () => {
  const order = (patch: Record<string, unknown>) =>
    ({
      id: "11111111-1111-4111-8111-111111111111",
      invoice_number: 1,
      status: "pending",
      fulfillment_status: "NEEDS_PACKING",
      fulfillment_method: "delivery",
      payment_status: "paid",
      payment_method: "card",
      total: 30,
      advance_paid: 30,
      order_items: [
        {
          id: "l1",
          description: "Abaya",
          quantity: 1,
          unit_price: 30,
          line_total: 30,
          location: "custom",
        },
      ],
      ...patch,
    }) as unknown as QueueOrder;
  const ctx = (patch: Record<string, unknown> = {}) =>
    ({
      brandId: "b1",
      handleCompleteDelivery: vi.fn(),
      hasMadeToOrder: true,
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

  it("'send to workshop' is the order page's: it asks which supplier, not just moves the stage", () => {
    render(<>{renderOrderQueueAction(ctx(), order({}))}</>);
    expect(mocks.sendProps).toHaveBeenCalledTimes(1);
    const props = mocks.sendProps.mock.calls[0][0];
    expect(props.orderId).toBe("11111111-1111-4111-8111-111111111111");
    expect(props.lines).toHaveLength(1);
  });

  it("'received from workshop' is the order page's too", () => {
    render(<>{renderOrderQueueAction(ctx(), order({ fulfillment_status: "SENT_TO_TAILOR" }))}</>);
    expect(mocks.receiveProps).toHaveBeenCalledTimes(1);
  });

  it("a paid digital order is marked delivered from the list in one tap", async () => {
    render(
      <>
        {renderOrderQueueAction(
          ctx({ hasMadeToOrder: false }),
          order({ fulfillment_method: "digital", order_items: [] }),
        )}
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark delivered" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    const body = JSON.parse(String((mocks.fetch.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({ fulfillment_status: "COMPLETED", status: "completed" });
  });

  it("and from the order page, which had no button for it", async () => {
    render(
      <>
        {renderOrderPrimaryAction({
          approveBenefitPayment: async () => undefined,
          approvingBenefit: false,
          brandId: "b1",
          isCreationMode: false,
          items: [],
          lang: "en",
          order: order({ fulfillment_method: "digital", order_items: [] }),
          orderQ: { refetch: vi.fn(async () => undefined) },
          qc: {},
          storeProfile: { addons: [], vertical: "print", modules: { made_to_order: false } },
          vocabulary: DEFAULT_VOCABULARY,
        } as unknown as PrimaryCtx)}
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark digital order delivered" }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(mocks.updateOrder).toHaveBeenCalledWith(
      "b1",
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({ fulfillment_status: "COMPLETED", status: "completed" }),
    );
  });
});

describe("the payment log writes the order's own currency", () => {
  it("a manual payment edit on a Saudi store's order says SAR, never BHD", async () => {
    const { result } = renderHook(() =>
      useOrderPaymentDetails({
        brandId: "b1",
        initialSnapshotRef: { current: null },
        order: {
          id: "11111111-1111-4111-8111-111111111111",
          currency: "SAR",
          payment_status: "unpaid",
          payment_method: "cod",
          advance_paid: 0,
          payment_reference: null,
        } as never,
        orderQ: { refetch: vi.fn(async () => undefined) } as never,
        qc: { invalidateQueries: vi.fn() } as never,
        setOrder: vi.fn(),
      }),
    );
    await result.current.handleSavePaymentDetails({
      payment_status: "partial",
      payment_method: "cod",
      advance_paid: 15,
      payment_reference: "",
    } as never);
    const entry = mocks.logActivity.mock.calls[0][0] as { en: string; ar: string };
    expect(entry.en).toMatch(/SAR/);
    expect(entry.en).not.toMatch(/BHD/);
    expect(entry.ar).not.toMatch(/د\.ب/);
  });
});
