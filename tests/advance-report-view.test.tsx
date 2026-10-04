import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The advance-payment report, with the data layer faked.

const state = vi.hoisted(() => ({
  orders: [] as Array<Record<string, unknown>>,
  days: [] as Array<number | null>,
  lang: "en" as "en" | "ar",
}));
vi.mock("../src/lib/i18n", () => ({ useI18n: () => ({ lang: state.lang }) }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ lang: state.lang }) }));
const brand = { id: "b1", slug: "pura", name_en: "Pura", name_ar: "بورا" };
vi.mock("../src/lib/brand-context", () => ({ useBrand: () => brand }));
vi.mock("@/lib/brand-context", () => ({ useBrand: () => brand }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    ...rest
  }: Record<string, unknown> & { children: React.ReactNode }) => (
    <a href={`/orders/${(params as { id: string }).id}`} {...(rest as object)}>
      {children}
    </a>
  ),
}));
const reportData = {
  ADVANCE_REPORT_LIMIT: 1000,
  advanceReportQueries: {
    orders: (_brandId: string, days: number | null) => ({
      queryKey: ["advance-report-test", days],
      queryFn: async () => {
        state.days.push(days);
        return state.orders;
      },
    }),
  },
};
vi.mock("../src/lib/data/advance-report", () => reportData);
vi.mock("@/lib/data/advance-report", () => reportData);

const { AdvanceReportView } =
  await import("../src/features/advance-report/components/AdvanceReportView");

const order = (over: Record<string, unknown>) => ({
  id: "o1",
  invoice_number: 1,
  created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  currency: "BHD",
  total: 100,
  advance_paid: 0,
  status: "pending",
  payment_status: "unpaid",
  customer_name_snapshot: "Mariam",
  customer_phone_snapshot: "36001234",
  public_invoice_token: "tok1",
  ...over,
});

const renderView = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AdvanceReportView />
    </QueryClientProvider>,
  );

beforeEach(() => {
  state.orders = [];
  state.days = [];
  state.lang = "en";
});

describe("the advance payments report", () => {
  it("says nothing is owed when no order owes anything", async () => {
    renderView();
    expect(await screen.findByText("Nothing is owed in this period.")).toBeInTheDocument();
  });

  it("shows what was collected and owed, and a reminder for each customer who owes", async () => {
    state.orders = [
      order({ id: "a", invoice_number: 7 }),
      order({
        id: "b",
        invoice_number: 8,
        total: 80,
        advance_paid: 40,
        payment_status: "partial",
        customer_name_snapshot: "Noor",
        customer_phone_snapshot: null,
      }),
      order({ id: "c", invoice_number: 9, total: 60, advance_paid: 60, payment_status: "paid" }),
    ];
    renderView();
    expect(await screen.findByText("Orders with money owed")).toBeInTheDocument();
    // Collected 100 (nothing + 40 + 60), still owed 140 (100 + 40).
    expect(screen.getByText(/100\.000/, { selector: "div" })).toBeInTheDocument();
    expect(screen.getByText(/140\.000/, { selector: "div" })).toBeInTheDocument();

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    const first = within(rows[0]);
    expect(first.getByText("#7")).toBeInTheDocument();
    const remind = first.getByRole("link", { name: "Remind" });
    const href = remind.getAttribute("href")!;
    expect(href.startsWith("https://wa.me/97336001234?text=")).toBe(true);
    expect(decodeURIComponent(href)).toContain("/invoice/tok1");
    // A customer with no number cannot be reminded.
    expect(within(rows[1]).getByText("No number")).toBeInTheDocument();
  });

  it("asks again for another period", async () => {
    renderView();
    await screen.findByText("Nothing is owed in this period.");
    expect(state.days).toEqual([90]);
    fireEvent.click(screen.getByRole("radio", { name: "All time" }));
    await waitFor(() => expect(state.days).toContain(null));
    expect(screen.getByRole("radio", { name: "All time" })).toHaveAttribute("aria-checked", "true");
  });

  it("reads in Arabic", async () => {
    state.lang = "ar";
    renderView();
    expect(await screen.findByText("لا شيء مستحق في هذه الفترة.")).toBeInTheDocument();
  });
});
