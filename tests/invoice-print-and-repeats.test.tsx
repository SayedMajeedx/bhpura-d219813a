import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { invoicePrintCss } from "../src/lib/invoice-display";
import { withoutRepeatedOptions } from "../src/lib/order-custom-fields";
import { InvoiceLineItems } from "../src/components/orders/InvoiceLineItems";
import { InvoicePreviewLineDetails } from "../src/components/orders/InvoicePreviewLineDetails";
import { jobSheetPieces } from "../src/features/orders/lib/job-sheet";

// The owner's report of 2026-11-05, on Pura's invoice 1106: Download PDF left a white band round
// the dark invoice, cut the terms across two pages, and printed "Color: أسود" twice on one line,
// once from the variant ("اسود") and once from a product field that asked for the colour too.

const axes = {
  color: { label: "Color", visible: true },
  size: { label: "Size", visible: true },
  fabric: { label: "Fabric", visible: true },
};
const field = (label_en: string, value: string, label_ar = label_en) => ({
  key: `f-${label_en}`,
  label_en,
  label_ar,
  value,
});

describe("an answer beside the options", () => {
  it("goes when it only repeats an option, however the word is spelt", () => {
    const kept = withoutRepeatedOptions([field("Color", "أسود")], { color: "اسود" }, axes, "en");
    expect(kept).toEqual([]);
  });

  it("goes when it says the option in the store's other language", () => {
    expect(
      withoutRepeatedOptions([field("Color", "Black")], { color: "اسود" }, axes, "en"),
    ).toEqual([]);
  });

  it("stays under another name, even with the same value", () => {
    const length = field("Length - Size", "54");
    expect(withoutRepeatedOptions([length], { size: "54" }, axes, "en")).toEqual([length]);
  });

  it("stays when it says something the option does not", () => {
    const answer = field("Color", "Navy");
    expect(withoutRepeatedOptions([answer], { color: "اسود" }, axes, "en")).toEqual([answer]);
  });

  it("stays when the option is not printed, so nothing is lost", () => {
    const answer = field("Color", "أسود");
    const hidden = { ...axes, color: { label: "Color", visible: false } };
    expect(withoutRepeatedOptions([answer], { color: "اسود" }, hidden, "en")).toEqual([answer]);
    expect(withoutRepeatedOptions([answer], null, axes, "en")).toEqual([answer]);
  });

  it("reads the names in the reader's language", () => {
    const arabicAxes = { ...axes, color: { label: "اللون", visible: true } };
    const answer = field("Color", "أسود", "اللون");
    expect(withoutRepeatedOptions([answer], { color: "اسود" }, arabicAxes, "ar")).toEqual([]);
  });
});

/** The line from the report, as the database holds it. */
const reported = {
  description: "Inner Dress | Tayf",
  quantity: 1,
  unit_price: 8,
  line_total: 8,
  location: "custom",
  selected_variant: { color: "اسود", made_to_measure: true },
  custom_field_values: [
    { key: "f1-length", label_en: "Length - Size", label_ar: "الطول - القياس", value: "54" },
    { key: "f2", label_en: "Color", label_ar: "اللون", value: "أسود" },
    { key: "made_to_measure", label_en: "Made to measure", label_ar: "حسب المقاس", value: "true" },
  ],
};

describe("the reported line", () => {
  const invoice = (lang: "ar" | "en") =>
    render(
      <InvoiceLineItems
        items={[reported]}
        lang={lang}
        addonDefaults={undefined as never}
        money={(n) => String(n)}
        labels={{ desc: "Desc", qty: "Qty", unit: "Unit", total: "Total" }}
        textColor="#fff"
        dividerColor="#333"
        headerBg="#000"
        headerFg="#fff"
      />,
    );

  it("names its colour once on the invoice, and in the invoice's language", () => {
    const { container } = invoice("en");
    const table = container.querySelector("table") as HTMLElement;
    expect(table.textContent?.match(/Color:/g)).toHaveLength(1);
    expect(table.textContent).toContain("Black");
    expect(table.textContent).not.toContain("أسود");
    expect(table.textContent).toContain("Length - Size: 54");
    expect(table.textContent).toContain("Made to measure");
  });

  it("reads the same on an Arabic invoice", () => {
    const { container } = invoice("ar");
    const table = container.querySelector("table") as HTMLElement;
    expect(table.textContent?.match(/اللون:/g)).toHaveLength(1);
  });

  it("names its colour once on the store's own preview", () => {
    render(
      <InvoicePreviewLineDetails it={reported} lang="en" addonDefaults={undefined as never} />,
    );
    expect(screen.getByText(/Color: Black/)).toBeInTheDocument();
    expect(screen.queryByText(/أسود/)).toBeNull();
    expect(screen.getByText(/Length - Size/)).toBeInTheDocument();
  });

  it("names its colour once on the workshop's sheet, but keeps an answer a revision changed", () => {
    const [piece] = jobSheetPieces([reported as never], [], { lang: "en" });
    expect(piece.details.map((row) => row.label)).toEqual(["Length - Size"]);

    const [revised] = jobSheetPieces([{ ...reported, id: "line", revision: 2 } as never], [], {
      lang: "en",
      revisions: [
        {
          order_item_id: "line",
          revision: 2,
          changes: [{ key: "f2", from: "Navy" }],
        } as never,
      ],
    });
    expect(revised.details.map((row) => row.label)).toEqual(["Length - Size", "Color"]);
  });
});

describe("the invoice on paper", () => {
  it("runs to the edge of the sheet and carries its margin as padding, on every page", () => {
    const css = invoicePrintCss("#3a0a1a");
    expect(css).toContain("@page{size:A4;margin:0}");
    expect(css).toContain("background:#3a0a1a!important");
    expect(css).toContain("padding:12mm");
    expect(css).toContain("box-decoration-break:clone");
  });

  it("never cuts a line, the totals or the terms across two pages", () => {
    const css = invoicePrintCss("#fff");
    expect(css).toMatch(
      /\.pdf-keep[^{]*\.pdf-totals-row[^{]*\.pdf-line-items tr\{break-inside:avoid/,
    );
  });

  it("takes the store's colour however it is written", () => {
    for (const color of ["#fff", "#3A0A1A", "white", "rgb(58, 10, 26)", "hsl(340 70% 13%)"]) {
      expect(invoicePrintCss(color)).toContain(`background:${color}!important`);
    }
  });

  it("writes nothing from a setting that is not a colour, or is empty", () => {
    for (const value of ["red}body{display:none", "url(https://x.example/a.png)", "", null]) {
      const css = invoicePrintCss(value);
      expect(css).not.toContain("background:");
      expect(css).toContain("@page{size:A4;margin:0}");
    }
  });
});
