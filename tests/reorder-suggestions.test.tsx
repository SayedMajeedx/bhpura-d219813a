import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// What to order again: sizes that run out within three weeks at the rate they sell, after what
// is on its way, each with the pieces that cover six weeks, opening a new supplier order filled in.

const nav = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => nav.navigate }));
vi.mock("@/lib/brand-context", () => ({ useBrand: () => ({ id: "b1", slug: "pura" }) }));
vi.mock("../src/lib/brand-context", () => ({ useBrand: () => ({ id: "b1", slug: "pura" }) }));

const {
  reorderSuggestions,
  onOrderByVariant,
  soldByVariant,
  reorderParam,
  readReorderParam,
  formFromReorder,
} = await import("../src/features/supplier-orders/lib/reorder");
const { ReorderTab } = await import("../src/features/supplier-orders/components/ReorderTab");

const NOW = new Date("2026-10-30T12:00:00Z");
const V1 = "aaaaaaaa-0000-4000-8000-000000000001";
const V2 = "aaaaaaaa-0000-4000-8000-000000000002";
const V3 = "aaaaaaaa-0000-4000-8000-000000000003";
const V4 = "aaaaaaaa-0000-4000-8000-000000000004";
const old = "2026-01-01T00:00:00Z";
const products = [
  { id: "p1", name: "Abaya", name_ar: "عباية", name_en: "Abaya", image_url: null },
  {
    id: "p2",
    name: "Made",
    name_ar: null,
    name_en: "Made",
    image_url: null,
    is_made_to_order: true,
  },
  { id: "p3", name: "Hidden", name_ar: null, name_en: "Hidden", image_url: null, is_active: false },
];
const variant = (id: string, productId: string, stock: number, cost = 0) => ({
  id,
  product_id: productId,
  sku: null,
  size: id === V1 ? "S" : "M",
  color: null,
  fabric: null,
  option_four: null,
  option_five: null,
  stock_main: stock,
  stock_incubator: 0,
  cost_price: cost,
  created_at: old,
});
const variants = [
  variant(V1, "p1", 2, 12),
  variant(V2, "p1", 40, 12),
  variant(V3, "p2", 0),
  variant(V4, "p3", 0),
];

describe("the suggestions", () => {
  // 45 pieces in 45 days: one a day.
  const sold = new Map([
    [V1, 45],
    [V2, 45],
    [V3, 45],
    [V4, 45],
  ]);

  it("name the sizes that run out soon, after what is coming, with six weeks' pieces", () => {
    const lines = reorderSuggestions({ products, variants, sold, onOrder: new Map(), now: NOW });
    expect(lines).toEqual([
      expect.objectContaining({ variantId: V1, onHand: 2, daysLeft: 2, perDay: 1, suggested: 43 }),
    ]);
    // Ten on their way: it lasts twelve days and asks for fewer.
    const coming = reorderSuggestions({
      products,
      variants,
      sold,
      onOrder: new Map([[V1, 10]]),
      now: NOW,
    });
    expect(coming[0]).toMatchObject({ onOrder: 10, daysLeft: 12, suggested: 33 });
  });

  it("leave out made-to-order and hidden pieces, unsold sizes and sizes that last", () => {
    const lines = reorderSuggestions({ products, variants, sold, onOrder: new Map(), now: NOW });
    expect(lines.map((l) => l.variantId)).toEqual([V1]);
    expect(
      reorderSuggestions({ products, variants, sold: new Map(), onOrder: new Map(), now: NOW }),
    ).toEqual([]);
  });

  it("count what is coming from open orders only, never a customer's piece", () => {
    const line = (
      variant_id: string,
      quantity: number,
      received: number,
      order_item_id?: string,
    ) => ({
      id: `${variant_id}-${quantity}`,
      variant_id,
      product_id: "p1",
      description: "",
      quantity,
      received_quantity: received,
      unit_cost: 0,
      line_total: 0,
      sort_order: 0,
      order_item_id: order_item_id ?? null,
    });
    const order = (status: string, items: unknown[]) =>
      ({ status, items }) as unknown as Parameters<typeof onOrderByVariant>[0][number];
    const map = onOrderByVariant([
      order("ordered", [line(V1, 10, 3), line(V2, 5, 0, "customer-line")]),
      order("draft", [line(V1, 7, 0)]),
      order("received", [line(V1, 4, 4)]),
    ]);
    expect(map.get(V1)).toBe(7);
    expect(map.get(V2)).toBeUndefined();
    expect(
      soldByVariant([
        {
          order_items: [
            { variant_id: V1, quantity: 2 },
            { variant_id: null, quantity: 1 },
          ],
        },
      ]).get(V1),
    ).toBe(2);
  });

  it("travel to a new order and fill it in, leaving out what is not a size", () => {
    const param = reorderParam([
      { variantId: V1, quantity: 43 },
      { variantId: "nope", quantity: 2 },
    ]);
    expect(param).toBe(`${V1}:43`);
    expect(readReorderParam(`${param},${V1}:5,${V2}:0,x:3,${V2}:2.5`)).toEqual([
      { variantId: V1, quantity: 43 },
    ]);
    const variantById = new Map(variants.map((v) => [v.id, v]));
    const form = formFromReorder(
      [
        { variantId: V1, quantity: 43 },
        { variantId: V2, quantity: 5 },
      ],
      {
        variantById,
        sizes: new Map([["p1", [variants[0], variants[1]]]]),
        shelf: new Map([
          [V1, { cost: 12 }],
          [V2, { cost: 12 }],
        ]),
      },
    );
    expect(form.products).toHaveLength(1);
    expect(form.products[0]).toMatchObject({ productId: "p1", unitCost: "12" });
    expect(form.products[0].sizes).toEqual({
      [V1]: { quantity: "43", received: 0 },
      [V2]: { quantity: "5", received: 0 },
    });
  });
});

describe("the To reorder tab", () => {
  const catalog = {
    productName: () => "Abaya",
    sizeName: (id: string | null | undefined) => (id === V1 ? "S" : "M"),
  } as unknown as Parameters<typeof ReorderTab>[0]["catalog"];
  const lines = [
    {
      productId: "p1",
      variantId: V1,
      onHand: 2,
      onOrder: 0,
      perDay: 1,
      daysLeft: 2,
      suggested: 43,
    },
    {
      productId: "p1",
      variantId: V2,
      onHand: 0,
      onOrder: 4,
      perDay: 0.5,
      daysLeft: 0,
      suggested: 19,
    },
  ];

  it("lists each size with when it runs out, and opens an order with the ticked ones", () => {
    nav.navigate.mockClear();
    render(<ReorderTab lines={lines} catalog={catalog} isLoading={false} lang="en" />);
    expect(screen.getByText(/Runs out in 2 days/)).toBeInTheDocument();
    expect(screen.getByText(/Out now/)).toBeInTheDocument();
    const draft = screen.getByRole("button", { name: /New order with these sizes \(0\)/ });
    expect(draft).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Abaya · S" }));
    fireEvent.change(screen.getByLabelText("Pieces to order of Abaya · S"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: /New order with these sizes \(1\)/ }));
    expect(nav.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { slug: "pura", id: "new" },
        search: { reorder: `${V1}:30` },
      }),
    );
  });

  it("says so when nothing is about to run out, in Arabic too", () => {
    render(<ReorderTab lines={[]} catalog={catalog} isLoading={false} lang="ar" />);
    expect(screen.getByText(/لا مقاس يوشك أن ينفد/)).toBeInTheDocument();
  });
});
