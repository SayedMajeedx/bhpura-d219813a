import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  choosePicks,
  chosenPicks,
  chosenState,
  pickGroups,
  pickTotals,
  type PickRow,
} from "../src/features/incubators/lib/stock-move";
import {
  returnPayload,
  returnProblem,
  returnRows,
} from "../src/features/incubators/lib/return-pieces";
import {
  fromPickPatch,
  transferPick,
  transferProblem,
  type TransferRowState,
} from "../src/features/incubators/lib/batch-transfer";
import type { StockItem } from "../src/features/incubators/types";

// The partner page's one stock flow (the owner's request of 2026-11-19): sending to a partner,
// moving between partners and bringing pieces back to the store share one picker, one review
// and one task frame; a return is many sizes in one numbered batch (it was one size at a time).

const client = vi.hoisted(() => () => ({ supabase: {} }));
vi.mock("../src/integrations/supabase/client", client);
vi.mock("@/integrations/supabase/client", client);

const { ReturnPiecesDialog } =
  await import("../src/features/incubators/components/ReturnPiecesDialog");

const pick = (variantId: string, over: Partial<PickRow> = {}): PickRow => ({
  variantId,
  productKey: "p1",
  product: "Abaya | Watar",
  option: variantId,
  available: 2,
  chosen: false,
  quantity: 0,
  ...over,
});

describe("choosing pieces", () => {
  it("never chooses a size with nothing to take, and a chosen size starts at all it has", () => {
    const rows = [pick("52"), pick("54", { available: 0 }), pick("56", { quantity: 1 })];
    const chosen = choosePicks(rows, new Set(["52", "54", "56"]), true);
    expect(chosen.map((row) => [row.variantId, row.chosen, row.quantity])).toEqual([
      ["52", true, 2],
      ["54", false, 0],
      // A number already set is kept.
      ["56", true, 1],
    ]);
    expect(choosePicks(chosen, new Set(["52"]), false)[0].chosen).toBe(false);
  });

  it("says when a product's sizes are all, some or none chosen, sold-out ones aside", () => {
    expect(chosenState([pick("52", { chosen: true }), pick("54", { available: 0 })])).toBe(true);
    expect(chosenState([pick("52", { chosen: true }), pick("54")])).toBe("indeterminate");
    expect(chosenState([pick("52"), pick("54")])).toBe(false);
  });

  it("groups a product's sizes, and totals only what is chosen", () => {
    const rows = [
      pick("52", { chosen: true, quantity: 2, price: 45 }),
      pick("x", { productKey: "p2", product: "Abaya | Layl", available: 3 }),
      pick("54", { chosen: true, quantity: 1, price: 45 }),
    ];
    expect(
      pickGroups(rows).map((group) => [group.product, group.available, group.rows.length]),
    ).toEqual([
      ["Abaya | Watar", 4, 2],
      ["Abaya | Layl", 3, 1],
    ]);
    expect(chosenPicks(rows).map((row) => row.variantId)).toEqual(["52", "54"]);
    expect(pickTotals(rows)).toEqual({ lines: 2, pieces: 3, value: 135 });
  });
});

const item = (variant: string, quantity: number, extra: Partial<StockItem> = {}) =>
  ({
    id: `line-${variant}`,
    incubator_id: "lulwa",
    variant_id: variant,
    external_code: variant === "a" ? "LUL-1" : null,
    quantity,
    consignment_price: 30,
    commission_type: "percentage",
    commission_value: 0,
    product_variants: {
      id: variant,
      sku: `S-${variant}`,
      barcode: null,
      size: variant === "a" ? "52" : "54",
      color: null,
      stock_main: 0,
      selling_price: 32,
      products: { id: "p1", name: "Abaya | Nasaq", name_ar: "عباية | نَسَق" },
    },
    ...extra,
  }) as StockItem;

describe("bringing pieces back to the store", () => {
  const stock = [item("a", 2), item("b", 3), item("c", 0), { ...item("d", 4), incubator_id: "ra" }];

  it("offers what the partner holds, nothing chosen, each size with its code there", () => {
    const rows = returnRows(stock, "lulwa", "en");
    expect(rows.map((row) => [row.variantId, row.available, row.chosen])).toEqual([
      ["a", 2, false],
      ["b", 3, false],
    ]);
    expect(rows[0].note).toBe("Code LUL-1");
    // No partner code: our SKU.
    expect(rows[1].note).toBe("Code S-b");
  });

  it("starts the size a row's Return named at all the partner holds", () => {
    const rows = returnRows(stock, "lulwa", "en", "b");
    expect(rows.find((row) => row.variantId === "b")).toMatchObject({ chosen: true, quantity: 3 });
    expect(rows.find((row) => row.variantId === "a")?.chosen).toBe(false);
  });

  it("asks for a piece, never more than is held, and sends every chosen size at once", () => {
    const rows = returnRows(stock, "lulwa", "en");
    expect(returnProblem(rows, "en")).toBe("Choose at least one piece");
    const chosen = choosePicks(rows, new Set(["a", "b"]), true);
    expect(returnProblem(chosen, "en")).toBeNull();
    expect(returnPayload(chosen)).toEqual([
      { variantId: "a", quantity: 2 },
      { variantId: "b", quantity: 3 },
    ]);
    const over = chosen.map((row) => (row.variantId === "a" ? { ...row, quantity: 5 } : row));
    expect(returnProblem(over, "ar")).toMatch(/الكمية أكبر مما عند المحل الشريك \(2\)/);
  });
});

describe("sending to a partner, in the shared picker's words", () => {
  const row: TransferRowState = {
    variantId: "v52",
    productId: "p1",
    productName: "Abaya | Watar",
    category: "",
    variantLabel: "52 / Black",
    size: "52",
    color: "Black",
    sku: "4001",
    barcode: "",
    stockMain: 3,
    stockIncubator: 0,
    unallocatedInc: 0,
    allocatedInc: 0,
    sellingPrice: 45,
    consignmentPrice: 45,
    externalCode: "",
    selected: true,
    transferQty: 2,
    totalAvailable: 3,
  };

  it("reads a size as a pick and a change back as the transfer's", () => {
    expect(transferPick(row)).toMatchObject({
      variantId: "v52",
      product: "Abaya | Watar",
      option: "52 / Black",
      available: 3,
      note: "4001",
      chosen: true,
      quantity: 2,
      price: 45,
      code: "",
    });
    expect(fromPickPatch({ quantity: 1, price: 40, code: "RA-1", chosen: false })).toEqual({
      transferQty: 1,
      consignmentPrice: 40,
      externalCode: "RA-1",
      selected: false,
    });
  });

  it("asks for the partner, then a piece, then no more than a size has", () => {
    expect(transferProblem([row], false, "en")).toBe("Choose the partner shop the pieces go to");
    expect(transferProblem([{ ...row, selected: false }], true, "en")).toBe(
      "Choose at least one piece",
    );
    expect(transferProblem([{ ...row, transferQty: 9 }], true, "en")).toBe(
      "1 size asks for more than is in stock",
    );
    expect(transferProblem([row], true, "en")).toBeNull();
  });
});

describe("the return dialog", () => {
  const page = (overrides: Record<string, unknown> = {}) =>
    ({
      isAr: false,
      lang: "en",
      dialog: "return",
      current: { id: "lulwa", name: "دار لولوة" },
      currentId: "lulwa",
      allStock: [item("a", 2), item("b", 3)],
      activeItem: null,
      storeName: "Pura Line",
      money: (n: number) => `BHD ${n.toFixed(3)}`,
      busy: false,
      closeDialog: vi.fn(),
      returnPieces: vi.fn(async () => true),
      ...overrides,
    }) as unknown as Parameters<typeof ReturnPiecesDialog>[0]["page"];

  it("chooses several sizes, reviews them and brings them back in one batch", () => {
    const state = page();
    render(<ReturnPiecesDialog page={state} />);
    expect(screen.getByText("Step 1 of 2 · Choose the pieces")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review the return" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Every size of Abaya | Nasaq" }));
    fireEvent.click(screen.getByRole("button", { name: "Review the return" }));
    expect(screen.getByText("From").nextElementSibling).toHaveTextContent("دار لولوة");
    expect(screen.getByText("To").nextElementSibling).toHaveTextContent("Pura Line");
    // A return has no price to say.
    expect(screen.queryByText(/worth/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Return 5 pieces" }));
    expect(state.returnPieces).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ variantId: "a", chosen: true, quantity: 2 }),
        expect.objectContaining({ variantId: "b", chosen: true, quantity: 3 }),
      ]),
      "",
    );
  });

  it("opens from a row's Return with that size chosen", () => {
    render(<ReturnPiecesDialog page={page({ activeItem: item("b", 3) })} />);
    expect(screen.getByRole("checkbox", { name: "Abaya | Nasaq · 54" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Review the return" })).toBeEnabled();
  });
});
