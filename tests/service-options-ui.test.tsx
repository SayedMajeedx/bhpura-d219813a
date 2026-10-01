import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  EMPTY_OPTION_FORM,
  chosenOptions,
  defaultSelection,
  describeOption,
  isChangeable,
  optionColumns,
  optionFormError,
  optionFormFrom,
  optionPrice,
  optionsPayload,
  optionsTotal,
  tiersText,
  validQuantity,
  type OptionForm,
  type ServiceOption,
} from "../src/lib/bookings/service-options";
import {
  extraFor,
  offeredDurations,
  priceFor,
  toBookingRequest,
  variantFor,
  EMPTY_FLOW,
  type BookableService,
} from "../src/features/storefront-booking/lib/booking-flow";
import { ServiceOptionsFields } from "../src/features/inventory/components/ServiceOptionsFields";
import { productColumnsFrom, productFormFrom } from "../src/features/inventory/lib/product-form";
import type { Product } from "../src/features/inventory/types";
import { createEngineDb, type EngineDb } from "./helpers/booking-engine-db";

// A service's add-ons and its extra hours: the same price in TypeScript and in the
// database, the customer's choice, the merchant's form.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const option = (over: Partial<ServiceOption>): ServiceOption => ({
  id: "o",
  product_id: "p",
  name_en: "Option",
  name_ar: null,
  description_en: null,
  description_ar: null,
  mode: "optional",
  price: 10,
  tiers: null,
  max_quantity: null,
  sort_order: 0,
  is_active: true,
  ...over,
});
const tiers = { step: 50, prices: [15, 12.5, 10] };

describe("an add-on's price", () => {
  let db: EngineDb;
  beforeAll(async () => {
    db = await createEngineDb();
  });

  it("is the same here as in the database, for every mode and quantity", async () => {
    const cases: Array<[ServiceOption["mode"], number, ServiceOption["tiers"], number]> = [];
    for (const mode of ["included", "required", "default_on", "optional"] as const) {
      cases.push([mode, 25, null, 1]);
      for (const quantity of [0, 50, 100, 150, 200, 250, 300]) {
        cases.push([mode, 15, tiers, quantity]);
      }
      cases.push([mode, 7, { step: 1, prices: [3] }, 4]);
    }
    for (const [mode, price, tier, quantity] of cases) {
      const row = await db.one<{ p: string }>(
        "select service_option_price($1, $2, $3::jsonb, $4) as p",
        [mode, price, tier ? JSON.stringify(tier) : null, quantity],
      );
      expect(
        optionPrice(option({ mode, price, tiers: tier }), quantity),
        `${mode} ${quantity}`,
      ).toBe(Number(row.p));
    }
  });
});

describe("what the customer chooses", () => {
  const options = [
    option({ id: "staff", mode: "required", price: 15 }),
    option({ id: "prints", mode: "default_on", price: 30 }),
    option({ id: "magnets", mode: "optional", price: 25 }),
    option({ id: "envelopes", mode: "optional", price: 15, tiers, max_quantity: 150 }),
    option({ id: "note", mode: "included", price: 99 }),
    option({ id: "off", mode: "optional", price: 5, is_active: false }),
  ];

  it("starts with what comes with the service and what is on by default", () => {
    expect(defaultSelection(options)).toEqual({ staff: 1, prints: 1, note: 1 });
    expect(optionsTotal(options, defaultSelection(options))).toBe(45);
  });

  it("adds what is chosen, in blocks for the envelopes, and never a switched-off one", () => {
    const selection = { ...defaultSelection(options), magnets: 1, envelopes: 100, off: 1 };
    expect(optionsTotal(options, selection)).toBe(15 + 30 + 25 + 27.5);
    expect(chosenOptions(options, selection).map((line) => line.option.id)).toEqual([
      "staff",
      "prints",
      "magnets",
      "envelopes",
      "note",
    ]);
    // Required and included come back even if the choice leaves them out.
    expect(chosenOptions(options, {}).map((line) => line.option.id)).toEqual(["staff", "note"]);
  });

  it("is sent as a list once there are add-ons: only the ones that can change, an empty one meaning 'none'", () => {
    expect(optionsPayload([], {})).toBeUndefined();
    expect(optionsPayload(options, defaultSelection(options))).toEqual([
      { option_id: "prints", quantity: 1 },
    ]);
    expect(optionsPayload(options, { staff: 1, note: 1 })).toEqual([]);
    expect(optionsPayload(options, { magnets: 1, envelopes: 50 })).toEqual([
      { option_id: "magnets", quantity: 1 },
      { option_id: "envelopes", quantity: 50 },
    ]);
  });

  it("only takes blocks of its step, up to its most", () => {
    const envelopes = options[3];
    expect(validQuantity(envelopes, 50)).toBe(50);
    expect(validQuantity(envelopes, 150)).toBe(150);
    expect(validQuantity(envelopes, 75)).toBeNull();
    expect(validQuantity(envelopes, 200)).toBeNull();
    expect(validQuantity(envelopes, 0)).toBeNull();
    expect(isChangeable(options[0])).toBe(false);
    expect(isChangeable(options[1])).toBe(true);
  });

  it("goes into the booking request with each service", () => {
    const booth: BookableService = {
      id: "p",
      name: "Booth",
      name_ar: null,
      name_en: "Booth",
      image_url: null,
      product_variants: [{ id: "v", selling_price: 70, duration_minutes: 180 }],
    };
    const flow = {
      ...EMPTY_FLOW,
      day: "2026-10-10",
      start: "18:00",
      durationMinutes: 180,
      services: ["p"],
      name: "Sara",
      phone: "39001122",
    };
    const request = toBookingRequest("b1", flow, [booth], false, {
      p: [{ option_id: "magnets", quantity: 1 }],
    });
    expect(request.items).toEqual([
      {
        product_id: "p",
        variant_id: "v",
        quantity: 1,
        options: [{ option_id: "magnets", quantity: 1 }],
      },
    ]);
    expect(toBookingRequest("b1", flow, [booth], false).items[0]).not.toHaveProperty("options");
  });
});

describe("extra hours", () => {
  const booth = (extra: number | null): BookableService => ({
    id: "p",
    name: "Booth",
    name_ar: null,
    name_en: "Booth",
    image_url: null,
    extra_hour_price: extra,
    product_variants: [
      { id: "a", selling_price: 70, duration_minutes: 180 },
      { id: "b", selling_price: 110, duration_minutes: 300 },
    ],
  });

  it("cost the longest length's price plus each hour over it", () => {
    expect(extraFor(booth(20), 300)).toBe(0);
    expect(extraFor(booth(20), 360)).toBe(20);
    // Part of an hour counts as an hour (the database rounds up too).
    expect(extraFor(booth(20), 330)).toBe(20);
    expect(extraFor(booth(20), 390)).toBe(40);
    expect(extraFor(booth(20), 480)).toBe(60);
    expect(priceFor(booth(20), 300)).toBe(110);
    expect(priceFor(booth(20), 420)).toBe(150);
    expect(variantFor(booth(20), 420)?.id).toBe("b");
  });

  it("are not offered without an extra-hour price", () => {
    expect(priceFor(booth(null), 360)).toBeNull();
    expect(variantFor(booth(null), 360)).toBeNull();
    expect(offeredDurations([180, 240, 300, 360], [booth(null)])).toEqual([180, 300]);
    expect(offeredDurations([180, 240, 300, 360], [booth(20)])).toEqual([180, 300, 360]);
  });
});

describe("the merchant's add-on form", () => {
  const form = (over: Partial<OptionForm>): OptionForm => ({
    ...EMPTY_OPTION_FORM,
    name_en: "Magnets",
    price: "25",
    ...over,
  });

  it("needs a name and a price, block prices when it goes by blocks, and a sensible most", () => {
    expect(optionFormError(form({}), false)).toBeNull();
    expect(optionFormError(form({ name_en: "" }), false)).toMatch(/Name/);
    expect(optionFormError(form({ price: "" }), false)).toMatch(/price/);
    expect(optionFormError(form({ mode: "included", price: "" }), false)).toBeNull();
    expect(optionFormError(form({ tiered: true, prices: "" }), false)).toMatch(/block's price/);
    expect(optionFormError(form({ tiered: true, prices: "15, x" }), false)).toMatch(
      /block's price/,
    );
    expect(optionFormError(form({ tiered: true, step: "0", prices: "15" }), false)).toMatch(
      /block/,
    );
    expect(
      optionFormError(form({ tiered: true, prices: "15, 12.5", max_quantity: "2.5" }), false),
    ).toMatch(/most/);
    expect(optionFormError(form({ name_en: "", name_ar: "" }), true)).toMatch(/اسم/);
  });

  it("saves as the database's columns, and reads back", () => {
    expect(optionColumns(form({ mode: "required", price: "15" }))).toMatchObject({
      name_en: "Magnets",
      mode: "required",
      price: 15,
      tiers: null,
      max_quantity: null,
    });
    const blocks = optionColumns(
      form({ tiered: true, step: "50", prices: "15, 12.5, 10", max_quantity: "200" }),
    );
    expect(blocks).toMatchObject({
      price: 15,
      tiers: { step: 50, prices: [15, 12.5, 10] },
      max_quantity: 200,
    });
    expect(optionColumns(form({ mode: "included", price: "9" })).price).toBe(0);
    const saved = option({ id: "x", mode: "default_on", price: 30, tiers, max_quantity: 200 });
    expect(optionFormFrom(saved)).toMatchObject({
      id: "x",
      mode: "default_on",
      tiered: true,
      step: "50",
      prices: "15, 12.5, 10",
      max_quantity: "200",
    });
  });

  it("is described in a few words", () => {
    expect(describeOption(option({ mode: "required", price: 15 }), false)).toBe("Required · 15");
    expect(describeOption(option({ mode: "included" }), false)).toBe("Included (free)");
    expect(describeOption(option({ tiers }), false)).toBe(
      "Optional · first 50: 15 · next 50: 12.5 · then 10 per 50",
    );
    expect(tiersText(tiers, true)).toContain("أول 50: 15");
  });

  it("is part of the service's own form: the extra-hour price is saved with it", () => {
    const service = (fields: Partial<Product>) => ({ item_kind: "service", ...fields }) as Product;
    expect(
      productColumnsFrom(productFormFrom(service({ extra_hour_price: 20 }))).extra_hour_price,
    ).toBe(20);
    expect(productColumnsFrom(productFormFrom(service({}))).extra_hour_price).toBeNull();
    const asProduct = productFormFrom(service({ extra_hour_price: 20 }));
    expect(productColumnsFrom({ ...asProduct, item_kind: "product" }).extra_hour_price).toBeNull();
  });
});

describe("the add-ons section of the service editor", () => {
  function Harness({ initial = [] as OptionForm[] }) {
    const [options, setOptions] = useState(initial);
    const [extra, setExtra] = useState("");
    return (
      <>
        <ServiceOptionsFields
          options={options}
          onOptions={setOptions}
          extraHour={extra}
          onExtraHour={setExtra}
          isAr={false}
        />
        <output data-testid="options">{JSON.stringify(options)}</output>
        <output data-testid="extra">{extra}</output>
      </>
    );
  }
  const saved = () => JSON.parse(screen.getByTestId("options").textContent ?? "[]") as OptionForm[];

  it("adds an add-on from a starting point, then saves it", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Attendant \(required\)/ }));
    expect(screen.getByLabelText("Name (English)")).toHaveValue("Attendant");
    expect(screen.getByLabelText("Price")).toHaveValue(15);
    fireEvent.click(screen.getByRole("button", { name: "Save add-on" }));
    expect(saved()).toHaveLength(1);
    expect(saved()[0]).toMatchObject({ name_en: "Attendant", mode: "required", price: "15" });
    expect(screen.getByText("Required · 15")).toBeInTheDocument();
  });

  it("adds envelopes in blocks, with their prices", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /In blocks \(like envelopes\)/ }));
    expect(screen.getByLabelText("Block size")).toHaveValue(50);
    expect(screen.getByLabelText(/Each block's price/)).toHaveValue("15, 12.5, 10");
    fireEvent.change(screen.getByLabelText("Most units"), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "Save add-on" }));
    expect(saved()[0]).toMatchObject({ tiered: true, step: "50", max_quantity: "200" });
  });

  it("will not save an add-on with no name or price", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /An optional extra/ }));
    expect(screen.getByRole("button", { name: "Save add-on" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Name (English)"), { target: { value: "Frame" } });
    expect(screen.getByRole("button", { name: "Save add-on" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/price/);
    expect(screen.getByRole("button", { name: "Save add-on" })).toBeDisabled();
  });

  it("edits, reorders and removes the add-ons", () => {
    const first: OptionForm = { ...EMPTY_OPTION_FORM, id: "1", name_en: "One", price: "5" };
    const second: OptionForm = { ...EMPTY_OPTION_FORM, id: "2", name_en: "Two", price: "6" };
    render(<Harness initial={[first, second]} />);
    fireEvent.click(
      within(screen.getByText("Two").closest("li")!).getByRole("button", { name: "Move up" }),
    );
    expect(saved().map((o) => o.name_en)).toEqual(["Two", "One"]);
    fireEvent.click(
      within(screen.getByText("One").closest("li")!).getByRole("button", { name: "Edit" }),
    );
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Save add-on" }));
    expect(saved().find((o) => o.id === "1")?.price).toBe("9");
    fireEvent.click(
      within(screen.getByText("Two").closest("li")!).getByRole("button", {
        name: "Remove the add-on",
      }),
    );
    expect(saved().map((o) => o.id)).toEqual(["1"]);
  });

  it("sets the price of an extra hour", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Price of each extra hour"), {
      target: { value: "20" },
    });
    expect(screen.getByTestId("extra")).toHaveTextContent("20");
  });
});
