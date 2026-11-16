import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { composeOverviewRows } from "../src/lib/reporting-compose";
import { periodFigures } from "../src/features/expenses/lib/profit-and-loss";
import { columnsIn, statementLines } from "../src/features/finance-reports/lib/statement";

// The expenses page's profit and loss, its strip and its accounting tab's income statement, are
// the Reports' own figures for the page's period: the same operating profit as the monthly
// statement for the same rows, to the fils. They were worked out in the browser by other rules.

const options = (key: string, value: unknown) => ({
  queryKey: [key],
  queryFn: async () => value,
});
const mocks: Record<string, unknown> = {
  "brand-context": { useBrand: () => ({ id: "b1", slug: "pura" }) },
  i18n: { useI18n: () => ({ lang: "en" }) },
  currency: { useStoreCurrency: () => "BHD", useMoneyLabel: () => "BHD" },
  profile: { useAdminStoreProfile: () => ({ profile: { modules: { packaging: true } } }) },
  orders: { ordersQueries: { finance: () => options("finance", []) } },
  expenses: { expensesQueries: { list: () => options("expenses", []) } },
  accounting: { accountingQueries: { cashAccounts: () => options("accounts", []) } },
};
vi.mock("../src/lib/brand-context", () => mocks["brand-context"]);
vi.mock("@/lib/brand-context", () => mocks["brand-context"]);
vi.mock("../src/lib/i18n", () => mocks.i18n);
vi.mock("@/lib/i18n", () => mocks.i18n);
vi.mock("../src/hooks/use-store-currency", () => mocks.currency);
vi.mock("@/hooks/use-store-currency", () => mocks.currency);
vi.mock("../src/hooks/use-store-profile", () => mocks.profile);
vi.mock("@/hooks/use-store-profile", () => mocks.profile);
vi.mock("../src/lib/data/orders", () => mocks.orders);
vi.mock("@/lib/data/orders", () => mocks.orders);
vi.mock("../src/lib/data/expenses", () => mocks.expenses);
vi.mock("@/lib/data/expenses", () => mocks.expenses);
vi.mock("../src/lib/data/accounting", () => mocks.accounting);
vi.mock("@/lib/data/accounting", () => mocks.accounting);
vi.mock("../src/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

const { ExpensesScopeSwitcher } = await import("../src/components/expenses/ExpensesScopeSwitcher");

// A period with store sales, a partner shop's sale, a return, packaging, fees, a partner's
// commission and running costs: every piece the old rules missed or counted differently.
const rows = composeOverviewRows({
  overview: [
    {
      currency: "BHD",
      gross_merch_sales: 220,
      discounts: 20,
      net_merch_sales: 200,
      paid_order_value: 230,
      paid_order_count: 4,
      expenses: 30,
    },
  ],
  returns: [{ currency: "BHD", merchandise_deduction: 20, returned_cogs_reversal: 8 }],
  cogs: [{ currency: "BHD", known_cogs: 72, product_cogs: 65, packaging_cogs: 7 }],
  fees: [{ currency: "BHD", processing_fees: 5 }],
  incubatorSummary: [{ currency: "BHD", gross_amount: 50, cogs: 20, commission_amount: 10 }],
});
const figures = periodFigures(rows, "BHD");
const statementProfit = statementLines(columnsIn([rows], "BHD")).find(
  (l) => l.key === "operating_profit",
)!.total;

describe("the expenses page's profit and loss", () => {
  it("shows the monthly statement's operating profit in the strip", () => {
    expect(statementProfit).toBe(101);
    render(<ExpensesScopeSwitcher lang="en" currency="BHD" slug="pura" figures={figures} />);
    expect(screen.getByText("Net sales").parentElement!.nextSibling).toHaveTextContent("230.000");
    expect(
      screen.getByText("Operating profit / margin").closest("div")!.parentElement,
    ).toHaveTextContent("101.000");
    expect(
      screen.getAllByText("Payment fees & commissions")[0].parentElement!.nextSibling,
    ).toHaveTextContent("15.000");
  });
});
