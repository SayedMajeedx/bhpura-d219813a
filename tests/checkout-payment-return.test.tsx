import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Banknote, CreditCard } from "lucide-react";

// After the card gateway: "Choose another payment method" on a failed payment
// brings the payment methods into view and focuses one that is not the card
// (bug backlog #12), and the thank-you page's message follows the redirect's
// fulfillment without reading the order (#19).

const search = vi.hoisted(() => ({
  current: { fulfillment: "delivery", channel: "email" } as Record<string, string>,
}));
const storefront = vi.hoisted(() => ({
  brand: { id: "b1", slug: "pura" },
  settings: { primary_color: "#000" },
  t: (_ar: string, en: string) => en,
  clearCart: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options, useSearch: () => search.current }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
const storefrontContext = { useStorefront: () => storefront };
vi.mock("../src/lib/storefront-context", () => storefrontContext);
vi.mock("@/lib/storefront-context", () => storefrontContext);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// A booking's thank-you page reads the store's time zone, for the shopper's calendar.
const bookingsData = {
  bookingsQueries: {
    publicRules: () => ({
      queryKey: ["thank-you-test", "rules"],
      queryFn: async () => ({ timezone: "Asia/Bahrain" }),
    }),
  },
};
vi.mock("../src/lib/data/bookings", () => bookingsData);
vi.mock("@/lib/data/bookings", () => bookingsData);

const { PaymentFailedCard } = await import("../src/features/checkout/components/PaymentFailedCard");
const { PaymentMethodCard } = await import("../src/features/checkout/components/PaymentMethodCard");
const { Route } = (await import("../src/routes/$slug.thank-you.$orderId")) as unknown as {
  Route: { options: { component: React.ComponentType } };
};

beforeEach(() => {
  vi.clearAllMocks();
});

const t = (_ar: string, en: string) => en;

function renderFailedCheckout(methods: string[]) {
  const all = {
    card: { id: "card", icon: CreditCard, ar: "بطاقة", en: "Card" },
    cod: { id: "cod", icon: Banknote, ar: "الدفع عند الاستلام", en: "Cash on delivery" },
  } as const;
  const setMethod = vi.fn();
  render(
    <div>
      <PaymentFailedCard setMethod={setMethod} submit={vi.fn()} submitting={false} t={t} />
      <PaymentMethodCard
        availableMethods={methods.map((id) => all[id as keyof typeof all])}
        benefitReceipt={null}
        brand={storefront.brand as never}
        advance={{
          applies: false,
          percent: 30,
          scope: "all",
          dueNow: 0,
          balance: 0,
          partial: false,
        }}
        currency="BHD"
        fulfillment="pickup"
        lang="en"
        method="card"
        selectedDestination="BH"
        setBenefitReceipt={vi.fn()}
        setMethod={setMethod}
        settings={{} as never}
        t={t}
      />
    </div>,
  );
  return setMethod;
}

describe("choosing another payment method after a failed card payment", () => {
  it("scrolls to the payment methods and focuses one that is not the card", () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    const setMethod = renderFailedCheckout(["card", "cod"]);
    fireEvent.click(screen.getByRole("button", { name: "Choose Another Payment Method" }));
    const section = screen.getByRole("region", { name: "Payment method" });
    expect(scroll.mock.contexts).toContain(section);
    expect(screen.getByRole("button", { name: "Cash on delivery" })).toHaveFocus();
    // Choosing is left to the shopper.
    expect(setMethod).not.toHaveBeenCalled();
  });

  it("focuses the card when it is the only method", () => {
    renderFailedCheckout(["card"]);
    fireEvent.click(screen.getByRole("button", { name: "Choose Another Payment Method" }));
    expect(screen.getByRole("button", { name: "Card", pressed: true })).toHaveFocus();
  });
});

describe("the thank-you page", () => {
  const ThankYou = Route.options.component;
  const renderThankYou = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ThankYou />
      </QueryClientProvider>,
    );

  it("puts a booking in the shopper's calendar at the store's time", async () => {
    search.current = { ref: "BK-7Q2M9X", day: "2026-10-08", start: "18:00", minutes: "180" };
    renderThankYou();
    expect(screen.getByText("Your booking is in!")).toBeInTheDocument();
    const google = await screen.findByRole("link", { name: "Add to Google Calendar" });
    expect(google.getAttribute("href")).toContain("dates=20261008T150000Z%2F20261008T180000Z");
    expect(screen.getByRole("link", { name: "Add to Apple or Outlook" })).toHaveAttribute(
      "download",
      "BK-7Q2M9X.ics",
    );
  });

  it.each([
    [{ fulfillment: "pickup", channel: "email" }, /ready for pickup/],
    [{ fulfillment: "delivery", channel: "email" }, /confirm delivery/],
    [{ fulfillment: "digital", channel: "whatsapp" }, /sent through WhatsApp/],
    [{ fulfillment: "digital", channel: "email" }, /sent to your email/],
  ])("shows the message for %o straight away and empties the cart", (params, message) => {
    search.current = params;
    renderThankYou();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText("Loading order details...")).not.toBeInTheDocument();
    expect(storefront.clearCart).toHaveBeenCalledTimes(1);
  });
});
