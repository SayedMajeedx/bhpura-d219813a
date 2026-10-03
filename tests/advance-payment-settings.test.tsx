import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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

const { AdvancePaymentCard } =
  await import("../src/features/settings/tabs/orders/AdvancePaymentCard");

beforeEach(() => {
  state.bs = {
    advance_payment_enabled: false,
    advance_payment_percent: 30,
    card_enabled: true,
    benefit_enabled: false,
    currency: "BHD",
  };
  state.lang = "en";
  state.setBs.mockClear();
});

describe("the advance payment card", () => {
  it("turns the rule on and off", () => {
    render(<AdvancePaymentCard />);
    expect(screen.queryByLabelText(/Advance share of the order/)).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Require an advance payment" }));
    expect(state.setBs).toHaveBeenCalledWith({ advance_payment_enabled: true });
  });

  it("shows the percentage, an example, and saves only a valid percentage", () => {
    state.bs.advance_payment_enabled = true;
    render(<AdvancePaymentCard />);
    expect(screen.getByText(/Advance payment \(30%\) due now/)).toBeInTheDocument();
    const input = screen.getByLabelText(/Advance share of the order/);
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
    const { unmount } = render(<AdvancePaymentCard />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Turn on card or BenefitPay/);
    unmount();
    state.bs.benefit_enabled = true;
    render(<AdvancePaymentCard />);
    expect(screen.queryByText(/Turn on card or BenefitPay/)).toBeNull();
  });

  it("reads in Arabic", () => {
    state.lang = "ar";
    state.bs.advance_payment_enabled = true;
    render(<AdvancePaymentCard />);
    expect(screen.getByText("الدفعة المقدمة")).toBeInTheDocument();
    expect(screen.getByText(/تُدفع الآن/)).toBeInTheDocument();
  });
});
