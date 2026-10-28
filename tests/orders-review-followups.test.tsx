import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// What the re-check of the orders review (2026-10-28) found: a part-payment typed in by staff
// means a card payment has arrived, the payment method's "Edit" is locked in safe view mode, a
// verified receipt reads as a record, the banners count in words, and the margin warning of a
// promo code looks at the products it is for.

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
const profileContext = {
  useProfile: () => ({ canViewFinancials: true }),
  useProfileOptional: () => ({ canViewFinancials: true }),
};
vi.mock("../src/lib/profile-context", () => profileContext);
vi.mock("@/lib/profile-context", () => profileContext);

const { getOrderWorkflow } = await import("../src/lib/order-workflow");
const { OrderFinancialCard } = await import("../src/features/orders/components/OrderFinancialCard");
const { BenefitReceiptReview } =
  await import("../src/features/orders/components/BenefitReceiptReview");
const { UrgentOrdersBanner } = await import("../src/features/orders/components/UrgentOrdersBanner");
const { orderTotals } = await import("../src/features/orders/lib/order-editor");
const { inPromoScope } = await import("../src/lib/promo-scope");

describe("a card payment that has partly arrived", () => {
  const order = (patch: Record<string, unknown>) => ({
    total: 24,
    status: "pending",
    fulfillment_status: "PENDING",
    fulfillment_method: "delivery",
    payment_method: "card",
    order_items: [{ location: "main" }],
    ...patch,
  });

  it("is worked on when staff typed an advance, even if the status was left unpaid", () => {
    const typed = getOrderWorkflow(order({ payment_status: "unpaid", advance_paid: 10 }));
    expect(typed.payment).toBe("partial");
    expect(typed.nextAction).toBe("start_packing");
  });

  it("still waits when nothing is recorded", () => {
    const none = getOrderWorkflow(order({ payment_status: "unpaid", advance_paid: 0 }));
    expect(none.nextAction).toBe("none");
    expect(none.needsAttention).toBe(false);
  });
});

describe("the order's money card in safe view mode", () => {
  const card = (isReadOnly: boolean) =>
    render(
      <OrderFinancialCard
        {...({
          appliedPromo: null,
          benefit: {},
          bomItemsQ: { data: [] },
          checkingPromo: false,
          currency: "BHD",
          discountMode: "fixed",
          discountPercentInput: "",
          isEditingFees: false,
          isReadOnly,
          items: [],
          lang: "en",
          mobileTab: "items",
          order: {
            id: "o1",
            payment_method: "cod",
            currency: "BHD",
            order_date: "2026-10-28",
            discount: 0,
            shipping: 0,
            tax_rate: 0,
            total: 10,
            advance_paid: 0,
            status: "pending",
            payment_status: "unpaid",
          },
          packagingMaterialsQ: { data: [] },
          paymentBadge: "unpaid",
          productsQ: { data: [] },
          promoInput: "",
          receiptViewQ: { isLoading: false, data: null },
          setManagePaymentOpen: vi.fn(),
          storeTaxRate: 0,
          t: (key: string) => key,
          totals: orderTotals([{ line_total: 10 } as never], {}, false),
          variantsQ: { data: [] },
        } as never)}
      />,
    );

  it("cannot open the payment editor from the payment method's Edit link", () => {
    card(true);
    expect(screen.getByTitle("Edit payment method")).toBeDisabled();
  });

  it("can once the order is open for editing", () => {
    card(false);
    expect(screen.getByTitle("Edit payment method")).not.toBeDisabled();
  });
});

describe("a transfer receipt once verified", () => {
  const review = (payment_status: string) => {
    const { container } = render(
      <BenefitReceiptReview
        currency="BHD"
        expected={null}
        approveBenefitPayment={vi.fn()}
        approvingBenefit={false}
        lang="en"
        order={{ id: "o1", payment_status } as never}
        receiptViewQ={{ isLoading: false, data: null } as never}
        rejectBenefitPayment={vi.fn()}
        rejectReason=""
        rejectReasonOpen={false}
        rejectingBenefit={false}
        setRejectReason={vi.fn()}
        setRejectReasonOpen={vi.fn()}
      />,
    );
    return (container.firstElementChild as HTMLElement).className;
  };

  it("reads as a record (green), not as something waiting (amber)", () => {
    expect(review("partially_paid")).toMatch(/emerald/);
    expect(review("paid")).toMatch(/emerald/);
    expect(review("partially_paid")).not.toMatch(/amber/);
  });

  it("is amber while it waits for its check", () => {
    expect(review("unpaid")).toMatch(/amber/);
  });
});

describe("the urgent banner counts in words", () => {
  const banner = (count: number, lang: "en" | "ar") =>
    render(
      <UrgentOrdersBanner
        hasMadeToOrder={false}
        lang={lang}
        setPage={vi.fn()}
        setTabFilter={vi.fn()}
        tabCounts={{
          all: 9,
          unpaid: 0,
          action_required: count,
          to_prepare: 0,
          shipped: 0,
          completed: 0,
        }}
      />,
    );

  it("says one order and several orders, with the verb that goes with them", () => {
    const one = banner(1, "en");
    expect(screen.getByText("1 order needs action now")).toBeTruthy();
    one.unmount();
    banner(3, "en");
    expect(screen.getByText("3 orders need action now")).toBeTruthy();
    expect(screen.queryByText(/order\(s\)/)).toBeNull();
  });
});

describe("the products a promo code is for", () => {
  const abaya = { id: "p1", category: "abayas" };
  const scarf = { id: "p2", category: "scarves" };
  const loose = { id: "p3", category: null };

  it("is every product when none is chosen", () => {
    for (const product of [abaya, scarf, loose])
      expect(inPromoScope({ product_ids: [], category_slugs: [] }, product)).toBe(true);
    expect(inPromoScope({}, loose)).toBe(true);
  });

  it("counts a product that is chosen or whose category is", () => {
    const scope = { product_ids: ["p2"], category_slugs: ["abayas"] };
    expect(inPromoScope(scope, abaya)).toBe(true);
    expect(inPromoScope(scope, scarf)).toBe(true);
    expect(inPromoScope(scope, loose)).toBe(false);
    expect(inPromoScope({ product_ids: [], category_slugs: ["abayas"] }, scarf)).toBe(false);
  });
});
