import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";

// What a shopper sees of an order they placed: the thank-you page's receipt, read from the order
// id only while the order is fresh, and the tracking page, from its number and the phone it was
// placed with. Before, the thank-you page had no number, items, total or invoice, and only a
// signed-in shopper could see an order again.

const state = vi.hoisted(() => ({
  fake: undefined as unknown as { supabase: unknown },
  ip: "1.1.1.1",
}));
vi.mock("@tanstack/react-start", async () =>
  (await import("./helpers/server-fn")).serverFnModule(),
);
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: new Headers({ "cf-connecting-ip": state.ip }) }),
}));
vi.mock("../src/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return state.fake.supabase;
  },
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return state.fake.supabase;
  },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, search, ...rest }: Record<string, unknown>) => (
    <a
      href={`${String(to)}|${JSON.stringify(params)}|${JSON.stringify(search ?? {})}`}
      {...(rest as object)}
    >
      {children as React.ReactNode}
    </a>
  ),
}));

const { receiptOpen, phoneMatches, typedOrderNumber, paymentNote, RECEIPT_WINDOW_MS } =
  await import("../src/features/order-receipt/lib/order-receipt");
const { OrderReceiptCard } =
  await import("../src/features/order-receipt/components/OrderReceiptCard");
const fns = (await vi.importActual("../src/lib/order-receipt.functions")) as {
  getOrderReceipt: ServerFn;
  trackOrder: ServerFn;
};

const NOW = Date.parse("2026-10-30T12:00:00Z");
const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const order = (overrides: Record<string, unknown> = {}) => ({
  id: ORDER_ID,
  brand_id: "b1",
  invoice_number: 1042,
  created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  channel: "storefront",
  currency: "BHD",
  subtotal: 50,
  discount: 5,
  shipping: 2,
  tax_amount: 0,
  total: 47,
  advance_paid: 0,
  payment_method: "benefit",
  payment_status: "unpaid",
  status: "pending",
  fulfillment_status: "ON_HOLD",
  fulfillment_method: "delivery",
  public_invoice_token: "22222222-2222-4222-8222-222222222222",
  customer_phone_snapshot: "+973 3995 0016",
  customers: null,
  order_items: [
    {
      description: "Silk Abaya",
      name_ar: null,
      name_en: null,
      quantity: 2,
      line_total: 50,
      products: { name: "Silk Abaya", name_ar: "عباية حرير", name_en: "Silk Abaya" },
    },
  ],
  ...overrides,
});

const store = (orderRow: unknown) => {
  state.fake = fakeSupabase({
    rows: {
      brands: { id: "b1" },
      business_settings: {
        currency: "BHD",
        order_number_prefix: "PL-",
        order_number_digits: 5,
      },
      orders: orderRow,
    },
  });
};

describe("the rules", () => {
  it("show a receipt from an order id only for a fresh storefront order", () => {
    const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
    expect(receiptOpen({ created_at: at(5), channel: "storefront" }, NOW)).toBe(true);
    expect(
      receiptOpen({ created_at: at(RECEIPT_WINDOW_MS / 60_000 + 1), channel: "storefront" }, NOW),
    ).toBe(false);
    expect(receiptOpen({ created_at: at(5), channel: "admin" }, NOW)).toBe(false);
    expect(receiptOpen({ created_at: null, channel: "storefront" }, NOW)).toBe(false);
  });

  it("match a phone by its last eight digits, however it was typed", () => {
    expect(phoneMatches("+973 3995 0016", "39950016")).toBe(true);
    expect(phoneMatches("97339950016", "+973-3995-0016")).toBe(true);
    expect(phoneMatches("+973 3995 0016", "39950017")).toBe(false);
    expect(phoneMatches("+973 3995 0016", "0016")).toBe(false);
    expect(phoneMatches(null, "39950016")).toBe(false);
  });

  it("read an order number as the store writes it, or as a bare number", () => {
    const format = { order_number_prefix: "PL-", order_number_digits: 5 };
    expect(typedOrderNumber("PL-01042", format)).toBe(1042);
    expect(typedOrderNumber("#1042", format)).toBe(1042);
    expect(typedOrderNumber(" 1042 ", null)).toBe(1042);
    expect(typedOrderNumber("abc", format)).toBeNull();
    expect(typedOrderNumber("0", format)).toBeNull();
  });

  it("say how the order is paid, in the shopper's language", () => {
    const base = { paid: 0, total: 47 };
    expect(paymentNote({ ...base, paymentMethod: "cod", paymentStatus: "unpaid" }, "en")).toBe(
      "Pay on delivery",
    );
    expect(paymentNote({ ...base, paymentMethod: "benefit", paymentStatus: "unpaid" }, "ar")).toBe(
      "سنؤكد الدفع بعد مراجعة تحويلك",
    );
    expect(
      paymentNote({ paid: 47, total: 47, paymentMethod: "card", paymentStatus: "paid" }, "en"),
    ).toBe("Paid");
    expect(
      paymentNote(
        { paid: 20, total: 47, paymentMethod: "card", paymentStatus: "partially_paid" },
        "en",
      ),
    ).toBe("Deposit paid, the rest on delivery");
  });
});

describe("the thank-you page's receipt", () => {
  beforeEach(() => vi.useRealTimers());

  it("is the order's number, lines, totals and invoice, read for its own store", async () => {
    store(order());
    const receipt = (await fns.getOrderReceipt({
      data: { slug: "pura", orderId: ORDER_ID },
      context: {},
    })) as Parameters<typeof OrderReceiptCard>[0]["receipt"];
    expect(receipt).toMatchObject({ invoiceNumber: 1042, total: 47, currency: "BHD" });

    render(<OrderReceiptCard receipt={receipt} lang="en" slug="pura" trackLink />);
    expect(screen.getByText("PL-01042")).toBeInTheDocument();
    expect(screen.getByText("Silk Abaya")).toBeInTheDocument();
    expect(screen.getByText("Discount")).toBeInTheDocument();
    expect(screen.queryByText("VAT")).toBeNull();
    expect(
      screen.getByText("We will confirm the payment once your transfer is checked"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View invoice/ }).getAttribute("href")).toContain(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(screen.getByRole("link", { name: "Track this order" }).getAttribute("href")).toContain(
      "PL-01042",
    );
  });

  it("shows nothing for an order that is no longer fresh or a staff order", async () => {
    store(order({ created_at: "2020-01-01T00:00:00Z" }));
    expect(
      await fns.getOrderReceipt({ data: { slug: "pura", orderId: ORDER_ID }, context: {} }),
    ).toBeNull();
    store(order({ channel: "admin" }));
    expect(
      await fns.getOrderReceipt({ data: { slug: "pura", orderId: ORDER_ID }, context: {} }),
    ).toBeNull();
  });

  it("asks for the order within the store named in the address", async () => {
    store(order());
    await fns.getOrderReceipt({ data: { slug: "pura", orderId: ORDER_ID }, context: {} });
    const fake = state.fake as unknown as { queries: Array<{ table: string; filters: unknown[] }> };
    const orderQuery = fake.queries.find((q) => q.table === "orders");
    expect(orderQuery?.filters).toContainEqual(["brand_id", "b1"]);
  });
});

describe("the tracking page", () => {
  it("finds an order by its number and the phone it was placed with, at any age", async () => {
    state.ip = "2.2.2.2";
    store(order({ created_at: "2026-01-01T00:00:00Z" }));
    const found = (await fns.trackOrder({
      data: { slug: "pura", number: "PL-01042", phone: "39950016" },
      context: {},
    })) as { found: boolean };
    expect(found.found).toBe(true);
    const wrong = (await fns.trackOrder({
      data: { slug: "pura", number: "PL-01042", phone: "39950099" },
      context: {},
    })) as { found: boolean; limited: boolean };
    expect(wrong).toEqual({ found: false, limited: false });
  });

  it("answers ten tries an hour from one address", async () => {
    state.ip = "3.3.3.3";
    store(order());
    const attempt = () =>
      fns.trackOrder({ data: { slug: "pura", number: "1042", phone: "00000000" }, context: {} });
    for (let i = 0; i < 10; i += 1) await attempt();
    expect(await attempt()).toEqual({ found: false, limited: true });
  });
});
