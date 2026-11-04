import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// A piece made to the customer's measurements names no size (the owner's report of 2026-11-04:
// a tailored order read "Size 56" on the order, the job sheet and the invoice), its notes for the
// workshop are kept as written, and the admin adds a made-to-order piece as made to order.

const brand = vi.hoisted(() => ({
  useBrand: () => ({ id: "b1", slug: "pura" }),
  useBrandOptional: () => null,
}));
vi.mock("../src/lib/brand-context", () => brand);
vi.mock("@/lib/brand-context", () => brand);
const storeProfile = vi.hoisted(() => ({
  useAdminStoreProfile: () => ({ profile: { fitProfiles: undefined } }),
}));
vi.mock("../src/hooks/use-store-profile", () => storeProfile);
vi.mock("@/hooks/use-store-profile", () => storeProfile);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  isHiddenField,
  lineFields,
  lineSize,
  madeToMeasure,
  withoutSizeLine,
} from "../src/lib/made-to-measure";
import { lineSupplyFor } from "../src/features/orders/lib/line-supply";
import { jobSheetPieces } from "../src/features/orders/lib/job-sheet";
import { courierDelivery } from "../src/features/courier-delivery/lib/courier-delivery";
import { LineSpecsSummary } from "../src/features/orders/components/LineSpecsSummary";
import { LineSupplyChoice } from "../src/features/orders/components/LineSupplyChoice";
import { InvoiceLineItems } from "../src/components/orders/InvoiceLineItems";
import { ItemTailoringCustomizer } from "../src/addons/made-to-order/components/admin/ItemTailoringCustomizer";
import type { OrderItem } from "../src/features/orders/types";
import { workshopNotesShown } from "../src/features/product-page/lib/variant-options";
import { TailoringNotesField } from "../src/features/product-page/components/TailoringNotesField";

const PASSPORT = [
  {
    key: "fit_passport_profile",
    label_ar: "ملف المقاس المستخدم",
    label_en: "Fit profile",
    value: "عباية / Abaya",
  },
  { key: "fit_passport_unit", label_ar: "وحدة القياس", label_en: "Length unit", value: "in" },
  { key: "fit_passport_abaya_length", label_ar: "الطول", label_en: "Length", value: "56 in" },
  { key: "fit_passport_version", label_ar: "إصدار", label_en: "Version", value: "3" },
  {
    key: "tailoring_notes",
    label_ar: "ملاحظات للورشة",
    label_en: "Notes for the workshop",
    value: "Full lining\nSleeves 2 cm longer",
  },
];
const tailored = {
  location: "custom",
  selected_variant: { size: "56", color: "Black", fabric: null },
  custom_field_values: PASSPORT,
};

describe("the rule", () => {
  it("a piece made to measure names no size, a piece made in a size keeps it", () => {
    expect(madeToMeasure(tailored)).toBe(true);
    expect(lineSize(tailored, "56")).toBeNull();
    expect(lineSize({ selected_variant: { made_to_measure: true } }, "56")).toBeNull();
    expect(lineSize({ location: "custom", selected_variant: { size: "56" } })).toBe("56");
    expect(lineSize({ location: "main", selected_variant: null }, "54")).toBe("54");
    expect(lineSize({ selected_variant: { size: "قياسي" } })).toBeNull();
  });

  it("drops the editor's size line from a piece's text, and nothing else", () => {
    expect(withoutSizeLine("Black abaya\nSize: 56\nColour: Black", "56")).toBe(
      "Black abaya\nColour: Black",
    );
    expect(withoutSizeLine("Abaya 56", "56")).toBe("Abaya 56");
    expect(withoutSizeLine("Black abaya", null)).toBe("Black abaya");
  });

  it("reads the answers as rows and the notes as written, with no bookkeeping", () => {
    const { rows, notes } = lineFields(PASSPORT);
    expect(rows.map((r) => r.key)).toEqual(["fit_passport_profile", "fit_passport_abaya_length"]);
    expect(notes).toEqual(["Full lining\nSleeves 2 cm longer"]);
    expect(isHiddenField("made_to_measure")).toBe(true);
    expect(isHiddenField("fit_passport_profile")).toBe(false);
  });
});

describe("where a piece added to an order comes from", () => {
  it("the store's stock, else a partner's, else made to order for a made-to-order piece", () => {
    expect(lineSupplyFor({ mainStock: 2, partnerStock: 5, madeToOrder: true })).toBe("main");
    expect(lineSupplyFor({ mainStock: 0, partnerStock: 1, madeToOrder: false })).toBe("incubator");
    expect(lineSupplyFor({ mainStock: 0, partnerStock: 0, madeToOrder: true })).toBe("custom");
    // A regular piece the store has none of is not sent to a partner that has none either.
    expect(lineSupplyFor({ mainStock: 0, partnerStock: 0, madeToOrder: false })).toBe("main");
  });
});

describe("on the order page", () => {
  it("says made to measure, the measurements and the notes as written, and no size", () => {
    render(
      <LineSpecsSummary
        it={{ ...tailored, description: "Black abaya" } as unknown as OrderItem}
        product={null}
        addonDefaults={{}}
        length={null}
        appointment={false}
        madeToOrderModule
        lang="en"
        vocabulary={{} as never}
      />,
    );
    expect(screen.getByText("Made to measure")).toBeInTheDocument();
    expect(screen.queryByText("56")).toBeNull();
    expect(screen.getByText("56 in")).toBeInTheDocument();
    expect(screen.queryByText(/Length unit|Version/)).toBeNull();
    const note = screen.getByText(/Full lining/);
    expect(note.textContent).toBe("Full lining\nSleeves 2 cm longer");
    expect(note.className).toContain("whitespace-pre-line");
  });

  it("offers the piece from stock, a partner, or made to order, and opens its editor", () => {
    const onChoose = vi.fn();
    const onOpenEditor = vi.fn();
    const { rerender } = render(
      <LineSupplyChoice
        it={{ location: "main" }}
        mainStock={0}
        partnerStock={0}
        madeToOrderModule
        isReadOnly={false}
        lang="en"
        vocabulary={{} as never}
        onChoose={onChoose}
        onOpenEditor={onOpenEditor}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Made to order" }));
    expect(onChoose).toHaveBeenCalledWith("custom");
    rerender(
      <LineSupplyChoice
        it={{ location: "custom" }}
        mainStock={0}
        partnerStock={0}
        madeToOrderModule
        isReadOnly={false}
        lang="en"
        vocabulary={{} as never}
        onChoose={onChoose}
        onOpenEditor={onOpenEditor}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Measurements & notes/ }));
    expect(onOpenEditor).toHaveBeenCalled();
  });
});

describe("on the invoice, the job sheet and the courier's page", () => {
  it("the invoice names no size, not even the catalogue variant's, and keeps the notes' lines", () => {
    render(
      <InvoiceLineItems
        items={[
          {
            ...tailored,
            description: "Black abaya\nSize: 56",
            quantity: 1,
            unit_price: 30,
            line_total: 30,
            product_variants: { size: "56" },
          },
        ]}
        lang="en"
        addonDefaults={{}}
        money={(n) => `BHD ${n}`}
        labels={{ desc: "Item", qty: "Qty", unit: "Unit", total: "Total" }}
        textColor="inherit"
        dividerColor="inherit"
        headerBg="inherit"
        headerFg="inherit"
      />,
    );
    expect(screen.queryAllByText(/56$/).filter((n) => !/in$/.test(n.textContent ?? ""))).toEqual(
      [],
    );
    expect(screen.getAllByText("Made to measure").length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Length unit/)).toEqual([]);
    expect(screen.getAllByText(/Full lining/)[0].textContent).toBe(
      "Full lining\nSleeves 2 cm longer",
    );
  });

  it("the job sheet says made to measure, and keeps the bookkeeping off it", () => {
    const [piece] = jobSheetPieces(
      [{ id: "l1", description: "Black abaya", quantity: 1, ...tailored }],
      [],
      { lang: "en" },
    );
    expect(piece.options).toContainEqual({ label: "Size / Option", value: "Made to measure" });
    expect(piece.options.some((o) => o.value === "56")).toBe(false);
    expect(piece.details.map((d) => d.label)).toEqual(["Fit profile", "Length"]);
    expect(piece.notes).toEqual(["Full lining\nSleeves 2 cm longer"]);
  });

  it("the courier reads no size for it", () => {
    const view = courierDelivery(
      {
        id: "o1",
        status: "confirmed",
        fulfillment_status: "READY",
        order_items: [{ id: "l1", description: "Black abaya", quantity: 1, ...tailored }],
      } as never,
      "en",
    );
    expect(view.items[0].detail).toBe("Black");
  });
});

describe("the admin's tailoring panel", () => {
  function Panel({ onPatch }: { onPatch: (patch: Record<string, unknown>) => void }) {
    const [item, setItem] = useState<Record<string, unknown>>({
      description: "Black abaya\nSize: 56",
      location: "main",
      selected_variant: { size: "56", color: "Black" },
      custom_field_values: [],
    });
    return (
      <ItemTailoringCustomizer
        item={item}
        isAr={false}
        onChange={(patch) => {
          onPatch(patch as Record<string, unknown>);
          setItem((prev) => ({ ...prev, ...patch }));
        }}
      />
    );
  }

  it("keeps the notes as typed, spaces and all", () => {
    const onPatch = vi.fn();
    render(<Panel onPatch={onPatch} />);
    const notes = screen.getByRole("textbox");
    fireEvent.change(notes, { target: { value: "Full " } });
    fireEvent.change(notes, { target: { value: "Full lining" } });
    expect((notes as HTMLTextAreaElement).value).toBe("Full lining");
    const last = onPatch.mock.calls.at(-1)?.[0] as {
      custom_field_values: Array<{ value: string }>;
    };
    expect(last.custom_field_values[0].value).toBe("Full lining");
    expect(onPatch.mock.calls[0][0]).toMatchObject({
      custom_field_values: [expect.objectContaining({ value: "Full " })],
    });
  });

  it("a measurement makes the piece made to measure, with no size left in its text", () => {
    const onPatch = vi.fn();
    render(<Panel onPatch={onPatch} />);
    const [length] = screen.getAllByRole("spinbutton");
    fireEvent.change(length, { target: { value: "56" } });
    expect(onPatch.mock.calls.at(-1)?.[0]).toMatchObject({
      location: "custom",
      selected_variant: { size: null, color: "Black" },
      description: "Black abaya",
    });
  });
});

describe("on the product page", () => {
  it("offers the notes for the workshop with every piece being made, whatever fields it asks", () => {
    expect(
      workshopNotesShown({ isService: false, isTailoringActive: true, madeToOrderModule: true }),
    ).toBe(true);
    expect(
      workshopNotesShown({ isService: false, isTailoringActive: false, madeToOrderModule: true }),
    ).toBe(false);
    expect(
      workshopNotesShown({ isService: true, isTailoringActive: true, madeToOrderModule: true }),
    ).toBe(false);
  });

  it("keeps what the shopper types, spaces and new lines", () => {
    function Field() {
      const [value, setValue] = useState("");
      return (
        <TailoringNotesField
          value={value}
          onChange={setValue}
          lang="en"
          t={(_ar: string, en: string) => en}
          vocabulary={{} as never}
        />
      );
    }
    render(<Field />);
    const box = screen.getByLabelText("Notes for the workshop (optional)");
    fireEvent.change(box, { target: { value: "Full lining \nlonger " } });
    expect((box as HTMLTextAreaElement).value).toBe("Full lining \nlonger ");
  });
});
