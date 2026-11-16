import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { composeOverviewRows } from "../src/lib/reporting-compose";
import { splitSalesBucket } from "../src/lib/reports-view";
import { monthPackPartnersSheet } from "../src/features/finance-reports/lib/month-pack-partners";
import { productMargins, marginRows } from "../src/features/finance-reports/lib/margins";

// The rest of the reports plan (2026-11-16): the overview by question with each figure beside
// the period before, the sales page split by source with each partner shop, the month pack's
// partner totals and the margins' partner sales.

const reporting = vi.hoisted(() => () => ({
  reportingQueries: {
    monthPack: () => ({
      queryKey: ["month-pack"],
      queryFn: async () => ({
        partner_sales: [
          {
            partner: "دار لولوة",
            currency: "BHD",
            quantity: 2,
            gross: 60,
            commission: 6,
            net_due: 54,
            paid: 54,
          },
          {
            partner: "Nook",
            currency: "BHD",
            quantity: 1,
            gross: 30,
            commission: 0,
            net_due: 30,
            paid: 10,
          },
        ],
      }),
    }),
  },
}));
vi.mock("../src/lib/data/reporting", reporting);
vi.mock("@/lib/data/reporting", reporting);

const { OverviewSections, periodTrend } =
  await import("../src/components/reports/OverviewSections");
const { PartnerShopsCard } = await import("../src/components/reports/PartnerShopsCard");

const month = (scale: number) =>
  composeOverviewRows({
    overview: [
      {
        currency: "BHD",
        paid_order_value: 160 * scale,
        gross_merch_sales: 171 * scale,
        discounts: 20 * scale,
        net_merch_sales: 150 * scale,
        collected: 120 * scale,
        owed_by_customers: 40 * scale,
        paid_order_count: 6,
        known_cogs: 60 * scale,
        expenses: 12 * scale,
        missing_cost_item_count: 2,
        missing_cost_exposure: 30,
      },
    ],
    returns: [],
    cogs: [{ currency: "BHD", known_cogs: 60 * scale, product_cogs: 55 * scale }],
    fees: [],
    incubatorSummary: [
      {
        currency: "BHD",
        gross_amount: 133 * scale,
        cogs: 40 * scale,
        sale_count: 10,
        receivables: 33,
      },
    ],
  })[0];

describe("a figure beside the period before", () => {
  it("says the change and the earlier figure, and a rising cost is not good news", () => {
    const money = (v: number) => v.toFixed(3);
    expect(periodTrend(110, 100, "en", money)).toEqual({
      value: 10,
      label: "Before: 100.000",
      isPositive: true,
    });
    expect(periodTrend(110, 100, "ar", money, false)?.isPositive).toBe(false);
    expect(periodTrend(5, 0, "en", money)).toBeUndefined();
  });
});

describe("the overview, by question", () => {
  it("asks how much was sold, made and where the money is, and flags missing costs", () => {
    render(
      <OverviewSections
        data={month(2)}
        previous={month(1)}
        lang="en"
        currency="BHD"
        modules={{ incubators: true, shipping: false, packaging: false }}
      />,
    );
    expect(screen.getByRole("heading", { name: "How much did I sell?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How much did I make?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Where is the money?" })).toBeInTheDocument();
    // Net sales 300 (store) + 266 (partners) = 566, beside the period before's 283.
    expect(screen.getByText(/Before: .*283\.000/)).toBeInTheDocument();
    expect(screen.getByText("Still owed by partner shops")).toBeInTheDocument();
    expect(screen.getByText("Needs a look")).toBeInTheDocument();
    // Every cost is a line down to the operating profit (566 − 200 − 24 = 342).
    expect(screen.getByText("Cost of the goods sold").nextSibling).toHaveTextContent(/-.*200.000/);
    expect(screen.getAllByText("Operating net profit").length).toBeGreaterThan(1);
  });
});

describe("the sales page", () => {
  it("splits a bucket into the store's net sales and the partner shops'", () => {
    expect(splitSalesBucket({ net_merch: 283, partner: 133 })).toEqual({
      store: 150,
      partner: 133,
      total: 283,
    });
    expect(splitSalesBucket({ net_merch: 40 })).toEqual({ store: 40, partner: 0, total: 40 });
  });

  it("adds up each partner shop's sales, what it paid and what it still owes", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PartnerShopsCard
          slug="pura"
          range={{ from: new Date(2026, 9, 1), to: new Date(2026, 9, 31) }}
          timeZone="Asia/Bahrain"
          currency="BHD"
          lang="en"
        />
      </QueryClientProvider>,
    );
    const total = (await screen.findByRole("rowheader", { name: "Total" })).closest("tr")!;
    expect(total).toHaveTextContent(/90.000/);
    expect(total).toHaveTextContent(/20.000/);
    expect(screen.getByRole("rowheader", { name: "دار لولوة" })).toBeInTheDocument();
  });
});

describe("the month pack's partner shops", () => {
  it("totals the sales, adds each shop, and says the month's sales with the partners'", () => {
    const sheet = monthPackPartnersSheet({
      sales: [
        {
          sold_at: "2026-10-02",
          partner: "دار لولوة",
          quantity: 2,
          unit_price: 30,
          gross: 60,
          commission: 6,
          net_due: 54,
          paid: 54,
          cost: 20,
        },
        {
          sold_at: "2026-10-09",
          partner: "دار لولوة",
          quantity: 1,
          unit_price: 73,
          gross: 73,
          commission: 0,
          net_due: 73,
          paid: 0,
          cost: 20,
        },
      ],
      payments: [],
      monthRow: month(1),
      currency: "BHD",
      digits: 3,
      lang: "en",
      head: [],
      name: "Partner shops",
    });
    const total = sheet.rows.find((r) => r[0]?.value === "Total" && r[4])!;
    expect(total.map((c) => (c ? c.value : null)).slice(4)).toEqual([
      3,
      null,
      133,
      -6,
      127,
      54,
      40,
    ]);
    const shop = sheet.rows.find((r) => r[0]?.value === "دار لولوة" && r[1]?.value === 3)!;
    expect(shop[5]?.value).toBe(73);
    const totalSales = sheet.rows.find((r) => r[0]?.value === "Total sales")!;
    expect(totalSales[1]?.value).toBe(283);
  });
});

describe("the margins", () => {
  it("carry what the partner shops sold of each product", () => {
    const [line] = productMargins(
      marginRows([
        {
          currency: "BHD",
          product_id: "A",
          product_name: "Ghusn",
          units: 3,
          partner_units: 1,
          gross_sales: 150,
          partner_sales: 50,
          discounts: 0,
          returns: 0,
          cost_of_goods: 60,
        },
      ]),
      "BHD",
      "en",
    );
    expect(line).toMatchObject({ partnerUnits: 1, partnerSales: 50 });
  });
});
