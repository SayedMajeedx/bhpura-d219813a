import { describe, expect, it } from "vitest";
import {
  afterSendActions,
  sentPiecesMessage,
  sheetWhere,
  whereSentence,
} from "../src/features/supplier-orders/lib/after-send";
import {
  sendProblems,
  sendRequest,
  type SendForm,
} from "../src/features/supplier-orders/lib/customer-pieces";
import { supplierOrderSheets } from "../src/features/supplier-orders/lib/supplier-sheets";
import {
  pricesToAdd,
  type SupplierOrderLine,
} from "../src/features/supplier-orders/lib/order-state";
import {
  jobSheetHtml,
  jobSheetsHtml,
  type JobSheetLine,
} from "../src/features/orders/lib/job-sheet";
import { toWorkshopPieces, toWorkshopSuppliers } from "../src/lib/data/supplier-orders/workshop";

// One "Send to workshop" step (step 2 of docs/workshop-flow-plan.md): where a piece is, what the
// panel after a send offers, the send without prices, the supplier order's sheets in one print,
// and the readers with no amounts.

const piece = (over: Record<string, unknown> = {}) =>
  toWorkshopPieces([
    {
      order_item_id: "oi-1",
      item_id: "pol-1",
      purpose: "make",
      quantity: 1,
      received_quantity: 0,
      price_pending: true,
      po_id: "po-1",
      po_number: "PO-0007",
      expected_at: "2026-11-12",
      vendor_id: "v1",
      vendor_name: "Umm Ali",
      vendor_phone: "+97333334444",
      preferred_language: "en",
      ...over,
    },
  ])[0];

describe("where an order's pieces are", () => {
  it("is the supplier order of a piece still out, else of the newest one", () => {
    const back = piece({ po_number: "PO-0003", received_quantity: 1, po_id: "po-3" });
    const out = piece();
    expect(sheetWhere([out, back], { atWorkshop: true })).toEqual({
      supplier: "Umm Ali",
      poNumber: "PO-0007",
      expectedAt: "2026-11-12",
    });
    expect(sheetWhere([back], { atWorkshop: false })?.poNumber).toBe("PO-0003");
  });

  it("is our workshop while the order is at the workshop with no supplier, else nothing", () => {
    expect(sheetWhere([], { atWorkshop: true })).toEqual({
      supplier: null,
      poNumber: null,
      expectedAt: null,
    });
    expect(sheetWhere([], { atWorkshop: false })).toBeNull();
  });

  it("is said in a sentence in each language", () => {
    const where = { supplier: "Umm Ali", poNumber: "PO-0007", expectedAt: null };
    expect(whereSentence(where, "en")).toBe("With Umm Ali on PO-0007");
    expect(whereSentence(where, "ar")).toBe("عند Umm Ali على PO-0007");
    expect(whereSentence({ supplier: null, poNumber: null, expectedAt: null }, "en")).toBe(
      "In our workshop",
    );
  });
});

describe("what the panel after a send offers", () => {
  it("the sheet, the supplier's message, the customer and the supplier order, when each can be", () => {
    expect(
      afterSendActions({
        inHouse: false,
        canPrint: true,
        supplierPhone: "+97333334444",
        customerReachable: true,
        canOpenOrder: true,
      }),
    ).toEqual(["print", "message", "tell", "open"]);
    expect(
      afterSendActions({
        inHouse: false,
        canPrint: false,
        supplierPhone: "  ",
        customerReachable: false,
        canOpenOrder: false,
      }),
    ).toEqual([]);
  });

  it("no supplier to write to and no supplier order for our own workshop", () => {
    expect(
      afterSendActions({
        inHouse: true,
        canPrint: true,
        supplierPhone: "+97333334444",
        customerReachable: true,
        canOpenOrder: true,
      }),
    ).toEqual(["print", "tell"]);
  });
});

describe("sending without seeing costs", () => {
  const form: SendForm = {
    vendorId: "v1",
    target: "new",
    expectedAt: "2026-11-12",
    pieces: { "oi-1": { send: true, cost: "" } },
  };

  it("asks no price, and sends every piece at 0 for finance staff to price", () => {
    expect(sendProblems(form)).toEqual([{ cost: "oi-1" }]);
    expect(sendProblems(form, { prices: false })).toEqual([]);
    expect(
      sendRequest({ ...form, pieces: { "oi-1": { send: true, cost: "18" } } }, { prices: false })
        .lines,
    ).toEqual([{ order_item_id: "oi-1", unit_cost: 0 }]);
  });

  it("still needs a supplier and a piece", () => {
    expect(sendProblems({ ...form, vendorId: "", pieces: {} }, { prices: false })).toEqual([
      "vendor",
      "nothing",
    ]);
  });
});

const line = (over: Partial<JobSheetLine & { id: string }> = {}) => ({
  id: "oi-1",
  product_id: "p",
  variant_id: "v",
  description: "Black abaya",
  quantity: 1,
  location: "custom",
  custom_field_values: [{ key: "length", label_ar: "الطول", label_en: "Length", value: "56 in" }],
  ...over,
});

describe("the supplier's message about pieces just sent", () => {
  it("lists each piece with its measurements, with no price and no customer", () => {
    const message = sentPiecesMessage({
      lines: [line()],
      products: [],
      vendorName: "Umm Ali",
      storeName: "Pura",
      where: { supplier: "Umm Ali", poNumber: "PO-0007", expectedAt: "2026-11-12" },
      lang: "en",
    });
    expect(message).toContain("Hello Umm Ali,");
    expect(message).toContain("Pura's order PO-0007, due 12/11/2026:");
    expect(message).toContain("Length: 56 in");
    expect(message).not.toMatch(/price|total/i);
  });
});

describe("a supplier order's job sheets", () => {
  const items = (
    [
      { id: "a", order_item_id: "oi-1", customer_order: { id: "o-1", invoice_number: 1042 } },
      { id: "b", order_item_id: "oi-2", customer_order: { id: "o-2", invoice_number: 1043 } },
      { id: "c", order_item_id: "oi-3", customer_order: { id: "o-1", invoice_number: 1042 } },
      { id: "d", order_item_id: null, variant_id: "v-store" },
    ] as Array<Partial<SupplierOrderLine>>
  ).map(
    (l, i) => ({ quantity: 1, received_quantity: 0, sort_order: i, ...l }) as SupplierOrderLine,
  );
  const order = { vendor_name: "Umm Ali", po_number: "PO-0007", expected_at: "2026-11-12", items };
  const details = [
    line({ id: "oi-1", description: "Abaya one" }),
    line({ id: "oi-2", description: "Abaya two" }),
    line({ id: "oi-3", description: "Abaya three" }),
  ];
  const sheets = (onlyOrderItemIds?: string[]) =>
    supplierOrderSheets({
      order,
      details,
      products: [],
      sheetLang: "en",
      brand: "Pura",
      workshop: { ar: "الخيّاط", en: "Tailor" },
      onlyOrderItemIds,
    });

  it("is one sheet per customer's order, each with its pieces and who has them", () => {
    const list = sheets();
    expect(list.map((s) => s.orderNumber)).toEqual([1042, 1043]);
    const first = list[0];
    expect(first.lang === "en" && first.pieces.map((p) => p.title)).toEqual([
      "Abaya one",
      "Abaya three",
    ]);
    expect(first.where).toEqual({
      supplier: "Umm Ali",
      poNumber: "PO-0007",
      expectedAt: "2026-11-12",
    });
    expect(first.customerName).toBeNull();
  });

  it("can be only a batch just sent", () => {
    expect(sheets(["oi-2"]).map((s) => s.orderNumber)).toEqual([1043]);
  });

  it("prints in one window, each on a page of its own, saying who has the piece", () => {
    const html = jobSheetsHtml(sheets());
    expect(html.match(/<div class="sheet"/g)).toHaveLength(2);
    expect(html).toContain(".sheet + .sheet { break-before: page;");
    expect(html).toContain("Supplier:</b>");
    expect(html).toContain("PO-0007");
    expect(html).toContain("Sheet for #1042");
    expect(html).not.toMatch(/BHD|price|phone/i);
  });

  it("says when the piece is made in the store's own workshop", () => {
    const [first] = sheets();
    const html = jobSheetHtml({
      ...first,
      where: { supplier: null, poNumber: null, expectedAt: null },
    });
    expect(html).toContain("In our workshop");
    expect(html).not.toContain("Sheet for");
  });
});

describe("prices still to add", () => {
  it("are counted on an order that is not cancelled", () => {
    const items = [{ price_pending: true }, { price_pending: false }, {}] as SupplierOrderLine[];
    expect(pricesToAdd({ status: "ordered", items })).toBe(1);
    expect(pricesToAdd({ status: "cancelled", items })).toBe(0);
  });
});

describe("the readers with no amounts", () => {
  it("read suppliers with their language and open orders, and drop an unknown language", () => {
    expect(
      toWorkshopSuppliers([
        {
          id: "v1",
          name: "Umm Ali",
          phone: null,
          preferred_language: "ur",
          open_orders: [{ id: "po-1", po_number: "PO-0007", expected_at: null }],
        },
      ]),
    ).toEqual([
      {
        id: "v1",
        name: "Umm Ali",
        phone: null,
        language: null,
        openOrders: [{ id: "po-1", poNumber: "PO-0007", expectedAt: null }],
      },
    ]);
    expect(toWorkshopSuppliers(null)).toEqual([]);
  });

  it("read where pieces are", () => {
    expect(piece()).toMatchObject({ pricePending: true, language: "en", purpose: "make" });
    expect(piece({ purpose: "fix" }).purpose).toBe("fix");
  });
});
