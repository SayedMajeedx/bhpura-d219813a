import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  moveProblem,
  movePayload,
  moveRows,
  moveTargets,
  moveTotals,
  transferLabel,
} from "../src/features/incubators/lib/move-pieces";
import { incubatorSummary } from "../src/features/incubators/lib/summary";
import type { Incubator, StockItem } from "../src/features/incubators/types";

// Moving pieces from one partner shop to another from the admin (the owner's request of
// 2026-11-17: Pura is leaving دار لولوة for RA Boutique). The database moves them in one step
// (tests/partner-transfers-migration.test.ts); these are the dialog's rules and screen.

const client = vi.hoisted(() => () => ({ supabase: {} }));
vi.mock("../src/integrations/supabase/client", client);
vi.mock("@/integrations/supabase/client", client);

const { MovePiecesDialog } = await import("../src/features/incubators/components/MovePiecesDialog");

const partner = (id: string, name: string, extra: Partial<Incubator> = {}) =>
  ({
    id,
    name,
    is_active: true,
    commission_type: "percentage",
    commission_value: 0,
    currency: "BHD",
    ...extra,
  }) as Incubator;
const lulwa = partner("lulwa", "دار لولوة");
const ra = partner("ra", "RA Boutique", { commission_value: 15 });
const ended = partner("ended", "Ended", { is_active: false });

const item = (variant: string, quantity: number, extra: Partial<StockItem> = {}) =>
  ({
    id: `line-${variant}`,
    incubator_id: "lulwa",
    variant_id: variant,
    external_code: "LUL-1",
    quantity,
    consignment_price: 30,
    commission_type: "percentage",
    commission_value: 0,
    product_variants: {
      id: variant,
      sku: `S-${variant}`,
      barcode: null,
      size: "54",
      color: null,
      stock_main: 0,
      selling_price: 32,
      products: { name: "Abaya | Nasaq", name_ar: "عباية | نَسَق" },
    },
    ...extra,
  }) as StockItem;

describe("what can move", () => {
  it("goes to an active partner other than the one it leaves", () => {
    expect(moveTargets([lulwa, ra, ended], "lulwa").map((p) => p.id)).toEqual(["ra"]);
  });

  it("offers the first partner's pieces, all chosen, at their price there and our SKU", () => {
    const rows = moveRows(
      [item("a", 2), item("b", 0), { ...item("c", 1), incubator_id: "ra" }],
      "lulwa",
      "en",
    );
    expect(rows).toEqual([
      expect.objectContaining({
        variantId: "a",
        held: 2,
        chosen: true,
        quantity: 2,
        // Its price at the first partner (30), not the store's (32): a move keeps the price.
        price: 30,
        code: "S-a",
        currentCode: "LUL-1",
      }),
    ]);
  });

  it("takes the store's price for a piece with no price at the first partner", () => {
    const [row] = moveRows([item("a", 1, { consignment_price: 0 })], "lulwa", "en");
    expect(row.price).toBe(32);
  });

  it("is worth what the partner's card says, until a price is changed", () => {
    // Dar Lulwa (2026-11-19): two pieces at 24 there and 30 in the store made the move say 622
    // against the card's 610.
    const stock = [
      item("a", 22, { consignment_price: 25 }),
      item("b", 2, {
        consignment_price: 24,
        product_variants: { ...item("b", 1).product_variants!, selling_price: 30 },
      }),
    ];
    const card = incubatorSummary(stock, [], []).stockValue;
    expect(moveTotals(moveRows(stock, "lulwa", "en")).value).toBe(card);
    expect(card).toBe(598);
  });
});

describe("what stops a move, and what is sent", () => {
  const rows = moveRows([item("a", 2), item("b", 3)], "lulwa", "en");

  it("asks for the partner, a piece and no more than is held", () => {
    expect(moveProblem(rows, null, "en")).toMatch(/Choose the partner/);
    expect(
      moveProblem(
        rows.map((r) => ({ ...r, chosen: false })),
        "ra",
        "en",
      ),
    ).toMatch(/at least one piece/);
    expect(
      moveProblem(
        rows.map((r) => (r.variantId === "a" ? { ...r, quantity: 3 } : r)),
        "ra",
        "ar",
      ),
    ).toMatch(/أكبر مما عند المحل الشريك \(2\)/);
    expect(moveProblem(rows, "ra", "en")).toBeNull();
  });

  it("sends the chosen pieces with their price and code, an empty code as none", () => {
    const edited = rows.map((r) =>
      r.variantId === "b" ? { ...r, chosen: false } : { ...r, quantity: 1, code: " " },
    );
    expect(movePayload(edited)).toEqual([
      { variantId: "a", quantity: 1, price: 30, externalCode: null },
    ]);
    expect(moveTotals(edited)).toEqual({ lines: 1, pieces: 1, value: 30 });
  });

  it("numbers a batch as staff and partners read it", () => {
    expect(transferLabel(7)).toBe("TR-0007");
    expect(transferLabel(12345)).toBe("TR-12345");
  });
});

describe("the move dialog", () => {
  const page = (overrides: Record<string, unknown> = {}) =>
    ({
      isAr: false,
      lang: "en",
      dialog: "move",
      current: lulwa,
      currentId: "lulwa",
      incubators: [lulwa, ra, ended],
      allStock: [item("a", 2), item("b", 1)],
      money: (n: number) => `BHD ${n.toFixed(3)}`,
      busy: false,
      closeDialog: vi.fn(),
      movePieces: vi.fn(async () => true),
      ...overrides,
    }) as unknown as Parameters<typeof MovePiecesDialog>[0]["page"];

  it("lists the pieces, reviews them and moves them to the one other partner", async () => {
    const state = page();
    render(<MovePiecesDialog page={state} />);
    // The only other active partner is chosen, with its commission said.
    expect(screen.getByLabelText("To the partner shop")).toHaveValue("ra");
    expect(screen.getByText(/Commission from the partner's settings: 15%/)).toBeInTheDocument();
    // The total is in the list's bar and in the footer, beside the button: at the pieces' price
    // at Dar Lulwa (30), the figure the partner's card shows.
    expect(screen.getAllByText("3 pieces · BHD 90.000")).toHaveLength(2);
    expect(screen.getByText("Step 1 of 2 · Choose the pieces")).toBeInTheDocument();
    // Each product's sizes are under it.
    expect(screen.getAllByRole("heading", { level: 3 }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Review the move" }));
    expect(screen.getByText("Step 2 of 2 · Review")).toBeInTheDocument();
    // From and to are each in their own box, so a Latin name never reorders the Arabic.
    expect(screen.getByText("From").nextElementSibling).toHaveTextContent("دار لولوة");
    expect(screen.getByText("To").nextElementSibling).toHaveTextContent("RA Boutique");
    fireEvent.click(screen.getByRole("button", { name: "Move 3 pieces" }));
    expect(state.movePieces).toHaveBeenCalledWith(
      "ra",
      expect.arrayContaining([expect.objectContaining({ variantId: "a", quantity: 2 })]),
      "",
    );
  });

  it("says so when there is no other partner to move to", () => {
    render(<MovePiecesDialog page={page({ incubators: [lulwa, ended] })} />);
    expect(screen.getByText(/no other active partner shop/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review the move" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Close" }).length).toBeGreaterThan(0);
  });
});
