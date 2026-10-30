import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MadeToOrderEstimateField } from "../src/features/settings/tabs/orders/MadeToOrderEstimateField";

// The made-to-order time in Orders → Delivery & Pickup's simple view, beside the ready pieces'
// time: it was in the advanced fold only, so a made-to-order boutique never found it.

const state = vi.hoisted(() => ({ bs: {} as Record<string, unknown>, setBs: vi.fn() }));
const form = vi.hoisted(() => ({
  useBrandSettingsFormContext: () => ({ form: { bs: state.bs }, setBs: state.setBs }),
}));
vi.mock("../src/features/settings/use-brand-settings-form", () => form);
vi.mock("@/features/settings/use-brand-settings-form", () => form);
const words = vi.hoisted(() => ({
  useVocabulary: () => ({ vocabulary: { made_to_order: { ar: "تفصيل", en: "Tailored" } } }),
}));
vi.mock("../src/hooks/use-vocabulary", () => words);
vi.mock("@/hooks/use-vocabulary", () => words);

beforeEach(() => {
  state.bs = {
    delivery_estimate_tailored_ar: "خلال 10 أيام",
    delivery_estimate_tailored_en: "In 10 days",
  };
  state.setBs = vi.fn();
});

describe("the made-to-order time in the simple view", () => {
  it("is named in the store's own word and shows what is saved in the reader's language", () => {
    render(<MadeToOrderEstimateField lang="ar" />);
    const field = screen.getByLabelText("وقت القطع (تفصيل)") as HTMLInputElement;
    expect(field.value).toBe("خلال 10 أيام");
  });

  it("writes the reader's language only, and empties to nothing", () => {
    render(<MadeToOrderEstimateField lang="en" />);
    fireEvent.change(screen.getByLabelText("Time for pieces (Tailored)"), {
      target: { value: "Made in 7 days" },
    });
    expect(state.setBs).toHaveBeenLastCalledWith({
      delivery_estimate_tailored_en: "Made in 7 days",
    });
  });

  it("clears to nothing, so the ready pieces' time shows", () => {
    render(<MadeToOrderEstimateField lang="en" />);
    const field = screen.getByLabelText("Time for pieces (Tailored)");
    fireEvent.change(field, { target: { value: "Made in 7 days" } });
    expect(state.setBs).toHaveBeenLastCalledWith({
      delivery_estimate_tailored_en: "Made in 7 days",
    });
    fireEvent.change(field, { target: { value: "" } });
    expect(state.setBs).toHaveBeenLastCalledWith({ delivery_estimate_tailored_en: null });
  });
});
