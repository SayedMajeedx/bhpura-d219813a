import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The merchant's advance-payment card in Orders → Payments.

const state = vi.hoisted(() => ({
  bs: {} as Record<string, unknown>,
  setBs: vi.fn(),
  lang: "en" as "en" | "ar",
}));
vi.mock("../src/lib/i18n", () => ({ useI18n: () => ({ lang: state.lang }) }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ lang: state.lang }) }));
vi.mock("../src/features/settings/use-brand-settings-form", () => ({
  useBrandSettingsFormContext: () => ({ form: { bs: state.bs }, setBs: state.setBs }),
}));
vi.mock("@/features/settings/use-brand-settings-form", () => ({
  useBrandSettingsFormContext: () => ({ form: { bs: state.bs }, setBs: state.setBs }),
}));

const rules = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));
vi.mock("../src/lib/data/advance-rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/data/advance-rules")>();
  return {
    ...actual,
    advanceRulesQueries: {
      ...actual.advanceRulesQueries,
      list: () => ({ queryKey: ["advance-rules-test"], queryFn: async () => rules.rows }),
    },
  };
});
vi.mock("@/lib/data/advance-rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/data/advance-rules")>();
  return {
    ...actual,
    advanceRulesQueries: {
      ...actual.advanceRulesQueries,
      list: () => ({ queryKey: ["advance-rules-test"], queryFn: async () => rules.rows }),
    },
  };
});

const { AdvancePaymentCard } =
  await import("../src/features/settings/tabs/orders/AdvancePaymentCard");

const renderCard = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AdvancePaymentCard />
    </QueryClientProvider>,
  );

beforeEach(() => {
  rules.rows = [];
  state.bs = {
    advance_payment_enabled: false,
    advance_payment_percent: 30,
    advance_payment_scope: "all",
    card_enabled: true,
    benefit_enabled: false,
    currency: "BHD",
  };
  state.lang = "en";
  state.setBs.mockClear();
});

describe("the advance payment card", () => {
  it("turns the rule on and off", () => {
    renderCard();
    expect(screen.queryByLabelText(/Advance share/)).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Require an advance payment" }));
    expect(state.setBs).toHaveBeenCalledWith({ advance_payment_enabled: true });
  });

  it("chooses which orders it applies to", () => {
    state.bs.advance_payment_enabled = true;
    renderCard();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByRole("radio", { name: /Every order/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("radio", { name: /Delivered orders only/ }));
    expect(state.setBs).toHaveBeenCalledWith({ advance_payment_scope: "delivery" });
    fireEvent.click(screen.getByRole("radio", { name: /Made-to-order items and services only/ }));
    expect(state.setBs).toHaveBeenLastCalledWith({ advance_payment_scope: "made_to_order" });
  });

  it("previews the scope on a delivered order and on a pickup", () => {
    state.bs.advance_payment_enabled = true;
    state.bs.advance_payment_scope = "delivery";
    renderCard();
    // Delivered: the whole order with the fee (105 at 30%); pickup: nothing asked.
    expect(screen.getByText(/Advance payment \(30%\) due now: .*31\.5/)).toBeInTheDocument();
    expect(screen.getByText(/No advance; payment as usual/)).toBeInTheDocument();
  });

  it("previews a made-to-order scope on the made-to-order item only", () => {
    state.bs.advance_payment_enabled = true;
    state.bs.advance_payment_scope = "made_to_order";
    state.bs.advance_payment_percent = 50;
    renderCard();
    expect(screen.getAllByText(/50% of the made-to-order items\) due now: .*30/)).toHaveLength(2);
  });

  it("saves only a valid percentage", () => {
    state.bs.advance_payment_enabled = true;
    renderCard();
    const input = screen.getByLabelText(/Advance share/);
    fireEvent.change(input, { target: { value: "40" } });
    expect(state.setBs).toHaveBeenLastCalledWith({ advance_payment_percent: 40 });
    state.setBs.mockClear();
    fireEvent.change(input, { target: { value: "150" } });
    expect(state.setBs).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/1% to 100%/);
  });

  it("warns when no online payment method is on, and not when one is", () => {
    state.bs.advance_payment_enabled = true;
    state.bs.card_enabled = false;
    const { unmount } = renderCard();
    expect(screen.getByRole("alert")).toHaveTextContent(/Turn on card or BenefitPay/);
    unmount();
    state.bs.benefit_enabled = true;
    renderCard();
    expect(screen.queryByText(/Turn on card or BenefitPay/)).toBeNull();
  });

  it("reads in Arabic", () => {
    state.lang = "ar";
    state.bs.advance_payment_enabled = true;
    renderCard();
    expect(screen.getByText("الدفعة المقدمة")).toBeInTheDocument();
    expect(screen.getByText("طلبات التوصيل فقط")).toBeInTheDocument();
    expect(screen.getAllByText(/تُدفع الآن/).length).toBeGreaterThan(0);
  });
});

describe("only my own rules", () => {
  const fixedTen = {
    id: "r1",
    name_en: "Fixed advance",
    name_ar: "دفعة ثابتة",
    is_active: true,
    sort_order: 0,
    fulfillment: [],
    made_to_order: null,
    product_ids: [],
    category_slugs: [],
    amount_kind: "fixed",
    amount_value: "10",
    min_amount: null,
    max_amount: null,
    include_delivery_fee: false,
    min_order_total: null,
    max_order_total: null,
    customer_kind: "any",
    destination_kind: "any",
    destination_countries: [],
  };

  it("offers it as a choice that needs no percentage", () => {
    state.bs.advance_payment_enabled = true;
    renderCard();
    fireEvent.click(screen.getByRole("radio", { name: /Only my own rules/ }));
    expect(state.setBs).toHaveBeenCalledWith({ advance_payment_scope: "rules_only" });
  });

  it("hides the general percentage and its error", () => {
    state.bs.advance_payment_enabled = true;
    state.bs.advance_payment_scope = "rules_only";
    state.bs.advance_payment_percent = 0;
    renderCard();
    expect(screen.queryByLabelText(/Advance share/)).toBeNull();
    expect(screen.queryByText(/must be from 1% to 100%/)).toBeNull();
    expect(screen.getByText(/no advance is asked until you add one/)).toBeInTheDocument();
  });

  it("previews what the store's own rule asks of a delivery and a pickup", async () => {
    rules.rows = [fixedTen];
    state.bs.advance_payment_enabled = true;
    state.bs.advance_payment_scope = "rules_only";
    renderCard();
    expect(await screen.findByText(/only from your own rules below/)).toBeInTheDocument();
    expect(screen.getAllByText(/10/).length).toBeGreaterThan(1);
  });
});

describe("letting customers pay the full amount", () => {
  it("is on unless the store turned it off, and the switch changes it", () => {
    state.bs.advance_payment_enabled = true;
    renderCard();
    const toggle = screen.getByRole("switch", { name: /Let customers pay the full amount now/ });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(state.setBs).toHaveBeenCalledWith({ advance_allow_full_payment: false });
  });

  it("shows as off when the store turned it off", () => {
    state.bs.advance_payment_enabled = true;
    state.bs.advance_allow_full_payment = false;
    renderCard();
    expect(
      screen.getByRole("switch", { name: /Let customers pay the full amount now/ }),
    ).toHaveAttribute("aria-checked", "false");
  });
});
