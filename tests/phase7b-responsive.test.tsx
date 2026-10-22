import React from "react";
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrendingUp } from "lucide-react";
import { ExpensesScopeSwitcher } from "../src/components/expenses/ExpensesScopeSwitcher";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
import { KpiCard } from "../src/components/reports/kpi-card";

describe("Phase 7B responsive financial workspaces", () => {
  test("expenses keeps primary financial results visible and progressively discloses costs", () => {
    render(
      <ExpensesScopeSwitcher
        lang="en"
        currency="BHD"
        slug="pura"
        figures={{
          netSales: 1200,
          productCost: 280,
          packagingCost: 20,
          partnerCost: 0,
          costOfGoods: 300,
          grossProfit: 900,
          grossMargin: 75,
          runningCosts: 150,
          paymentFees: 25,
          partnerCommissions: 0,
          operatingCosts: 175,
          operatingProfit: 725,
          operatingMargin: 60.4,
          missingCosts: 0,
        }}
      />,
    );

    expect(screen.getByText("Net sales")).toBeDefined();
    expect(screen.getByText("Operating profit / margin")).toBeDefined();
    expect(screen.getByText("Cost and expense details")).toBeDefined();
    expect(screen.getAllByText("Cost of goods").length).toBeGreaterThanOrEqual(2);
  });

  test("report KPI cards use compact mobile spacing while retaining desktop spacing", () => {
    render(
      <KpiCard
        title="Net sales"
        value="BHD 1,200"
        description="Paid orders"
        icon={<TrendingUp />}
      />,
    );

    const card = screen.getByRole("article");
    expect(card.className).toContain("p-3.5");
    expect(card.className).toContain("sm:p-5");
    expect(screen.getByText("Net sales")).toBeDefined();
    expect(screen.getByText("Paid orders")).toBeDefined();
  });
});
