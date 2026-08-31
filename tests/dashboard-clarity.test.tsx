import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardCommandHeader } from "../src/components/dashboard/DashboardCommandHeader";
import { DashboardScopeSwitcher } from "../src/components/dashboard/DashboardScopeSwitcher";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

describe("dashboard metric clarity", () => {
  it("labels the combined metric as sales rather than storefront orders", () => {
    render(
      <DashboardCommandHeader
        lang="en"
        slug="pura"
        brandName="Pura"
        salesTransactionCount={6}
        periodLabel="the last 30 days"
      />,
    );

    expect(screen.getByText("6 sales")).toBeDefined();
    expect(screen.getByText(/incubator sales for the last 30 days/i)).toBeDefined();
    expect(screen.queryByText("6 orders")).toBeNull();
  });

  it("provides compact mobile labels for every dashboard scope", () => {
    const { container } = render(
      <DashboardScopeSwitcher
        lang="ar"
        activeScope="financials"
        onScopeChange={vi.fn()}
        lowStockCount={9}
      />,
    );

    expect(screen.getByText("الملخص")).toBeDefined();
    expect(screen.getByText("المبيعات")).toBeDefined();
    expect(screen.getByText("التنبيهات")).toBeDefined();
    expect(container.firstElementChild?.className).toContain("grid-cols-3");
  });
});
