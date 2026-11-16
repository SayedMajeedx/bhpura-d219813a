import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  attentionLines,
  orderOpen,
  todayFigures,
} from "../src/features/dashboard/lib/dashboard-today";

// The dashboard opens on today and on one list of what needs a person (the review of
// 2026-11-16): it opened on thirty days' figures, said what needed attention three times (a strip
// of pills, a grid of cards repeating them, a feed of orders further down) and was 4,000px long
// on a phone.

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => (
    <a href={to}>{children}</a>
  ),
}));
const orderNo = (n: unknown) => `#${n}`;
vi.mock("../src/hooks/use-order-number", () => ({ useOrderNumber: () => orderNo }));
vi.mock("@/hooks/use-order-number", () => ({ useOrderNumber: () => orderNo }));

const { AttentionList } = await import("../src/features/dashboard/components/AttentionList");
const { TodayStrip } = await import("../src/features/dashboard/components/TodayStrip");

const now = new Date(2026, 10, 16, 15, 0, 0);
const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString();
const order = (over: Record<string, unknown> = {}) => ({
  created_at: at(16),
  status: "confirmed",
  payment_status: "unpaid",
  total: 30,
  advance_paid: 0,
  ...over,
});

describe("today on the dashboard", () => {
  it("counts the orders placed today, never a cancelled one or a draft", () => {
    const today = todayFigures({
      orders: [
        order(),
        order({ created_at: at(16, 1) }),
        order({ status: "cancelled" }),
        order({ status: "draft" }),
        order({ payment_status: "failed" }),
        order({ created_at: at(15, 23) }),
      ],
      dailySeries: null,
      now,
    });
    expect(today.ordersToday).toBe(2);
    expect(today.salesToday).toBeNull();
  });

  it("adds up what is still to collect on the orders not finished yet", () => {
    const today = todayFigures({
      orders: [
        order({ total: 40, advance_paid: 20 }),
        order({ total: 25, payment_status: "partially_paid", advance_paid: 5 }),
        order({ total: 50, payment_status: "paid", advance_paid: 50 }),
        order({ total: 70, status: "completed" }),
        order({ total: 90, status: "cancelled" }),
        order({ total: 10, advance_paid: 10 }),
      ],
      dailySeries: null,
      now,
    });
    expect(today.toCollect).toBeCloseTo(40, 6);
    expect(today.toCollectCount).toBe(2);
  });

  it("reads today's net sales from the Reports series, zero when today has none", () => {
    const series = [
      { key: "2026-11-15", date: "", store: 5, partner: 0, sales: 5, orders: 1 },
      { key: "2026-11-16", date: "", store: 12, partner: 8, sales: 20, orders: 2 },
    ];
    expect(todayFigures({ orders: [], dailySeries: series, now }).salesToday).toBe(20);
    expect(todayFigures({ orders: [], dailySeries: series.slice(0, 1), now }).salesToday).toBe(0);
  });

  it("knows an open order", () => {
    expect(orderOpen({ status: "confirmed", payment_status: "unpaid" })).toBe(true);
    expect(orderOpen({ status: "completed", payment_status: "paid" })).toBe(false);
    expect(orderOpen({ status: "refunded", payment_status: "refunded" })).toBe(false);
  });

  it("says each figure in its strip, the money in the store's currency", () => {
    render(
      <TodayStrip
        today={{ ordersToday: 3, salesToday: 20, toCollect: 40, toCollectCount: 2 }}
        loading={false}
        currency="BHD"
        locale="en-US"
        isAr={false}
        slug="pura"
        isServices={false}
      />,
    );
    const strip = screen.getByRole("region", { name: "Today" });
    expect(strip.textContent).toContain("Orders today3");
    expect(strip.textContent).toMatch(/Net sales today.*20\.000/);
    expect(strip.textContent).toMatch(/Still to collect.*40\.000.*on 2 orders still open/);
  });
});

describe("one list of what needs a person", () => {
  it("keeps only what has something in it, appointments first", () => {
    expect(attentionLines({ prepare: 4, appointments: 2, returns: 0, low_stock: 3 })).toEqual([
      { kind: "appointments", count: 2 },
      { kind: "prepare", count: 4 },
      { kind: "low_stock", count: 3 },
    ]);
  });

  it("names each line with its count, then the orders waiting", () => {
    render(
      <AttentionList
        lines={attentionLines({ prepare: 4, appointments: 0, returns: 1, low_stock: 2 })}
        orders={
          [
            {
              id: "o1",
              invoice_number: 1042,
              customer_name_snapshot: "Mariam",
              created_at: at(15),
              total: 23.8,
              currency: "BHD",
            },
          ] as unknown as Parameters<typeof AttentionList>[0]["orders"]
        }
        loading={false}
        isAr
        slug="pura"
        locale="ar-BH-u-nu-latn"
      />,
    );
    const list = screen.getByRole("region", { name: "يحتاج انتباهك" });
    expect(list.textContent).toContain("طلبات بانتظار التجهيز4 طلبات");
    expect(list.textContent).toContain("مرتجعات بانتظار الفحصمرتجع واحد");
    expect(list.textContent).toContain("منتجات قاربت على النفادمنتجان");
    expect(list.textContent).toContain("#1042 · Mariam");
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("says once, in one line, that nothing waits", () => {
    render(<AttentionList lines={[]} orders={[]} loading={false} isAr slug="pura" locale="ar" />);
    expect(screen.getByRole("region", { name: "يحتاج انتباهك" }).textContent).toBe(
      "لا شيء يحتاج انتباهك الآن",
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
});
