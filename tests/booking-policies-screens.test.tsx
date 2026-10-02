import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The booking terms: the merchant's dialog and the storefront's block, with the
// data layer faked.

const state = vi.hoisted(() => ({
  policy: null as Record<string, unknown> | null,
  save: vi.fn(async () => undefined),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const data = {
  bookingPoliciesQueries: {
    policy: () => ({ queryKey: ["bp-test", "policy"], queryFn: async () => state.policy }),
  },
  invalidateBookingPolicies: vi.fn(async () => undefined),
  saveBookingPolicy: state.save,
};
vi.mock("../src/lib/data/booking-policies", () => data);
vi.mock("@/lib/data/booking-policies", () => data);

const { BookingPoliciesDialog } =
  await import("../src/features/bookings/components/BookingPoliciesDialog");
const { BookingPolicies } =
  await import("../src/features/storefront-booking/components/BookingPolicies");

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

beforeEach(() => {
  state.policy = null;
  vi.clearAllMocks();
});

describe("the storefront's booking terms", () => {
  it("show nothing for a store without terms", async () => {
    const { container } = wrap(
      <BookingPolicies brandId="b1" isAr={false} depositPercent={0} eventDay={null} />,
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("list the deposit, the balance's due day, moving a booking and the free text", async () => {
    state.policy = {
      balance_due_days: 7,
      reschedule_months: 3,
      deposit_refundable: false,
      terms_en: "Cancel by message.",
      terms_ar: null,
    };
    wrap(<BookingPolicies brandId="b1" isAr={false} depositPercent={30} eventDay="2026-10-20" />);
    expect(await screen.findByText("The 30% deposit is non-refundable.")).toBeInTheDocument();
    expect(
      screen.getByText("The balance is due 7 days before the event (2026-10-13)."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You can move your booking to another date within 3 months."),
    ).toBeInTheDocument();
    expect(screen.getByText("Cancel by message.")).toBeInTheDocument();
  });
});

describe("the merchant's terms dialog", () => {
  const open = () =>
    wrap(
      <BookingPoliciesDialog
        page={{ isAr: false, brand: { id: "b1" }, rules: { deposit_percent: 20 } } as never}
        open
        onOpenChange={vi.fn()}
      />,
    );

  it("saves the balance days, the months and the terms, and shows how the customer reads them", async () => {
    open();
    fireEvent.change(await screen.findByLabelText(/Balance due before the event/), {
      target: { value: "14" },
    });
    fireEvent.change(screen.getByLabelText(/can be moved within/), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Other terms (English)"), {
      target: { value: "No refunds in the last week." },
    });
    expect(screen.getByText("The balance is due 14 days before the event.")).toBeInTheDocument();
    expect(screen.getByText("The 20% deposit is non-refundable.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save terms" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save).toHaveBeenCalledWith("b1", {
      balance_due_days: 14,
      reschedule_months: 3,
      deposit_refundable: false,
      terms_en: "No refunds in the last week.",
      terms_ar: null,
    });
  });

  it("will not save a nonsense number", async () => {
    open();
    fireEvent.change(await screen.findByLabelText(/Balance due before the event/), {
      target: { value: "400" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/0 to 365/);
    expect(screen.getByRole("button", { name: "Save terms" })).toBeDisabled();
  });
});
