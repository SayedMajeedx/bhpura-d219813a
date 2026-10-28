import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { promoScopeText } from "../src/lib/promo-scope";
import { promoFailureMessage } from "../src/features/orders/lib/order-editor";
import { promoRejectionMessage } from "../src/features/checkout/lib/promo-rejection";
import { DiscountMobileCard } from "../src/components/discounts/DiscountMobileCard";

// The app's side of a promo code's own rules (migration 20261028160000, run in a real Postgres by
// tests/promo-code-rules-migration.test.ts): the list says what a code is for, and every reason
// the database now refuses a code for is said to the merchant and to the shopper.

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

describe("what a promo code is for", () => {
  it("says nothing for a code that reaches every line", () => {
    expect(promoScopeText({ product_ids: [], category_slugs: [] }, "en")).toBeNull();
    expect(promoScopeText({}, "ar")).toBeNull();
  });

  it("counts the products and categories chosen, in both languages", () => {
    expect(promoScopeText({ product_ids: ["a", "b"], category_slugs: [] }, "en")).toBe(
      "For 2 products chosen",
    );
    expect(promoScopeText({ product_ids: ["a"], category_slugs: ["x", "y", "z"] }, "en")).toBe(
      "For 1 product and 3 categories chosen",
    );
    expect(promoScopeText({ product_ids: ["a", "b"], category_slugs: [] }, "ar")).toBe(
      "لـ منتجان محددة",
    );
  });
});

describe("the reasons a code is refused", () => {
  const reasons = [
    "CODE_NOT_STARTED",
    "CODE_EXPIRED",
    "CODE_MAX_REDEMPTIONS_REACHED",
    "NO_ELIGIBLE_ITEMS",
  ];

  it("each is said to the merchant, apart from the generic fallback", () => {
    const fallback = promoFailureMessage({ reason: "SOMETHING_ELSE" }, "en");
    const seen = new Set<string>();
    for (const reason of reasons) {
      const text = promoFailureMessage({ reason }, "en");
      expect(text).not.toBe(fallback);
      seen.add(text);
      expect(promoFailureMessage({ reason }, "ar")).not.toBe(
        promoFailureMessage({ reason: "SOMETHING_ELSE" }, "ar"),
      );
    }
    expect(seen.size).toBe(reasons.length);
  });

  it("each is said to the shopper too, and a scoped code does not blame the sale", () => {
    const t = (ar: string, en: string) => en;
    const say = (reason: string) =>
      promoRejectionMessage({ reason }, { currency: "BHD", lang: "en", t } as never);
    const fallback = say("SOMETHING_ELSE");
    for (const reason of reasons) expect(say(reason)).not.toBe(fallback);
    expect(say("CODE_EXPIRED")).toBe("This promo code has ended.");
    expect(say("NO_ELIGIBLE_ITEMS")).toBe(
      "This promo code does not apply to the items in your cart.",
    );
  });
});

describe("the Discounts list", () => {
  const promo = {
    id: "p1",
    brand_id: "b1",
    code: "ABAYA20",
    discount_type: "percentage" as const,
    discount_value: 20,
    minimum_order_amount: null,
    maximum_discount_amount: null,
    first_time_customers_only: false,
    returning_customers_only: false,
    exclude_sale_items: false,
    usage_limit_per_customer: null,
    is_active: true,
    created_at: "2026-10-01T00:00:00Z",
    exclude_low_margin: false,
    margin_threshold: 20,
    start_date: null,
    end_date: null,
    max_redemptions: null,
    product_ids: ["a", "b"],
    category_slugs: ["abayas"],
  };
  const card = (patch: Record<string, unknown> = {}) =>
    render(
      <DiscountMobileCard
        lang="en"
        promo={{ ...promo, ...patch }}
        currency="BHD"
        analyticsData={{}}
        onEdit={vi.fn()}
        onToggleActive={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

  it("says what a scoped code is for on its card", () => {
    card();
    expect(screen.getByText("For 2 products and 1 category chosen")).toBeTruthy();
  });

  it("says nothing extra for a code that reaches every line", () => {
    card({ product_ids: [], category_slugs: [] });
    expect(screen.queryByText(/chosen/)).toBeNull();
  });
});
