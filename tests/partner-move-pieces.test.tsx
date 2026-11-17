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

  it("offers the first partner's pieces, all chosen, at the store's price and our SKU", () => {
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
        price: 32,
        code: "S-a",
        currentCode: "LUL-1",
      }),
    ]);
  });

  it("keeps the first partner's price when the size has no selling price", () => {
    const [row] = moveRows(
      [
        item("a", 1, {
          product_variants: { ...item("a", 1).product_variants!, selling_price: 0 },
        }),
      ],
      "lulwa",
      "en",
    );
    expect(row.price).toBe(30);
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
      { variantId: "a", quantity: 1, price: 32, externalCode: null },
    ]);
    expect(moveTotals(edited)).toEqual({ lines: 1, pieces: 1, value: 32 });
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
    expect(screen.getByText("3 pieces · BHD 96.000")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Review the move" }));
    expect(
      screen.getByText(/From دار لولوة to RA Boutique: 3 pieces worth BHD 96.000/),
    ).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Review the move" })).toBeDisabled();
  });
});
