import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";

// An appointment invoice's booking terms: the public invoice's server function
// hands the store's booking policy over with the order, and the block draws it.

const state = vi.hoisted(() => ({
  fake: undefined as unknown as { supabase: unknown },
}));
vi.mock("@tanstack/react-start", async () =>
  (await import("./helpers/server-fn")).serverFnModule(),
);
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

const { InvoiceBookingTerms } = await import("../src/components/orders/InvoiceBookingTerms");
const { policyLines } = await import("../src/lib/bookings/policies");
const { getPublicInvoice } = (await vi.importActual("../src/lib/public-invoice.functions")) as {
  getPublicInvoice: ServerFn;
};

const policy = {
  balance_due_days: 7,
  reschedule_months: 3,
  deposit_refundable: false,
  terms_en: "Cancel by message.",
  terms_ar: null,
};
const order = (bookings: unknown[]) => ({
  id: "o1",
  brand_id: "b1",
  invoice_number: 1042,
  bookings,
  order_items: [],
});
const run = (bookings: unknown[], extra: Record<string, unknown> = {}) => {
  state.fake = fakeSupabase({
    rows: {
      orders: order(bookings),
      business_settings: { business_name: "Aurora" },
      brand_addons: [],
      booking_settings: { timezone: "Asia/Bahrain", deposit_percent: 30 },
      booking_policies: policy,
      ...extra,
    },
  });
  return getPublicInvoice({ data: { id: "00000000-0000-4000-8000-000000000001" }, context: {} });
};

beforeEach(() => {
  state.fake = fakeSupabase({});
});

describe("the public invoice carries the booking terms", () => {
  it("reads the store's policy and deposit for an appointment order", async () => {
    const res = (await run([{ reference: "BK-1", event_date: "2026-10-20" }])) as {
      bookingPolicy: unknown;
      bookingDepositPercent: number;
      bookingTimezone: string;
    };
    expect(res.bookingPolicy).toEqual(policy);
    expect(res.bookingDepositPercent).toBe(30);
    expect(res.bookingTimezone).toBe("Asia/Bahrain");
  });

  it("does not read them for an order without a booking", async () => {
    const res = (await run([])) as { bookingPolicy: unknown; bookingDepositPercent: number };
    expect(res.bookingPolicy).toBeNull();
    expect(res.bookingDepositPercent).toBe(0);
    const tables = (state.fake as unknown as { queries: Array<{ table: string }> }).queries.map(
      (q) => q.table,
    );
    expect(tables).not.toContain("booking_policies");
  });

  it("is a store with no policy: nothing is set, nothing to draw", async () => {
    const res = (await run([{ reference: "BK-1", event_date: "2026-10-20" }], {
      booking_policies: null,
    })) as { bookingPolicy: unknown };
    expect(res.bookingPolicy).toBeNull();
  });
});

describe("the booking terms block", () => {
  it("lists the deposit, the balance's due day, moving a booking and the free text", () => {
    render(
      <InvoiceBookingTerms
        lines={policyLines(policy, { isAr: false, depositPercent: 30, eventDay: "2026-10-20" })}
        isRTL={false}
        background="#eee"
        color="#111"
      />,
    );
    expect(screen.getByText("Booking terms")).toBeInTheDocument();
    expect(screen.getByText("The 30% deposit is non-refundable.")).toBeInTheDocument();
    expect(
      screen.getByText("The balance is due 7 days before the event (2026-10-13)."),
    ).toBeInTheDocument();
    expect(screen.getByText("Cancel by message.")).toBeInTheDocument();
  });

  it("reads in Arabic, and draws nothing without lines", () => {
    const { container, rerender } = render(
      <InvoiceBookingTerms
        lines={policyLines(policy, { isAr: true, depositPercent: 0, eventDay: "2026-10-20" })}
        isRTL
        background="#eee"
        color="#111"
      />,
    );
    expect(screen.getByText("شروط الحجز")).toBeInTheDocument();
    expect(screen.getByText(/يُدفع الرصيد المتبقي قبل المناسبة بـ 7 أيام/)).toBeInTheDocument();
    rerender(<InvoiceBookingTerms lines={[]} isRTL={false} background="#eee" color="#111" />);
    expect(container).toBeEmptyDOMElement();
  });
});
