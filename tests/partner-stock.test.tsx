import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Pieces held at partners, as staff read them: what an order has to collect from a partner,
// and whether a product's total at partners agrees with what the partners hold.

const holdsOf = vi.hoisted(() => ({ rows: [] as unknown[], asked: [] as string[] }));
const incubatorsData = {
  incubatorsQueries: {
    orderPickups: (brandId: string, orderId: string) => ({
      queryKey: ["incubators", brandId, "order-holds", orderId],
      queryFn: async () => {
        holdsOf.asked.push(orderId);
        return holdsOf.rows;
      },
      enabled: Boolean(brandId && orderId),
    }),
  },
};
vi.mock("../src/lib/data/incubators", () => incubatorsData);
vi.mock("@/lib/data/incubators", () => incubatorsData);
const brandContext = { useBrand: () => ({ id: "b1", slug: "pura" }) };
vi.mock("../src/lib/brand-context", () => brandContext);
vi.mock("@/lib/brand-context", () => brandContext);

const { holdIsOpen, partnerPickupLines, partnerStockMismatches, pickupLines, pieceName } =
  await import("../src/features/incubators/lib/partner-stock");
const { PartnerPickupNotice } =
  await import("../src/features/orders/components/PartnerPickupNotice");
const { partnerStockHint } = await import("../src/features/inventory/lib/stock-labels");

const hold = (patch: Record<string, unknown> = {}) => ({
  order_id: "o1",
  variant_id: "v1",
  incubator_id: "i1",
  quantity: 2,
  incubators: { name: "Souq Box", phone: "33112233" },
  product_variants: {
    sku: "AB-1",
    size: "M",
    color: "Black",
    products: { name: "Abaya", name_ar: "عباية" },
  },
  orders: { invoice_number: 1104, status: "confirmed", fulfillment_status: "NEEDS_PACKING" },
  ...patch,
});

beforeEach(() => {
  holdsOf.rows = [];
  holdsOf.asked = [];
});

describe("a piece an order took from a partner", () => {
  it("is still to be collected until the order is handed over or cancelled", () => {
    expect(holdIsOpen(hold())).toBe(true);
    expect(holdIsOpen(hold({ orders: { status: "packing", fulfillment_status: "SHIPPED" } }))).toBe(
      true,
    );
    for (const orders of [
      { status: "completed", fulfillment_status: "COMPLETED" },
      { status: "confirmed", fulfillment_status: "COMPLETED" },
      { status: "cancelled", fulfillment_status: "ON_HOLD" },
      { status: "confirmed", fulfillment_status: "delivered" },
    ]) {
      expect(holdIsOpen(hold({ orders })), JSON.stringify(orders)).toBe(false);
    }
  });

  it("is named by its product and the options that tell it apart, in the page's language", () => {
    expect(pieceName(hold().product_variants, "en")).toBe("Abaya · M / Black");
    expect(pieceName(hold().product_variants, "ar")).toBe("عباية · M / Black");
    // The placeholder option of a product with no sizes says nothing.
    expect(pieceName({ size: "Standard", color: null, products: { name: "Scarf" } }, "en")).toBe(
      "Scarf",
    );
    expect(pieceName({ sku: "X-9" }, "en")).toBe("X-9");
    expect(pieceName(null, "ar")).toBe("قطعة");
  });

  it("is listed with its partner, largest first, and not once handed over", () => {
    const lines = pickupLines(
      [
        hold({ quantity: 1 }),
        hold({ variant_id: "v2", incubator_id: "i2", quantity: 3, incubators: { name: "Arcade" } }),
        hold({ order_id: "o9", orders: { status: "completed", fulfillment_status: "COMPLETED" } }),
      ],
      "en",
    );
    expect(lines.map((line) => [line.quantity, line.partner, line.phone])).toEqual([
      [3, "Arcade", null],
      [1, "Souq Box", "33112233"],
    ]);
    expect(lines[1].orderNumber).toBe("1104");
  });

  it("is shown on its own partner's page only", () => {
    const holds = [hold(), hold({ variant_id: "v2", incubator_id: "i2" })];
    expect(partnerPickupLines(holds, "i1", "en")).toHaveLength(1);
    expect(partnerPickupLines(holds, "i3", "en")).toEqual([]);
    expect(partnerPickupLines(holds, null, "en")).toEqual([]);
  });
});

describe("the total at partners against what the partners hold", () => {
  const variant = (stock_incubator: number) => ({
    sku: "AB-1",
    stock_incubator,
    products: { name: "Abaya" },
  });

  it("agrees when the partners' quantities add up to the product's total", () => {
    const held = [
      { variant_id: "v1", quantity: 3, product_variants: variant(5) },
      { variant_id: "v1", quantity: 2, product_variants: variant(5) },
    ];
    expect(partnerStockMismatches(held, [{ id: "v1", ...variant(5) }], "en")).toEqual([]);
  });

  it("names a piece whose total is more, or less, than the partners hold", () => {
    const held = [{ variant_id: "v1", quantity: 2, product_variants: variant(5) }];
    expect(partnerStockMismatches(held, [], "en")).toEqual([
      { variantId: "v1", piece: "Abaya", onProduct: 5, atPartners: 2 },
    ]);
    expect(
      partnerStockMismatches(
        [{ variant_id: "v1", quantity: 4, product_variants: variant(1) }],
        [],
        "en",
      ),
    ).toEqual([{ variantId: "v1", piece: "Abaya", onProduct: 1, atPartners: 4 }]);
  });

  it("finds a total that no partner holds at all", () => {
    expect(
      partnerStockMismatches(
        [],
        [{ id: "v7", sku: "LOST", stock_incubator: 3, products: { name: "Shawl" } }],
        "en",
      ),
    ).toEqual([{ variantId: "v7", piece: "Shawl", onProduct: 3, atPartners: 0 }]);
  });
});

describe("the order's 'collect from a partner' notice", () => {
  const notice = (orderId: string | null) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PartnerPickupNotice orderId={orderId} lang="en" />
      </QueryClientProvider>,
    );

  it("says what to collect, from whom, and how to reach them", async () => {
    holdsOf.rows = [hold()];
    notice("o1");
    expect(await screen.findByText("Collect from a partner before packing")).toBeInTheDocument();
    expect(screen.getByText("2 × Abaya · M / Black")).toBeInTheDocument();
    expect(screen.getByText("Souq Box")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /33112233/ })).toHaveAttribute("href", "tel:33112233");
    expect(holdsOf.asked).toEqual(["o1"]);
  });

  it("shows nothing for an order that took nothing from a partner, or is handed over", async () => {
    const empty = notice("o1");
    await vi.waitFor(() => expect(holdsOf.asked).toEqual(["o1"]));
    expect(empty.container.textContent).toBe("");
    empty.unmount();

    holdsOf.rows = [hold({ orders: { status: "completed", fulfillment_status: "COMPLETED" } })];
    const done = notice("o2");
    await vi.waitFor(() => expect(holdsOf.asked).toContain("o2"));
    expect(done.container.textContent).toBe("");
  });

  it("asks nothing for an order that is not saved yet", () => {
    const { container } = notice("new");
    notice(null);
    expect(container.textContent).toBe("");
    expect(holdsOf.asked).toEqual([]);
  });
});

describe("the partners' quantity beside a variant", () => {
  it("says where it changes, in both languages", () => {
    expect(partnerStockHint(false)).toMatch(/Incubators page/);
    expect(partnerStockHint(true)).toContain("صفحة الحاضنات");
  });
});
