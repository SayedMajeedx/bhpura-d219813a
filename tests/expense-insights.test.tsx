import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { categoryMonths, repeatsInMonth } from "../src/features/expenses/lib/expense-insights";

// A month at a glance on the expenses page (stage 4 of the plan of 2026-11-16): categories
// against the three months before and the store's budget, and what repeats in the month.

const client = vi.hoisted(() => () => ({ supabase: {} }));
vi.mock("../src/integrations/supabase/client", client);
vi.mock("@/integrations/supabase/client", client);

const { ExpenseInsights } = await import("../src/features/expenses/components/ExpenseInsights");

const e = (id: string, category: string, amount: number, day: string, extra: object = {}) => ({
  id,
  category,
  amount,
  currency: "BHD",
  expense_date: day,
  description: null,
  is_recurring: false,
  recurrence_period: "monthly",
  recurring_source_id: null,
  ...extra,
});

const rent = e("r1", "Rent", 50, "2026-08-18", {
  description: "ايجار حاضنة دار لولوة",
  is_recurring: true,
});
const expenses = [
  rent,
  e("r2", "Rent", 50, "2026-09-18", { recurring_source_id: "r1" }),
  e("r3", "Rent", 50, "2026-10-18", { recurring_source_id: "r1" }),
  e("a1", "Marketing", 30, "2026-08-05"),
  e("a2", "Marketing", 60, "2026-11-03"),
  e("p1", "Packaging", 38.75, "2026-08-16"),
  e("u1", "Marketing", 99, "2026-11-04", { currency: "USD" }),
];

describe("the month by category", () => {
  it("compares each category with the three months before and with its budget", () => {
    const rows = categoryMonths(expenses, "2026-11", "BHD", [
      { category: "marketing", monthly_amount: 50 },
      { category: "Salaries", monthly_amount: 400 },
    ]);
    expect(rows.map((r) => r.category)).toEqual(["Marketing", "Salaries"]);
    const ads = rows[0];
    expect(ads.spent).toBe(60);
    expect(ads.average).toBe(10); // 30 in August over three months; the USD one is left out
    expect(ads.change).toBeCloseTo(5, 6);
    expect(ads.used).toBeCloseTo(1.2, 6);
    expect(ads.over).toBe(true);
    expect(rows[1]).toMatchObject({ spent: 0, budget: 400, over: false, change: null });
  });

  it("leaves a category out of a month it spent nothing in and has no budget for", () => {
    expect(categoryMonths(expenses, "2026-11", "BHD").map((r) => r.category)).toEqual([
      "Marketing",
    ]);
  });
});

describe("what repeats in the month", () => {
  it("says each repeat's day, recorded once the database wrote it", () => {
    expect(repeatsInMonth(expenses, "2026-10")).toEqual([
      expect.objectContaining({ id: "r1", day: "2026-10-18", recorded: true, amount: 50 }),
    ]);
    expect(repeatsInMonth(expenses, "2026-11")).toEqual([
      expect.objectContaining({ day: "2026-11-18", recorded: false }),
    ]);
    expect(repeatsInMonth(expenses, "2026-08")[0]).toMatchObject({ recorded: true });
    expect(repeatsInMonth(expenses, "2026-07")).toEqual([]);
  });
});

describe("the panel", () => {
  it("warns of a category over its budget and lists the month's repeats", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ExpenseInsights
          lang="en"
          month="2026-11"
          expenses={expenses as never}
          budgets={[{ id: "b1", category: "Marketing", monthly_amount: 50 }]}
          storeCurrency="BHD"
          brandId="b1"
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Over budget: Marketing and ads");
    expect(screen.getByRole("meter", { name: "Marketing and ads of its budget" })).toHaveAttribute(
      "aria-valuenow",
      "120",
    );
    expect(screen.getByText("ايجار حاضنة دار لولوة")).toBeInTheDocument();
    expect(screen.getByText(/Recorded on/)).toBeInTheDocument();
  });
});
