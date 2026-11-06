import React, { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StorefrontVariant } from "../src/lib/data/storefront";

// The review of Pura's ordering journey, 2026-11-06: what a shopper is stopped by, told and asked
// on the way to a ready piece or a tailored one.

const storefront = {
  brand: { id: "b1", slug: "pura", name_ar: "بيورا", name_en: "Pura" },
  lang: "en",
  t: (_ar: string, en: string) => en,
  session: null,
  settings: {},
};
const storefrontModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => storefront,
});
vi.mock("../src/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("@/lib/storefront-context", (io) => storefrontModule(io));
const client = { supabase: { from: vi.fn(), rpc: vi.fn() } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQuery: () => ({ data: null, refetch: vi.fn() }),
}));

const { choiceUnavailable, readyChoiceGone, unchosenOptions } =
  await import("../src/features/product-page/lib/variant-options");
const { companionVariant } = await import("../src/lib/cart/bundle-offer");
const { placeOrderHint } = await import("../src/features/checkout/lib/checkout-validation");
const { returnsSentence } = await import("../src/lib/delivery-info");
const { estimateDays, expectedDay, withoutEstimateLabel } =
  await import("../src/lib/delivery-estimate");
const {
  TAILORED_ORDER_STEPS,
  activeTrackStep,
  measurementsStillOpen,
  orderHandedOver,
  storeChatLink,
} = await import("../src/features/order-receipt/lib/order-track");
const { ProductFitPassportSection } =
  await import("../src/addons/fit-passport/components/storefront/ProductFitPassportSection");

const variant = (over: Partial<StorefrontVariant>) =>
  ({
    id: "v",
    size: null,
    color: null,
    stock_main: 0,
    stock_incubator: 0,
    ...over,
  }) as StorefrontVariant;
const nothing = { size: null, color: null, fabric: null, four: null, five: null };
const offered = (size: string[], color: string[]) => ({
  size,
  color,
  fabric: [],
  four: [],
  five: [],
});

describe("what must be chosen", () => {
  it("asks a piece being tailored for its colour, never its size", () => {
    expect(unchosenOptions(nothing, offered(["54", "56"], ["Purple", "Black"]), true)).toEqual([
      "color",
    ]);
    expect(
      unchosenOptions({ ...nothing, color: "Black" }, offered(["54"], ["Purple", "Black"]), true),
    ).toEqual([]);
  });

  it("asks a ready piece for each open option, and nothing of an option with one value", () => {
    expect(unchosenOptions(nothing, offered(["54", "56"], ["Purple", "Black"]), false)).toEqual([
      "size",
      "color",
    ]);
    expect(
      unchosenOptions({ ...nothing, size: "54" }, offered(["54", "56"], ["Black"]), false),
    ).toEqual([]);
  });
});

describe("a choice with no ready piece", () => {
  const variants = [
    variant({ id: "a", size: "54", color: "Purple", stock_main: 1 }),
    variant({ id: "b", size: "57", color: "Black", stock_main: 0 }),
  ];

  it("is a colour and size no variant has, or one that holds no piece", () => {
    expect(readyChoiceGone(variants, nothing)).toBe(false);
    expect(readyChoiceGone(variants, { ...nothing, size: "54" })).toBe(false);
    expect(readyChoiceGone(variants, { ...nothing, size: "57" })).toBe(true);
    expect(readyChoiceGone(variants, { ...nothing, size: "57", color: "Purple" })).toBe(true);
  });

  it("cannot be added, though the product can", () => {
    const base = { variant: null, variants, product: {}, isTailoringActive: false };
    expect(choiceUnavailable({ ...base, selection: { ...nothing, size: "57" } })).toBe(true);
    expect(
      choiceUnavailable({
        ...base,
        isTailoringActive: true,
        selection: { ...nothing, size: "57" },
      }),
    ).toBe(false);
  });
});

describe("the bundle's second piece", () => {
  const made = {
    is_made_to_order: true,
    custom_fields: [{ key: "passport_abaya_length" }],
    product_variants: [
      { id: "a", size: "54", stock_main: 2 },
      { id: "b", size: "56", stock_main: 0 },
    ],
  };

  it("is a made-to-order piece's ready size, in the shopper's size", () => {
    expect(companionVariant(made, { id: "m", size: "54" })).toBeNull();
    expect(companionVariant(made, { id: "m", size: "54" }, { readyOnly: true })?.id).toBe("a");
    expect(companionVariant(made, { id: "m", size: "56" }, { readyOnly: true })).toBeNull();
  });
});

describe("checkout", () => {
  const t = (_ar: string, en: string) => en;
  const base = {
    acceptedTerms: true,
    method: "cod",
    benefitReceipt: null,
    receiptRequired: true,
    t,
  };

  it("says why the button waits", () => {
    expect(placeOrderHint(base)).toBeNull();
    expect(placeOrderHint({ ...base, acceptedTerms: false })).toMatch(/terms/);
    expect(placeOrderHint({ ...base, method: "benefit" })).toMatch(/receipt/);
    expect(placeOrderHint({ ...base, method: "benefit", receiptRequired: false })).toBeNull();
  });

  it("does not repeat the store's own opening words under a label", () => {
    expect(withoutEstimateLabel("التوصيل المتوقع خلال 7 ايام")).toBe("خلال 7 ايام");
    expect(withoutEstimateLabel("Estimated delivery: 3 days")).toBe("3 days");
    expect(withoutEstimateLabel("خلال 24 ساعة")).toBe("خلال 24 ساعة");
  });
});

describe("the store's return terms", () => {
  it("are one sentence, without the list mark they were typed with", () => {
    expect(
      returnsSentence({ returnTerms: null, note: "- لا يوجد استرجاع، ويمكن طلب التعديل" }),
    ).toBe("لا يوجد استرجاع، ويمكن طلب التعديل");
    expect(returnsSentence({ returnTerms: "Own terms", note: "- other" })).toBe("Own terms");
    expect(returnsSentence({ returnTerms: null, note: null })).toBeNull();
  });
});

describe("an order's expected day", () => {
  it("is worked out only from days the store wrote", () => {
    expect(estimateDays("التوصيل المتوقع خلال 7 ايام")).toBe(7);
    expect(estimateDays("٣ - ٥ أيام")).toBe(5);
    expect(estimateDays("3-5 business days")).toBe(5);
    expect(estimateDays("خلال 24 ساعة")).toBeNull();
    expect(estimateDays("within two weeks")).toBeNull();
    expect(estimateDays(null)).toBeNull();
  });

  it("is written in the reader's language, in Western digits", () => {
    expect(expectedDay("2026-11-06T10:00:00Z", 7, "en")).toBe("13 November");
    expect(expectedDay("2026-11-06T10:00:00Z", 7, "ar")).toMatch(/^13 /);
    expect(expectedDay("", 7, "en")).toBeNull();
  });
});

describe("an order's journey", () => {
  const step = (fulfillmentStatus: string | null, tailored = true, status = "pending") =>
    activeTrackStep({ status, paymentStatus: "unpaid", fulfillmentStatus, tailored });

  it("has the workshop as a step of its own for a tailored piece", () => {
    expect(step("ON_HOLD")).toBe(0);
    // Paid and waiting to go to the workshop: nothing has been made yet.
    expect(step("NEEDS_PACKING")).toBe(0);
    expect(step("SENT_TO_TAILOR")).toBe(1);
    expect(TAILORED_ORDER_STEPS[1].labelAr).toBe("قيد التجهيز");
    expect(step("RECEIVED_FROM_TAILOR")).toBe(2);
    expect(step("OUT_FOR_DELIVERY")).toBe(3);
    expect(step("COMPLETED", true, "completed")).toBe(4);
    expect(step("ON_HOLD", true, "cancelled")).toBe(-1);
  });

  it("stays as it was for a ready piece", () => {
    expect(step("ON_HOLD", false)).toBe(0);
    expect(step("NEEDS_PACKING", false)).toBe(1);
    expect(step("SHIPPED", false)).toBe(2);
    expect(step("DELIVERED", false)).toBe(3);
  });

  it("lets a measurement be put right until the piece goes to the workshop", () => {
    expect(measurementsStillOpen("pending", "ON_HOLD")).toBe(true);
    expect(measurementsStillOpen("pending", null)).toBe(true);
    expect(measurementsStillOpen("sent_to_tailor", "SENT_TO_TAILOR")).toBe(false);
    expect(measurementsStillOpen("cancelled", "ON_HOLD")).toBe(false);
  });

  it("offers an alteration once the order is handed over", () => {
    expect(orderHandedOver("completed", "COMPLETED")).toBe(true);
    expect(orderHandedOver("pending", "ON_HOLD")).toBe(false);
  });

  it("writes the message into the store's chat, and offers none without a chat", () => {
    expect(storeChatLink("https://wa.me/973", "order 1")).toBe("https://wa.me/973?text=order%201");
    expect(storeChatLink(null, "order 1")).toBeNull();
  });
});

describe("measurements on a piece being made", () => {
  function Form({ onApplied }: { onApplied: (applied: boolean, problem: string | null) => void }) {
    const [values, setValues] = useState<Record<string, string>>({});
    return (
      <>
        <ProductFitPassportSection
          product={{ category: "abaya", name: "Yaqoot" }}
          customFields={[{ key: "passport_abaya_length" }]}
          sizeMode="custom"
          setCfValues={setValues}
          onApplied={onApplied}
        />
        <output data-testid="values">{JSON.stringify(values)}</output>
      </>
    );
  }
  const type = (name: string, value: string) =>
    fireEvent.change(screen.getByLabelText(new RegExp(name)), { target: { value } });

  it("go on the order as they are typed, with no button to press", () => {
    const onApplied = vi.fn();
    render(<Form onApplied={onApplied} />);
    expect(screen.queryByRole("button", { name: /apply/i })).toBeNull();
    expect(onApplied).toHaveBeenLastCalledWith(false, expect.stringContaining("Chest width"));

    act(() => {
      type("Full length", "54");
      type("Chest width", "22");
      type("Sleeve length", "27");
      type("Armpit height", "10");
    });
    expect(onApplied).toHaveBeenLastCalledWith(true, null);
    const values = JSON.parse(screen.getByTestId("values").textContent ?? "{}");
    expect(values.fit_passport_abaya_chest_width).toBe("22 in");
    expect(values.fit_passport_unit).toBe("in");
  });

  it("names a value that cannot be right, and takes it off the order", () => {
    const onApplied = vi.fn();
    render(<Form onApplied={onApplied} />);
    act(() => {
      type("Full length", "54");
      type("Chest width", "60");
      type("Sleeve length", "27");
      type("Armpit height", "10");
    });
    expect(screen.getByRole("alert").textContent).toContain("Chest width");
    expect(onApplied).toHaveBeenLastCalledWith(false, expect.stringContaining("Chest width"));
    expect(screen.getByTestId("values").textContent).toBe("{}");
  });
});
