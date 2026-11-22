import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { StoreStats } from "../src/lib/data/super-admin/home";
import {
  filterStores,
  monthlyValue,
  platformFigures,
  storeRows,
  storeState,
  type HomeStore,
  type StoreFilter,
} from "../src/features/super-admin-home/lib/stores";
import { needsYou } from "../src/features/super-admin-home/lib/needs-you";
import { deletedStores, originalSlug } from "../src/features/super-admin-home/lib/deleted-stores";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

// The super admin's home: each store's state, the figures from real plan prices and sales, what
// needs a person today, the stores' search, filters and order, and the deleted stores' record.

const NOW = new Date("2026-11-22T12:00:00Z").getTime();
const daysFromNow = (days: number) => new Date(NOW + days * 86_400_000).toISOString();

const store = (id: string, patch: Partial<HomeStore> = {}): HomeStore => ({
  id,
  slug: id,
  name_en: id.toUpperCase(),
  name_ar: `متجر ${id}`,
  logo_url: null,
  is_active: true,
  created_at: daysFromNow(-90),
  plan_type: "monthly",
  subscription_status: "active",
  subscription_expires_at: daysFromNow(60),
  trial_ends_at: null,
  renewal_intent: null,
  payment_receipt_url: null,
  support_access_enabled: true,
  ...patch,
});

const stats = (brandId: string, patch: Partial<StoreStats> = {}): StoreStats => ({
  brandId,
  vertical: "abayas",
  currency: "BHD",
  orders30d: 4,
  sales30d: 120,
  ordersTotal: 40,
  lastOrderAt: daysFromNow(-1),
  products: 12,
  subscription: {
    status: "active",
    interval: "monthly",
    planCode: "pro",
    periodEnd: daysFromNow(60),
    priceMonthly: 3,
    priceAnnual: 30,
    currency: "BHD",
  },
  ...patch,
});

const STORES = [
  store("pura", { plan_type: "lifetime" }),
  store("lulu"),
  store("year", { plan_type: "annual" }),
  store("ends", { subscription_expires_at: daysFromNow(5), renewal_intent: "cancel" }),
  store("gone", { subscription_expires_at: daysFromNow(-3) }),
  store("trial", {
    plan_type: "trial",
    subscription_status: "trialing",
    trial_ends_at: daysFromNow(20),
    created_at: daysFromNow(-2),
  }),
  store("receipt", { subscription_status: "pending_verification", payment_receipt_url: "r.png" }),
  store("old-deleted-1763000000", { is_active: false }),
];
const STATS = [
  stats("pura", { subscription: null, sales30d: 900 }),
  stats("lulu"),
  stats("year", {
    currency: "SAR",
    sales30d: 50,
    subscription: { ...stats("x").subscription!, interval: "annual", priceAnnual: 36 },
  }),
  stats("ends", { orders30d: 0, sales30d: 0, vertical: "coffee" }),
];

const rows = storeRows(STORES, STATS, NOW);
const row = (id: string) => rows.find((r) => r.store.id === id)!;

describe("a store's state", () => {
  it("reads permanent, active, trial, receipt, ended and leaves the deleted out", () => {
    expect(rows.map((r) => [r.store.id, r.state])).toEqual([
      ["pura", "permanent"],
      ["lulu", "active"],
      ["year", "active"],
      ["ends", "active"],
      ["gone", "expired"],
      ["trial", "trial"],
      ["receipt", "pending"],
    ]);
    expect(storeState(STORES[7], NOW)).toBe("deleted");
    expect(row("ends")).toMatchObject({ daysLeft: 5, endingSoon: true, quiet: true });
    expect(row("trial")).toMatchObject({ daysLeft: 20, endingSoon: false, quiet: false });
  });
});

describe("the platform's figures", () => {
  it("counts subscriptions from their plan price, annual by twelfths, never a permanent store", () => {
    expect(monthlyValue(stats("x").subscription)).toBe(3);
    expect(monthlyValue({ ...stats("x").subscription!, interval: "annual", priceAnnual: 36 })).toBe(
      3,
    );
    expect(monthlyValue({ ...stats("x").subscription!, status: "cancelled" })).toBe(0);
    const figures = platformFigures(rows, NOW);
    expect(figures).toMatchObject({
      stores: 7,
      paying: 3,
      trials: 1,
      permanent: 1,
      newStores: 1,
      orders30d: 12,
    });
    // lulu 3 + ends 3 + year 36 / 12, in the plan's own currency (a SAR store pays a BHD plan);
    // a store's sales stay in its own currency, never added to another's.
    expect(figures.monthlyRevenue).toEqual([{ currency: "BHD", amount: 9 }]);
    expect(figures.sales30d).toEqual([
      { currency: "BHD", amount: 1020 },
      { currency: "SAR", amount: 50 },
    ]);
  });
});

describe("what needs you today", () => {
  it("lists what waits, the most pressing first, and leaves out what has nothing", () => {
    const lines = needsYou(
      {
        rows,
        tenantRequests: 2,
        newResponses: [{ pageId: "p1", slug: "grant", count: 3 }],
        health: { failed: 0, silent: 1 },
      },
      "ar",
    );
    expect(lines.map((l) => l.key)).toEqual([
      "receipts",
      "requests",
      "responses-p1",
      "health",
      "expired",
      "ending",
      "intents",
      "quiet",
    ]);
    expect(lines[0].title).toBe("إيصالات اشتراك للمراجعة: متجر واحد");
    expect(lines[2].title).toBe("ردود جديدة على /grant: 3 ردود");
    expect(lines[5]).toMatchObject({
      detail: "متجر ends",
      target: { kind: "stores", view: "ending" },
    });
    expect(
      needsYou({ rows: [row("lulu")], tenantRequests: 0, newResponses: [], health: null }, "en"),
    ).toEqual([]);
  });
});

describe("the stores' search, filters and order", () => {
  const base: StoreFilter = { term: "", view: "all", vertical: "all", sort: "newest" };
  it("filters by state and kind, searches names and addresses, and sorts", () => {
    expect(filterStores(rows, { ...base, view: "ending" }, "en").map((r) => r.store.id)).toEqual([
      "ends",
    ]);
    expect(
      filterStores(rows, { ...base, vertical: "coffee" }, "en").map((r) => r.store.id),
    ).toEqual(["ends"]);
    expect(filterStores(rows, { ...base, term: "متجر lu" }, "ar").map((r) => r.store.id)).toEqual([
      "lulu",
    ]);
    expect(
      filterStores(rows, { ...base, sort: "sales" }, "en")
        .slice(0, 2)
        .map((r) => r.store.id),
    ).toEqual(["pura", "lulu"]);
    expect(filterStores(rows, { ...base, sort: "ending" }, "en")[0].store.id).toBe("gone");
  });
});

describe("the deleted stores", () => {
  it("joins the record and the stores marked deleted before it, a removal winning", () => {
    expect(originalSlug("zh-deleted-1763000000")).toBe("zh");
    const list = deletedStores(STORES, [
      {
        brandId: "zh",
        mode: "soft",
        slug: "zh",
        nameEn: "ZH Abayas",
        nameAr: null,
        createdAt: null,
        deletedAt: "2026-11-20T10:00:00Z",
        deletedBy: "owner@example.com",
      },
      {
        brandId: "zh",
        mode: "hard",
        slug: "zh-deleted-1763600000",
        nameEn: "ZH Abayas",
        nameAr: null,
        createdAt: null,
        deletedAt: "2026-11-21T10:00:00Z",
        deletedBy: "owner@example.com",
      },
    ]);
    expect(list.map((s) => [s.id, s.slug, s.mode])).toEqual([
      ["zh", "zh", "hard"],
      ["old-deleted-1763000000", "old", "soft"],
    ]);
  });
});

// --- The screens, with their data given as props ---------------------------------------------

const { NeedsYouList } = await import("../src/features/super-admin-home/components/NeedsYouList");
const { StoresTable } = await import("../src/features/super-admin-home/components/StoresTable");

describe("the screens", () => {
  it("opens a line's place: a link for the inbox, the filter for the stores", () => {
    const onOpen = vi.fn();
    const lines = needsYou(
      {
        rows,
        tenantRequests: 0,
        newResponses: [{ pageId: "p1", slug: "grant", count: 1 }],
        health: null,
      },
      "en",
    );
    render(<NeedsYouList lines={lines} loading={false} lang="en" onOpen={onOpen} />);
    expect(
      screen.getByRole("link", { name: /New responses on \/grant/ }).getAttribute("href"),
    ).toBe("/admin/super/responses/$id");
    fireEvent.click(screen.getByRole("button", { name: /Ending within 14 days/ }));
    expect(onOpen).toHaveBeenCalledWith({ kind: "stores", view: "ending" });
  });

  it("says when nothing waits", () => {
    render(<NeedsYouList lines={[]} loading={false} lang="ar" onOpen={vi.fn()} />);
    expect(screen.getByText("لا شيء ينتظرك الآن.")).toBeTruthy();
  });

  it("lists the stores with their figures, counts each state and filters on a tap", () => {
    const onFilter = vi.fn();
    const filter: StoreFilter = { term: "", view: "all", vertical: "all", sort: "newest" };
    render(
      <StoresTable
        rows={rows}
        shown={rows}
        filter={filter}
        onFilter={onFilter}
        verticals={["abayas", "coffee"]}
        lang="en"
        actions={{ openAdmin: vi.fn(), edit: vi.fn(), remove: vi.fn() }}
      />,
    );
    expect(screen.getByRole("tab", { name: "All (7)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "No orders in 30 days (2)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Ending soon (1)" }));
    expect(onFilter).toHaveBeenCalledWith({ view: "ending" });
    expect(screen.getAllByText("LULU").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5 days left").length).toBeGreaterThan(0);
  });
});
