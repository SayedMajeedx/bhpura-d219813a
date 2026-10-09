import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PAY_IN_FULL_RULE,
  advanceForOrder,
  advanceRuleFrom,
  canPayInFull,
  type AdvanceOrder,
} from "../src/lib/payments/advance-payment";
import type { AdvanceRuleDef } from "../src/lib/payments/advance-rules";

const state = vi.hoisted(() => ({ lang: "en" as "ar" | "en" }));
const storefrontMock = vi.hoisted(() => () => ({
  useStorefront: () => ({
    get lang() {
      return state.lang;
    },
    t: (ar: string, en: string) => (state.lang === "ar" ? ar : en),
  }),
  formatPrice: (n: number, currency: string) => `${currency} ${n.toFixed(3)}`,
}));
vi.mock("../src/lib/storefront-context", storefrontMock);
vi.mock("@/lib/storefront-context", storefrontMock);

const { PayInFullChoice } = await import("../src/features/checkout/components/PayInFullChoice");

const fixed10: AdvanceRuleDef = {
  fulfillment: ["delivery"],
  madeToOrder: null,
  productIds: [],
  categorySlugs: [],
  kind: "fixed",
  value: 10,
  min: null,
  max: null,
  includeFee: false,
  minTotal: null,
  maxTotal: null,
  customer: "any",
  destination: "any",
  countries: [],
};
const order = (fulfillment: AdvanceOrder["fulfillment"]): AdvanceOrder => ({
  total: 31,
  shipping: 2,
  fulfillment,
  lines: [{ amount: 29, madeToOrder: true }],
});
const settings = { advance_payment_enabled: true, advance_payment_scope: "rules_only" };
const base = advanceForOrder(order("delivery"), advanceRuleFrom(settings, [fixed10]));
const full = advanceForOrder(order("delivery"), PAY_IN_FULL_RULE);

describe("paying the whole amount instead of the advance", () => {
  it("asks the whole total with nothing left to pay", () => {
    expect(base).toMatchObject({ applies: true, dueNow: 10, balance: 21 });
    expect(full).toMatchObject({ applies: true, dueNow: 31, balance: 0 });
    // Also for a pickup that the store's own rule does not reach.
    expect(advanceForOrder(order("pickup"), PAY_IN_FULL_RULE).dueNow).toBe(31);
  });

  it("is offered only when the store allows it, the advance leaves a balance, and it is no booking", () => {
    expect(canPayInFull(base, true, false)).toBe(true);
    expect(canPayInFull(base, undefined, false)).toBe(true);
    expect(canPayInFull(base, false, false)).toBe(false);
    expect(canPayInFull(base, true, true)).toBe(false);
    // No advance asked, or the advance is already everything: nothing to choose.
    expect(canPayInFull({ applies: false, balance: 0 }, true, false)).toBe(false);
    expect(canPayInFull(full, true, false)).toBe(false);
  });

  it("shows both choices with their amounts and reports the choice", () => {
    const onChange = vi.fn();
    render(
      <PayInFullChoice
        base={base}
        full={full}
        payInFull={false}
        onChange={onChange}
        currency="BHD"
      />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: /Pay the advance now/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText(/BHD 10.000 now, BHD 21.000 on delivery/)).toBeInTheDocument();
    expect(screen.getByText(/BHD 31.000 now, nothing left to pay later/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Pay the full amount now/ }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reads right in Arabic", () => {
    state.lang = "ar";
    render(<PayInFullChoice base={base} full={full} payInFull onChange={vi.fn()} currency="BHD" />);
    expect(screen.getByRole("radio", { name: /ادفع المبلغ كاملاً الآن/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    state.lang = "en";
  });
});
