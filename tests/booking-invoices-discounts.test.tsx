import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bookingInvoiceOf,
  invoiceLink,
  paymentBadge,
  whatsAppToCustomer,
} from "../src/features/bookings/lib/booking-invoice";

// A booking's invoice (its order) and its discount on the admin side, rendered
// with the data layer faked: the card, the by-hand discount, and the store's
// offers dialog.

const state = vi.hoisted(() => ({
  rules: [] as Array<Record<string, unknown>>,
  saveDiscountRule: vi.fn(async () => undefined),
  setDiscountRuleActive: vi.fn(async () => undefined),
  deleteDiscountRule: vi.fn(async () => undefined),
  copied: [] as string[],
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: React.ReactNode;
    to: string;
    params: Record<string, string>;
  }) => <a href={`${to}|${params.slug}|${params.id}`}>{children}</a>,
}));
const discountsData = {
  bookingDiscountsQueries: {
    list: () => ({ queryKey: ["bd-test", "list"], queryFn: async () => state.rules }),
  },
  invalidateBookingDiscounts: vi.fn(async () => undefined),
  saveDiscountRule: state.saveDiscountRule,
  setDiscountRuleActive: state.setDiscountRuleActive,
  deleteDiscountRule: state.deleteDiscountRule,
};
vi.mock("../src/lib/data/booking-discounts", () => discountsData);
vi.mock("@/lib/data/booking-discounts", () => discountsData);
const catalogData = {
  catalogQueries: {
    products: () => ({
      queryKey: ["bd-test", "products"],
      queryFn: async () => [
        {
          id: "p1",
          name: "Photo booth",
          name_en: "Photo booth",
          name_ar: "فوتوبوث",
          is_active: true,
        },
        { id: "p2", name: "Prints", name_en: "Prints", name_ar: null, is_active: true },
        { id: "p3", name: "Old", name_en: "Old", name_ar: null, is_active: false },
      ],
    }),
  },
};
vi.mock("../src/lib/data/catalog", () => catalogData);
vi.mock("@/lib/data/catalog", () => catalogData);

const { BookingCard } = await import("../src/features/bookings/components/BookingCard");
const { BookingDiscountEditor } =
  await import("../src/features/bookings/components/BookingDiscountEditor");
const { BookingDiscountsDialog } =
  await import("../src/features/bookings/components/BookingDiscountsDialog");

const order = {
  id: "o1",
  invoice_number: 1042,
  public_invoice_token: "tok-123",
  status: "confirmed",
  payment_status: "unpaid",
  total: 41.25,
  advance_paid: 0,
  currency: "BHD",
};
const booking = (over: Record<string, unknown> = {}) =>
  ({
    id: "b1",
    reference: "BK-AAAAAA",
    status: "confirmed",
    event_date: "2026-10-12",
    starts_at: "2026-10-12T15:00:00Z",
    ends_at: "2026-10-12T18:00:00Z",
    customer_name: "Sara",
    customer_phone: "3900 1122",
    customer_email: "sara@example.com",
    location: { area: "Juffair" },
    notes: "Gold backdrop",
    source: "storefront",
    total: 41.25,
    travel_fee: 5,
    deposit_amount: 0,
    discount_amount: 15,
    discount_label_en: "Last-minute offer",
    discount_label_ar: "عرض اللحظة الأخيرة",
    cancel_reason: null,
    order_id: "o1",
    orders: order,
    booking_items: [
      {
        id: "i1",
        product_id: "p1",
        name_en: "Photo booth",
        name_ar: "فوتوبوث",
        quantity: 1,
        unit_price: 55,
        line_total: 55,
      },
    ],
    ...over,
  }) as never;

const page = (over: Record<string, unknown> = {}) =>
  ({
    isAr: false,
    brand: { id: "b1", slug: "booth", name_en: "Booth", name_ar: null },
    createInvoice: vi.fn(),
    invoicePending: false,
    setDiscount: vi.fn(),
    discountPending: false,
    ...over,
  }) as never;

const renderCard = (b: unknown, p = page()) =>
  render(
    <BookingCard
      page={p}
      booking={b as never}
      isAr={false}
      currency="BHD"
      timezone="Asia/Bahrain"
      busy={false}
      onStatus={vi.fn()}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  state.rules = [];
  state.copied = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text: string) => void state.copied.push(text) },
  });
});

describe("a booking's invoice", () => {
  it("is read from the order the booking was loaded with", () => {
    expect(bookingInvoiceOf({ orders: order })).toMatchObject({
      orderId: "o1",
      number: 1042,
      token: "tok-123",
      total: 41.25,
    });
    expect(bookingInvoiceOf({ orders: [order] })?.number).toBe(1042);
    expect(bookingInvoiceOf({ orders: null })).toBeNull();
    expect(bookingInvoiceOf({})).toBeNull();
  });

  it("says how far it is paid", () => {
    const badge = (paymentStatus: string, paid = 0) =>
      paymentBadge({ paymentStatus, paid, total: 50 }, false);
    expect(badge("paid")).toEqual({ text: "Paid", tone: "success" });
    expect(badge("unpaid").text).toBe("Unpaid");
    expect(badge("partially_paid", 10).text).toBe("Part paid");
    expect(badge("unpaid", 10).text).toBe("Part paid");
    expect(paymentBadge({ paymentStatus: "paid", paid: 0, total: 1 }, true).text).toBe("مدفوع");
  });

  it("links to the public invoice and the customer's WhatsApp", () => {
    expect(invoiceLink("https://pura.example/", "tok")).toBe("https://pura.example/invoice/tok");
    expect(whatsAppToCustomer("3900 1122", "hi there")).toBe(
      "https://wa.me/97339001122?text=hi%20there",
    );
    expect(whatsAppToCustomer("+966 55 512 3456", "x")).toContain("wa.me/966555123456");
    expect(whatsAppToCustomer("12", "x")).toBeNull();
    expect(whatsAppToCustomer(null, "x")).toBeNull();
  });
});

describe("the booking card", () => {
  it("shows the customer, the money, where it came from and its invoice", () => {
    renderCard(booking({ deposit_amount: 10 }));
    expect(screen.getByText("Sara")).toBeInTheDocument();
    expect(screen.getByText("sara@example.com")).toBeInTheDocument();
    expect(screen.getByText("Gold backdrop")).toBeInTheDocument();
    expect(screen.getByText("From the store")).toBeInTheDocument();
    expect(screen.getByText("Last-minute offer")).toBeInTheDocument();
    expect(screen.getByText(/Deposit:/)).toBeInTheDocument();
    expect(screen.getByText("Invoice #1042")).toBeInTheDocument();
    expect(screen.getByText("Unpaid")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open order/ })).toHaveAttribute(
      "href",
      "/admin/b/$slug/orders/$id|booth|o1",
    );
  });

  it("copies the public invoice link and sends it on WhatsApp", async () => {
    renderCard(booking());
    fireEvent.click(screen.getByRole("button", { name: /Copy link/ }));
    await waitFor(() =>
      expect(state.copied).toEqual([`${window.location.origin}/invoice/tok-123`]),
    );
    const whatsapp = screen.getByRole("link", { name: /Send on WhatsApp/ });
    const href = decodeURIComponent(whatsapp.getAttribute("href")!);
    expect(href.startsWith("https://wa.me/97339001122?text=")).toBe(true);
    expect(href).toContain("BK-AAAAAA");
    expect(href).toContain("/invoice/tok-123");
    expect(href).toContain("Hello Sara");
  });

  it("offers to invoice a booking that has no order, a request as a quote", () => {
    const p = page();
    const { unmount } = renderCard(booking({ order_id: null, orders: null }), p);
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    expect(
      (p as unknown as { createInvoice: ReturnType<typeof vi.fn> }).createInvoice,
    ).toHaveBeenCalledTimes(1);
    unmount();

    renderCard(booking({ order_id: null, orders: null, status: "requested" }));
    expect(screen.getByRole("button", { name: "Create quote / invoice" })).toBeInTheDocument();
  });

  it("asks the store to check a BenefitPay receipt, and lets it confirm or release the held day", () => {
    const onStatus = vi.fn();
    render(
      <BookingCard
        page={page()}
        booking={
          booking({
            status: "hold",
            orders: { ...order, status: "pending_verification" },
          }) as never
        }
        isAr={false}
        currency="BHD"
        timezone="Asia/Bahrain"
        busy={false}
        onStatus={onStatus}
      />,
    );
    expect(screen.getByText("Awaiting payment")).toBeInTheDocument();
    expect(screen.getByText(/BenefitPay receipt is waiting/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Review the receipt and approve/ })).toHaveAttribute(
      "href",
      "/admin/b/$slug/orders/$id|booth|o1",
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm (paid)" }));
    expect(onStatus).toHaveBeenCalledWith("confirmed");
    fireEvent.click(screen.getByRole("button", { name: "Release the day" }));
    expect(onStatus).toHaveBeenCalledWith("cancelled");
  });

  it("has no invoice for a held day or a cancelled booking", () => {
    const { unmount } = renderCard(booking({ order_id: null, orders: null, status: "hold" }));
    expect(screen.queryByRole("button", { name: /invoice/i })).toBeNull();
    unmount();
    renderCard(booking({ status: "cancelled", cancel_reason: "Asked to cancel" }));
    expect(screen.queryByText("Invoice #1042")).toBeNull();
    expect(screen.getByText("Asked to cancel")).toBeInTheDocument();
  });
});

describe("a discount set by hand", () => {
  it("changes the amount and the reason", () => {
    const p = page();
    render(
      <BookingDiscountEditor
        booking={booking({ discount_amount: 0, discount_label_en: null })}
        page={p}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add discount" }));
    fireEvent.change(screen.getByLabelText("Discount amount"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Regular customer" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const set = (p as unknown as { setDiscount: ReturnType<typeof vi.fn> }).setDiscount;
    expect(set).toHaveBeenCalledWith({
      booking: expect.objectContaining({ id: "b1" }),
      amount: 10,
      label: "Regular customer",
    });
  });

  it("refuses more than the services cost, and removes a discount", () => {
    const p = page();
    render(<BookingDiscountEditor booking={booking()} page={p} />);
    fireEvent.click(screen.getByRole("button", { name: "Change discount" }));
    fireEvent.change(screen.getByLabelText("Discount amount"), { target: { value: "56" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/more than the services cost/);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove discount" }));
    const set = (p as unknown as { setDiscount: ReturnType<typeof vi.fn> }).setDiscount;
    expect(set).toHaveBeenCalledWith({ booking: expect.objectContaining({ id: "b1" }), amount: 0 });
  });
});

describe("the store's offers", () => {
  const renderDialog = () =>
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <BookingDiscountsDialog page={page()} open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
  const rule = (over: Record<string, unknown>) => ({
    id: "r1",
    name_en: "Last minute",
    name_ar: null,
    kind: "percent",
    value: 25,
    min_days: 0,
    max_days: 1,
    weekdays: null,
    product_ids: null,
    valid_from: null,
    valid_to: null,
    is_active: true,
    created_at: "2026-10-01",
    ...over,
  });

  it("lists each offer in words, with a way to switch it off and delete it", async () => {
    state.rules = [
      rule({}),
      rule({ id: "r2", name_en: "This week", value: 10, min_days: 2, max_days: 7 }),
    ];
    renderDialog();
    expect(await screen.findByText("Last minute")).toBeInTheDocument();
    expect(screen.getByText("25% off · within 1 day")).toBeInTheDocument();
    expect(screen.getByText("10% off · 2 to 7 days ahead")).toBeInTheDocument();
    const row = screen.getByText("Last minute").closest("li")!;
    fireEvent.click(within(row).getByRole("checkbox"));
    await waitFor(() =>
      expect(state.setDiscountRuleActive).toHaveBeenCalledWith("b1", "r1", false),
    );
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(state.deleteDiscountRule).toHaveBeenCalledWith("b1", "r1"));
  });

  it("adds an offer from a quick start, then saves it with the chosen days and services", async () => {
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Add an offer" }));
    fireEvent.click(screen.getByRole("button", { name: /Last minute \(within 1 day\)/ }));
    expect(screen.getByLabelText("Discount")).toHaveValue(25);
    expect(screen.getByLabelText(/^To/)).toHaveValue(1);
    expect(screen.getByText("25% off · within 1 day")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sun" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Photo booth" }));
    expect(screen.queryByRole("checkbox", { name: "Old" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save offer" }));
    await waitFor(() => expect(state.saveDiscountRule).toHaveBeenCalledTimes(1));
    expect(state.saveDiscountRule).toHaveBeenCalledWith(
      "b1",
      null,
      expect.objectContaining({
        kind: "percent",
        value: 25,
        min_days: 0,
        max_days: 1,
        weekdays: [0],
        product_ids: ["p1"],
        is_active: true,
        name_en: "Last-minute offer",
      }),
    );
  });

  it("will not save an offer with nothing taken off or the days the wrong way round", async () => {
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Add an offer" }));
    expect(screen.getByRole("button", { name: "Save offer" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Discount"), { target: { value: "10" } });
    expect(screen.getByRole("button", { name: "Save offer" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText(/^To/), { target: { value: "3" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/last day/);
    expect(screen.getByRole("button", { name: "Save offer" })).toBeDisabled();
  });

  it("edits an existing offer", async () => {
    state.rules = [rule({})];
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Discount"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save offer" }));
    await waitFor(() =>
      expect(state.saveDiscountRule).toHaveBeenCalledWith(
        "b1",
        "r1",
        expect.objectContaining({ value: 30, name_en: "Last minute" }),
      ),
    );
  });
});
