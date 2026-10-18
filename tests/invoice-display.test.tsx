import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  displayPhone,
  invoiceDate,
  invoicePayment,
  invoicePdfMethod,
  invoiceTitle,
  showsTaxLine,
} from "../src/lib/invoice-display";
import { InvoiceLineItems } from "../src/components/orders/InvoiceLineItems";

// From a review of Pura's invoice #1096 (2026-10-18): a cash order paid in full read "Advance
// paid − BHD 54.000, remaining due BHD 0.000" beside a PAID badge; "VAT (0%)" showed for a store
// with no VAT number; the date was 08/30/2026 and the phone 97339862026; on a phone the line's
// total sat off the side of a 440px table; and Download PDF was a picture of the page.

describe("what an invoice says was paid", () => {
  it("is paid in full when the advance equals the total, as the database records it", () => {
    expect(invoicePayment({ payment_status: "paid", total: 54, advance_paid: 54 })).toEqual({
      kind: "paid",
      paid: 54,
    });
    expect(
      invoicePayment({ payment_status: "partially_paid", total: 30, advance_paid: 30 }),
    ).toMatchObject({ kind: "paid" });
  });

  it("shows a balance only for a real part payment", () => {
    expect(
      invoicePayment({ payment_status: "partially_paid", total: 30, advance_paid: 12 }),
    ).toEqual({ kind: "part_paid", paid: 12, remaining: 18 });
    expect(invoicePayment({ payment_status: "unpaid", total: 30, advance_paid: 0 })).toEqual({
      kind: "unpaid",
    });
    expect(invoicePayment({ payment_status: "refunded", total: 30, advance_paid: 30 })).toEqual({
      kind: "closed",
    });
  });
});

describe("an invoice's facts", () => {
  it("writes the date out, in Western digits in both languages", () => {
    expect(invoiceDate("2026-08-30T10:00:00Z", "en")).toBe("30 Aug 2026");
    expect(invoiceDate("2026-08-30", "ar")).toMatch(/^30 .+ 2026$/);
    expect(invoiceDate("2026-08-30", "ar")).not.toMatch(/[٠-٩]/);
    expect(invoiceDate(null, "en")).toBe("—");
  });

  it("writes a phone number as people read it", () => {
    expect(displayPhone("97339862026")).toBe("+973 3986 2026");
    expect(displayPhone("+97339950016")).toBe("+973 3995 0016");
    expect(displayPhone("39950016")).toBe("+973 3995 0016");
    expect(displayPhone("966501234567")).toBe("+966 50 123 4567");
    expect(displayPhone("4479460000")).toBe("+4479460000");
    expect(displayPhone(" ")).toBe("");
  });

  it("has a VAT line when tax was charged or the store is registered", () => {
    expect(showsTaxLine({ tax_rate: 0, tax_amount: 0 }, null)).toBe(false);
    expect(showsTaxLine({ tax_rate: 10, tax_amount: 5 }, null)).toBe(true);
    expect(showsTaxLine({ tax_rate: 0, tax_amount: 0 }, "220001234500002")).toBe(true);
  });

  it("titles the invoice in the store's words, else a tax invoice when registered", () => {
    expect(invoiceTitle("Receipt", "2200", "en")).toBe("Receipt");
    expect(invoiceTitle(null, "2200", "en")).toBe("TAX INVOICE");
    expect(invoiceTitle(null, null, "ar")).toBe("فاتورة");
  });

  it("prints to PDF where the browser can, and keeps the picture in app browsers", () => {
    expect(invoicePdfMethod("Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1")).toBe("print");
    expect(invoicePdfMethod("Mozilla/5.0 (iPhone) Instagram 300.0")).toBe("image");
    expect(invoicePdfMethod("Mozilla/5.0 [FBAN/FBIOS;FBAV/450.0]")).toBe("image");
  });
});

describe("an invoice's lines", () => {
  const items = [
    {
      description: "Abaya with tie",
      quantity: 2,
      unit_price: 22,
      original_price: 25,
      customization_total: 0,
      line_total: 44,
      selected_variant: { color: "Brown", size: "55" },
    },
  ];
  const money = (n: number) => `BHD ${Number(n).toFixed(3)}`;

  it("are a table from sm and on paper, and a card per line on a phone", () => {
    const view = render(
      <InvoiceLineItems
        items={items}
        lang="en"
        addonDefaults={{}}
        money={money}
        labels={{ desc: "Description", qty: "Qty", unit: "Unit", total: "Total" }}
        textColor="#111111"
        dividerColor="#eeeeee"
        headerBg="#f8fafc"
        headerFg="#0f172a"
      />,
    );
    const table = view.container.querySelector("table")!;
    expect(table.className).toContain("hidden");
    expect(table.className).toContain("sm:table");
    expect(table.className).toContain("print:table");

    const card = within(screen.getByRole("list", { name: "Description" })).getByRole("listitem");
    // The line's total sits beside its name, not off the side of the screen.
    expect(card.textContent).toContain("BHD 44.000");
    expect(card.textContent).toContain("2 × BHD 22.000");
    expect(card.textContent).toContain("BHD 25.000");
    expect(within(card).getByText("Brown")).toBeInTheDocument();
    expect(screen.getByRole("list").className).toContain("print:hidden");
  });
});
