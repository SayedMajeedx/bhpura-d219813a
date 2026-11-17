import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  sheetLines,
  sheetTotals,
  transferFileName,
  transferHtml,
  transferMessage,
  transferSheet,
  type SheetContext,
  type TransferRow,
} from "../src/features/incubators/lib/transfer-sheet";
import { partnerStockSheet } from "../src/features/incubators/lib/stock-sheet";
import type { StockItem } from "../src/features/incubators/types";

// A transfer's sheet (step 3 of the partner transfers plan, 2026-11-17): the new partner is
// handed an Excel of every batch with its prices and codes, a delivery note both sides sign,
// and a WhatsApp message. Read from the copy kept of each line as it was sent.

const client = vi.hoisted(() => () => ({ supabase: {} }));
vi.mock("../src/integrations/supabase/client", client);
vi.mock("@/integrations/supabase/client", client);

const { IncubatorTransfersTab, TransferSheetDialog } =
  await import("../src/features/incubators/components/TransferSheet");

const money = (n: number) => `BHD ${n.toFixed(3)}`;
const line = (
  over: Partial<NonNullable<TransferRow["incubator_transfer_items"]>[number]> = {},
) => ({
  id: "i1",
  variant_id: "v1",
  quantity: 2,
  external_code: "RA-001",
  price: 35,
  commission_type: "percentage",
  commission_value: 15,
  previous_code: "4046",
  product_name: "Abaya | Athar",
  product_name_ar: "عباية | أثر",
  product_name_en: "Abaya | Athar",
  size: "53",
  color: null,
  sku: "S80-53",
  barcode: "6291000000017",
  ...over,
});
const move: TransferRow = {
  id: "t1",
  number: 3,
  kind: "move",
  from_incubator_id: "lulwa",
  to_incubator_id: "ra",
  pieces: 3,
  notes: "First batch",
  created_at: "2026-11-17T10:00:00Z",
  incubator_transfer_items: [
    line(),
    line({
      id: "i2",
      variant_id: "v2",
      quantity: 1,
      external_code: null,
      price: 24,
      commission_type: "fixed",
      commission_value: 2,
      size: "قياسي",
      sku: null,
    }),
  ],
};
const context: SheetContext = {
  lang: "en",
  store: "Pura Line",
  from: "دار لولوة",
  to: "RA Boutique",
  partner: "RA Boutique",
  date: "17 Nov 2026",
  money,
  digits: 3,
};

describe("a transfer's lines", () => {
  it("carry the code, the piece and what the store is due once the commission is taken", () => {
    const [first, second] = sheetLines(move, money, "en");
    expect(first).toMatchObject({
      code: "RA-001",
      sku: "S80-53",
      nameAr: "عباية | أثر",
      size: "53",
      quantity: 2,
      price: 35,
      total: 70,
      commission: "15%",
      duePerPiece: 29.75,
    });
    // No new code: the one it carried at the partner it left; a default size is not printed.
    expect(second).toMatchObject({
      code: "4046",
      size: "",
      commission: "BHD 2.000 each",
      duePerPiece: 22,
    });
    expect(sheetTotals([first, second])).toEqual({ pieces: 3, value: 94, due: 81.5 });
  });
});

describe("the files", () => {
  it("are an Excel sheet named by the batch, with a heading block, a row a line and totals", () => {
    const sheet = transferSheet(move, context);
    expect(sheet.name).toBe("TR-0003");
    expect(sheet.rtl).toBe(false);
    expect(sheet.rows[1][1]).toMatchObject({ value: "TR-0003", text: true });
    expect(sheet.rows[6].map((cell) => cell?.value)).toEqual([
      "#",
      "Partner code",
      "SKU",
      "Barcode",
      "المنتج",
      "Product",
      "Size",
      "Colour",
      "Qty",
      "Unit price",
      "Total",
      "Commission",
      "Due to us per piece",
    ]);
    expect(sheet.rows[7][1]).toMatchObject({ value: "RA-001", text: true });
    expect(sheet.rows[7][10]).toMatchObject({ value: 70 });
    const totals = sheet.rows.at(-1)!;
    expect(totals[8]).toMatchObject({ value: 3, total: true });
    expect(totals[10]).toMatchObject({ value: 94, total: true });
    expect(transferFileName("pura", 3)).toBe("pura-TR-0003.xlsx");
  });

  it("are a delivery note with both signatures and nothing unescaped", () => {
    const html = transferHtml({ ...move, notes: "<b>fragile</b>" }, { ...context, lang: "ar" });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("TR-0003");
    expect(html).toContain("سلّم");
    expect(html).toContain("استلم");
    expect(html).toContain("&lt;b&gt;fragile&lt;/b&gt;");
    expect(html).not.toContain("<b>fragile</b>");
  });

  it("are a message to the partner with the batch, its pieces and value", () => {
    expect(transferMessage(move, context)).toBe(
      [
        "Hello RA Boutique, here is a stock transfer from Pura Line.",
        "Transfer TR-0003 · 17 Nov 2026",
        "Pieces: 3",
        "Value: BHD 94.000",
        "The details file is attached.",
      ].join("\n"),
    );
  });

  it("include what a partner holds today as one sheet", () => {
    const stock = [
      {
        id: "s1",
        incubator_id: "lulwa",
        variant_id: "v1",
        external_code: "4046",
        quantity: 2,
        consignment_price: 35,
        commission_type: "percentage",
        commission_value: 0,
        product_variants: {
          id: "v1",
          sku: "S80-53",
          barcode: null,
          size: "53",
          color: null,
          stock_main: 0,
          selling_price: 35,
          products: { name: "Abaya | Athar", name_ar: "عباية | أثر" },
        },
      },
      { id: "s2", incubator_id: "lulwa", variant_id: "v2", quantity: 0 },
    ] as unknown as StockItem[];
    const sheet = partnerStockSheet(stock, {
      lang: "ar",
      store: "Pura Line",
      partner: "دار لولوة",
      date: "17/11/2026",
      digits: 3,
    });
    expect(sheet.rtl).toBe(true);
    expect(sheet.rows).toHaveLength(6);
    expect(sheet.rows[4][4]).toMatchObject({ value: "عباية | أثر" });
    expect(sheet.rows.at(-1)![10]).toMatchObject({ value: 70, total: true });
  });
});

describe("on the partner's page", () => {
  const page = (overrides: Record<string, unknown> = {}) =>
    ({
      isAr: false,
      lang: "en",
      locale: "en-BH",
      currency: "BHD",
      storeName: "Pura Line",
      brand: { slug: "pura" },
      currentId: "ra",
      current: { id: "ra", name: "RA Boutique" },
      incubators: [
        { id: "lulwa", name: "دار لولوة", phone: null },
        { id: "ra", name: "RA Boutique", phone: "+973 3300 0000" },
      ],
      allStock: [],
      transfers: [
        move,
        {
          ...move,
          id: "t9",
          number: 9,
          from_incubator_id: null,
          to_incubator_id: "other",
          kind: "send",
        },
      ],
      transfersLoading: false,
      shownTransferId: null,
      showTransfer: vi.fn(),
      money,
      ...overrides,
    }) as unknown as Parameters<typeof IncubatorTransfersTab>[0]["page"];

  it("lists the partner's own batches with their files and a WhatsApp to the partner", () => {
    render(<IncubatorTransfersTab page={page()} />);
    expect(screen.getByText("TR-0003")).toBeInTheDocument();
    expect(screen.queryByText("TR-0009")).toBeNull();
    expect(
      screen.getByText(/Moved from دار لولوة to RA Boutique · 3 pieces · BHD 94.000/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WhatsApp/ }).getAttribute("href")).toContain(
      "wa.me/97333000000",
    );
    expect(screen.getByRole("button", { name: /Delivery note/ })).toBeInTheDocument();
  });

  it("opens a batch's sheet after it was made", () => {
    render(<TransferSheetDialog page={page({ shownTransferId: "t1" })} />);
    expect(screen.getByText("TR-0003")).toBeInTheDocument();
    expect(screen.getByText("3 pieces · BHD 94.000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Excel/ })).toBeInTheDocument();
  });
});
