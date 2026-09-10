import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardActionStrip } from "../src/components/dashboard/DashboardActionStrip";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to}>{children}</a>,
}));

describe("DashboardActionStrip", () => {
  it("renders action cards when items need merchant attention", () => {
    render(
      <DashboardActionStrip
        slug="boutq-store"
        isAr={true}
        unfulfilledOrdersCount={4}
        lowStockCount={2}
        pendingReturnsCount={1}
      />,
    );

    expect(screen.getByText("ما الذي يتطلب انتباهك اليوم؟")).toBeDefined();
    expect(screen.getByText("طلبات بانتظار التجهيز والشحن")).toBeDefined();
    expect(screen.getByText("منتجات قاربت على النفاد")).toBeDefined();
    expect(screen.getByText("مرتجعات بانتظار الفحص")).toBeDefined();
    expect(screen.getByText("4")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByText("1")).toBeDefined();
    expect(screen.getByText("7 مهام معلّقة")).toBeDefined();
  });

  it("renders celebratory all-clear state when all queues are 0", () => {
    render(
      <DashboardActionStrip
        slug="boutq-store"
        isAr={true}
        unfulfilledOrdersCount={0}
        lowStockCount={0}
        pendingReturnsCount={0}
      />,
    );

    expect(screen.getByText("ما الذي يتطلب انتباهك اليوم؟")).toBeDefined();
    expect(screen.getByText("كل أمورك جاهزة ومنتظمة اليوم!")).toBeDefined();
    expect(screen.queryByText("طلبات بانتظار التجهيز والشحن")).toBeNull();
  });

  it("renders in English correctly", () => {
    render(
      <DashboardActionStrip
        slug="boutq-store"
        isAr={false}
        unfulfilledOrdersCount={3}
        lowStockCount={0}
        pendingReturnsCount={0}
      />,
    );

    expect(screen.getByText("What Needs Attention Today?")).toBeDefined();
    expect(screen.getByText("Orders Awaiting Fulfillment")).toBeDefined();
    expect(screen.getByText("3 actions pending")).toBeDefined();
  });
});
