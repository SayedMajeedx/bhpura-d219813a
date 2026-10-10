import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { madeToOrderMovementLine, saleModeOf } from "../src/features/inventory/lib/sale-mode";
import { productFormFrom, validateProductForm } from "../src/features/inventory/lib/product-form";
import {
  availabilityBadge,
  madeToOrderLimit,
  productAvailability,
} from "../src/lib/product-availability";
import { placeOrderFailure } from "../src/features/checkout/lib/place-order";
import { stockUnitsLabel } from "../src/lib/inventory-labels";

// "How is this piece sold?" in the product editor, and the pause: what staff see and what each
// control does (each saved on its own through the database setter), and how a paused product
// reads everywhere else.

const catalog = vi.hoisted(() => ({
  history: [] as Array<Record<string, unknown>>,
  setMadeToOrderLimit: vi.fn(async (..._args: unknown[]) => undefined),
  setMadeToOrderPaused: vi.fn(async (..._args: unknown[]) => undefined),
  invalidateCatalog: vi.fn(async () => undefined),
}));
const catalogMock = vi.hoisted(() => () => ({
  setMadeToOrderLimit: catalog.setMadeToOrderLimit,
  setMadeToOrderPaused: catalog.setMadeToOrderPaused,
  invalidateCatalog: catalog.invalidateCatalog,
  madeToOrderQueries: {
    history: () => ({
      queryKey: ["made-to-order-history-test"],
      queryFn: async () => catalog.history,
    }),
  },
}));
vi.mock("../src/lib/data/catalog", catalogMock);
vi.mock("@/lib/data/catalog", catalogMock);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const vocabularyMock = vi.hoisted(() => () => ({
  useVocabulary: () => ({
    vocabulary: { made_to_order: { ar: "تفصيل حسب الطلب", en: "Tailoring" } },
  }),
}));
vi.mock("../src/hooks/use-vocabulary", vocabularyMock);
vi.mock("@/hooks/use-vocabulary", vocabularyMock);

const { SaleModeSection } = await import("../src/features/inventory/components/SaleModeSection");
const { MadeToOrderOnlyNote, isMadeToOrderOnlyVariant } =
  await import("../src/features/inventory/components/MadeToOrderOnlyNote");

type SectionProps = Partial<React.ComponentProps<typeof SaleModeSection>>;
const onMadeToOrder = vi.fn();
const onDraftLimit = vi.fn();
const section = (props: SectionProps = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SaleModeSection
        brandId="b1"
        product={null}
        isAr={false}
        madeToOrder={false}
        onMadeToOrder={onMadeToOrder}
        draftLimit=""
        onDraftLimit={onDraftLimit}
        {...props}
      />
    </QueryClientProvider>,
  );
const saved = { id: "p1", made_to_order_available: 3, made_to_order_paused_at: null };

beforeEach(() => {
  catalog.history = [];
  for (const fn of [
    onMadeToOrder,
    onDraftLimit,
    catalog.setMadeToOrderLimit,
    catalog.setMadeToOrderPaused,
  ]) {
    fn.mockClear();
  }
});

describe("how is this piece sold?", () => {
  it("offers ready stock or made to order, in the store's own word", () => {
    section();
    expect(screen.getByRole("radio", { name: /From ready stock/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("radio", { name: /Tailoring/ }));
    expect(onMadeToOrder).toHaveBeenCalledWith(true);
    expect(saleModeOf({ is_made_to_order: true })).toBe("made_to_order");
    expect(saleModeOf({ is_made_to_order: false })).toBe("stock");
  });

  it("shows nothing about making to order for a product sold from stock", () => {
    section({ product: saved });
    expect(screen.queryByText(/How many/)).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("lets a new made-to-order product choose its first limit, saved with the product", () => {
    section({ madeToOrder: true });
    fireEvent.change(screen.getByLabelText(/How many can be made to order/), {
      target: { value: "4" },
    });
    expect(onDraftLimit).toHaveBeenCalledWith("4");
    expect(screen.queryByRole("switch")).toBeNull();
    expect(catalog.setMadeToOrderLimit).not.toHaveBeenCalled();
  });

  it("refuses to save a product whose first limit is not a number of pieces", () => {
    const form = { ...productFormFrom(null), name_en: "Abaya", is_made_to_order: true };
    expect(
      validateProductForm({ ...form, made_to_order_limit: "-2" }, false).madeToOrderLimit,
    ).toMatch(/whole number from 0 up/);
    expect(
      validateProductForm({ ...form, made_to_order_limit: "" }, false).madeToOrderLimit,
    ).toBeUndefined();
    expect(
      validateProductForm({ ...form, made_to_order_limit: "3" }, false).madeToOrderLimit,
    ).toBeUndefined();
    // A product sold from stock ignores whatever is in the field.
    expect(
      validateProductForm({ ...form, is_made_to_order: false, made_to_order_limit: "-2" }, false)
        .madeToOrderLimit,
    ).toBeUndefined();
  });
});

describe("a saved made-to-order product", () => {
  it("pauses and resumes on its own, through the setter", async () => {
    section({ madeToOrder: true, product: saved });
    const pause = screen.getByRole("switch", { name: "Pause" });
    expect(pause).toHaveAttribute("aria-checked", "false");
    fireEvent.click(pause);
    await waitFor(() => expect(catalog.setMadeToOrderPaused).toHaveBeenCalledWith("p1", true));
    await waitFor(() => expect(pause).toHaveAttribute("aria-checked", "true"));
  });

  it("shows as paused when it is", () => {
    section({
      madeToOrder: true,
      product: { ...saved, made_to_order_paused_at: "2026-10-10T10:00:00Z" },
    });
    expect(screen.getByRole("switch", { name: "Pause" })).toHaveAttribute("aria-checked", "true");
  });

  it("lists what happened to its limit", async () => {
    catalog.history = [
      {
        id: "m2",
        reason: "order_reserve",
        available_before: 3,
        available_after: 2,
        created_at: "2026-10-10T12:00:00Z",
        orders: { invoice_number: 1002 },
      },
      {
        id: "m1",
        reason: "manual_set",
        available_before: null,
        available_after: 3,
        created_at: "2026-10-10T10:00:00Z",
        orders: null,
      },
    ];
    section({ madeToOrder: true, product: saved });
    expect(
      await screen.findByText("An order took a piece (order #1002): 2 left"),
    ).toBeInTheDocument();
    expect(screen.getByText("Limit set: from no limit to 3")).toBeInTheDocument();
  });
});

describe("the record's lines", () => {
  it("say what happened in both languages", () => {
    const line = (reason: string, lang: "ar" | "en") =>
      madeToOrderMovementLine({ reason, available_before: 2, available_after: 3 }, lang);
    expect(line("order_release", "en")).toBe("A cancelled order gave a piece back: 3 left");
    expect(line("paused", "en")).toBe("Paused");
    expect(line("resumed", "ar")).toBe("استُؤنف");
    expect(line("manual_set", "ar")).toBe("حُدّد العدد: من 2 إلى 3");
  });
});

describe("a paused product everywhere else", () => {
  const tailored = { is_made_to_order: true, item_kind: "product" };
  const paused = { ...tailored, made_to_order_available: 4, made_to_order_paused_at: "2026-10-10" };
  const labels = {
    unitsLabel: (units: number, kind: "low" | "available") => stockUnitsLabel(units, kind, "en"),
  };

  it("is closed for made to order, with its limit kept", () => {
    expect(madeToOrderLimit(paused)).toEqual({ left: 4, paused: true, closed: true });
    expect(madeToOrderLimit({ ...paused, made_to_order_paused_at: null })).toEqual({
      left: 4,
      paused: false,
      closed: false,
    });
    // Pausing means nothing on a product that is not made to order.
    expect(madeToOrderLimit({ ...paused, is_made_to_order: false })).toEqual({
      left: null,
      paused: false,
      closed: false,
    });
  });

  it("cannot be bought without a ready piece, and is sold from its ready pieces with one", () => {
    expect(productAvailability(paused, 0)).toMatchObject({ status: "out", sellable: false });
    expect(productAvailability(paused, 9)).toMatchObject({ status: "available", sellable: true });
  });

  it("says it is paused, not that its limit is reached", () => {
    expect(availabilityBadge(productAvailability(paused, 0), "en", labels)).toEqual({
      tone: "out",
      label: "Made to order paused",
      details: [],
    });
    expect(availabilityBadge(productAvailability(paused, 9), "en", labels).details).toEqual([
      "Made to order paused",
    ]);
  });

  it("gives a clear message at checkout if a shopper still tries", () => {
    const t = (_ar: string, en: string) => en;
    expect(placeOrderFailure("MADE_TO_ORDER_PAUSED:p1", t).message).toMatch(
      /cannot be made to order right now/,
    );
  });
});

describe("the placeholder variant of a made-to-order-only product", () => {
  const placeholder = {
    size: "Standard",
    color: null,
    fabric: null,
    stock_main: 0,
    stock_incubator: 0,
  };

  it("shows a note instead of stock steppers, while it has no stock", () => {
    expect(isMadeToOrderOnlyVariant({ is_made_to_order: true }, placeholder)).toBe(true);
    expect(isMadeToOrderOnlyVariant({ is_made_to_order: false }, placeholder)).toBe(false);
    expect(
      isMadeToOrderOnlyVariant({ is_made_to_order: true }, { ...placeholder, size: "52" }),
    ).toBe(false);
    expect(
      isMadeToOrderOnlyVariant({ is_made_to_order: true }, { ...placeholder, stock_main: 2 }),
    ).toBe(false);
  });

  it("says so in the store's word", () => {
    render(<MadeToOrderOnlyNote isAr={false} />);
    expect(screen.getByText("Tailoring")).toBeInTheDocument();
    expect(screen.getByText(/Add a ready size to sell ready pieces/)).toBeInTheDocument();
  });
});
