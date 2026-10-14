import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Telling the customer that work on a made-to-order piece has started: the message, when the
// order editor offers it, and that a person sends it (WhatsApp opens; nothing is sent by itself).

const mocks = vi.hoisted(() => ({
  logActivity: vi.fn(async () => undefined),
  updateOrder: vi.fn(async () => undefined),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));
const activityLog = vi.hoisted(() => ({ logActivity: mocks.logActivity }));
vi.mock("../src/lib/activity-log", () => activityLog);
vi.mock("@/lib/activity-log", () => activityLog);
const ordersData = vi.hoisted(() => ({
  updateOrder: mocks.updateOrder,
  invalidateOrders: vi.fn(),
}));
vi.mock("../src/lib/data/orders", () => ordersData);
vi.mock("@/lib/data/orders", () => ordersData);
const activityLogsData = vi.hoisted(() => ({ invalidateActivityLogs: vi.fn() }));
vi.mock("../src/lib/data/activity-logs", () => activityLogsData);
vi.mock("@/lib/data/activity-logs", () => activityLogsData);

import { workStartedMessage } from "../src/features/orders/lib/stage-messages";
import { createOrderDocumentActions } from "../src/features/orders/actions/order-document-actions";
import { renderOrderPrimaryAction } from "../src/features/orders/components/order-primary-action";
import { DEFAULT_VOCABULARY } from "../src/lib/store-vocabulary";

type ActionsInput = Parameters<typeof createOrderDocumentActions>[0];
type PrimaryInput = Parameters<typeof renderOrderPrimaryAction>[0];

const ESTIMATE = "Tailored pieces take one week from confirmation.";
const tailoredLine = {
  product_id: "p1",
  variant_id: "v1",
  description: "Abaya",
  quantity: 1,
  unit_price: 30,
  customizations: [],
  customization_total: 0,
  line_total: 30,
  location: "custom",
  selected_variant: { size: null, color: "Black" },
  custom_field_values: [{ key: "length", label_ar: "الطول", label_en: "Length", value: "56" }],
};
const paidOrder = {
  id: "11111111-1111-4111-8111-111111111111",
  invoice_number: 1042,
  status: "confirmed",
  fulfillment_status: "NEEDS_PACKING",
  fulfillment_method: "delivery",
  payment_status: "paid",
  payment_method: "card",
  total: 30,
  advance_paid: 30,
  customer_name_snapshot: "Fatima",
  customer_phone_snapshot: "33112233",
  order_date: "2026-10-11",
};

function actions(overrides: {
  order?: Record<string, unknown>;
  items?: unknown[];
  madeToOrder?: boolean;
  lang?: "ar" | "en";
}) {
  return createOrderDocumentActions({
    order: { ...paidOrder, ...overrides.order },
    items: overrides.items ?? [tailoredLine],
    t: (key: string) => key,
    lang: overrides.lang ?? "en",
    settingsQ: {
      data: { business_name: "ZH", delivery_estimate_tailored_en: ESTIMATE },
    },
    productsQ: { data: [{ id: "p1", item_kind: "product" }] },
    storeProfile: {
      addons: [],
      vertical: "abayas",
      modules: { made_to_order: overrides.madeToOrder ?? true },
    },
    totals: { subtotal: 30, discount: 0, taxAmount: 0, shipping: 0, total: 30 },
    currency: "BHD",
    vocabulary: { workshop: { ar: "الورشة", en: "Tailor" } },
    brand: { name_ar: "زد إتش", name_en: "ZH Abayas" },
  } as unknown as ActionsInput).workshop;
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockClear());
  vi.mocked(window.open).mockClear();
});

describe("the message", () => {
  it("greets the customer, names the order and the store, and promises a follow-up", () => {
    expect(
      workStartedMessage({
        isAr: false,
        brandName: "ZH Abayas",
        customerName: "Fatima",
        invoiceNumber: 1042,
      }),
    ).toBe(
      [
        "Hello Fatima,",
        "We have started making your order #1042 from ZH Abayas.",
        "We will contact you as soon as it is ready. Thank you.",
      ].join("\n"),
    );
  });

  it("adds the store's own sentence about how long a piece takes", () => {
    const text = workStartedMessage({
      isAr: false,
      brandName: "ZH",
      invoiceNumber: 7,
      estimate: ` ${ESTIMATE} `,
    });
    expect(text.split("\n")).toEqual([
      "Hello,",
      "We have started making your order #7 from ZH.",
      ESTIMATE,
      "We will contact you as soon as it is ready. Thank you.",
    ]);
  });

  it("is written in Arabic for an Arabic admin", () => {
    const text = workStartedMessage({
      isAr: true,
      brandName: "زد إتش",
      customerName: "فاطمة",
      invoiceNumber: 1042,
    });
    expect(text).toContain("مرحباً فاطمة،");
    expect(text).toContain("بدأنا العمل على طلبك رقم 1042 من زد إتش.");
  });
});

describe("when the order editor offers it", () => {
  it("opens WhatsApp to the customer with the message ready, and notes it on the order", () => {
    const workshop = actions({});
    expect(workshop.tellCustomerWorkStarted).toBeTypeOf("function");
    workshop.tellCustomerWorkStarted?.();

    const [url] = vi.mocked(window.open).mock.calls[0];
    expect(String(url).startsWith("https://wa.me/97333112233?text=")).toBe(true);
    const text = decodeURIComponent(String(url).split("?text=")[1]);
    expect(text).toContain("Hello Fatima,");
    expect(text).toContain("order #1042 from ZH Abayas");
    expect(text).toContain(ESTIMATE);
    expect(mocks.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "customer_message", order_id: paidOrder.id }),
    );
  });

  it("uses the store's Arabic name for an Arabic admin", () => {
    actions({ lang: "ar" }).tellCustomerWorkStarted?.();
    const [url] = vi.mocked(window.open).mock.calls[0];
    expect(decodeURIComponent(String(url))).toContain("من زد إتش.");
  });

  it("is not offered without a number WhatsApp can reach", () => {
    expect(
      actions({ order: { customer_phone_snapshot: "" } }).tellCustomerWorkStarted,
    ).toBeUndefined();
    expect(
      actions({ order: { customer_phone_snapshot: "123" } }).tellCustomerWorkStarted,
    ).toBeUndefined();
  });

  it("is not offered for an order with nothing to make, or by a store that does not make to order", () => {
    const readyLine = { ...tailoredLine, location: "main", custom_field_values: [] };
    expect(actions({ items: [readyLine] }).tellCustomerWorkStarted).toBeUndefined();
    expect(actions({ items: [readyLine] }).printJobSheet).toBeUndefined();
    expect(actions({ madeToOrder: false }).tellCustomerWorkStarted).toBeUndefined();
  });

  it("knows when the piece is with the workshop", () => {
    expect(actions({}).atWorkshop).toBe(false);
    expect(
      actions({ order: { status: "sent_to_tailor", fulfillment_status: "SENT_TO_TAILOR" } })
        .atWorkshop,
    ).toBe(true);
    expect(
      actions({
        order: { status: "received_from_tailor", fulfillment_status: "RECEIVED_FROM_TAILOR" },
      }).atWorkshop,
    ).toBe(false);
  });
});

describe("right after sending the piece to the workshop", () => {
  function primary(tell?: () => void) {
    const refetch = vi.fn(async () => undefined);
    return renderOrderPrimaryAction({
      approveBenefitPayment: async () => undefined,
      approvingBenefit: false,
      brandId: "b1",
      isCreationMode: false,
      items: [tailoredLine],
      lang: "en",
      order: paidOrder,
      orderQ: { refetch },
      qc: {},
      storeProfile: { addons: [], vertical: "abayas", modules: { made_to_order: true } },
      vocabulary: DEFAULT_VOCABULARY,
      workshop: { tellCustomerWorkStarted: tell },
    } as unknown as PrimaryInput);
  }

  it("the confirmation offers to tell the customer", async () => {
    const tell = vi.fn();
    render(<>{primary(tell)}</>);
    fireEvent.click(screen.getByRole("button", { name: /send to/i }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(mocks.updateOrder).toHaveBeenCalledWith(
      "b1",
      paidOrder.id,
      expect.objectContaining({ fulfillment_status: "SENT_TO_TAILOR" }),
    );
    const options = mocks.toastSuccess.mock.calls[0][1];
    expect(options.action.label).toBe("Tell the customer");
    options.action.onClick();
    expect(tell).toHaveBeenCalledTimes(1);
  });

  it("the confirmation is plain when the customer cannot be reached", async () => {
    render(<>{primary(undefined)}</>);
    fireEvent.click(screen.getByRole("button", { name: /send to/i }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(mocks.toastSuccess.mock.calls[0][1]).toBeUndefined();
  });
});
