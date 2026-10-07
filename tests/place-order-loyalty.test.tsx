import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Placing an order with points: the server takes the points and lowers the order's total before
// any payment is asked for, and a shopper whose points could not be applied is told.

const stubs = vi.hoisted(() => ({
  placeStorefrontOrder: vi.fn(),
  redeemLoyaltyForOrder: vi.fn(),
  awardLoyaltyForOrder: vi.fn(),
  navigate: vi.fn(),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(() => "t"),
    dismiss: vi.fn(),
  },
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => stubs.navigate }));
vi.mock("sonner", () => ({ toast: stubs.toast }));
const checkout = {
  placeStorefrontOrder: stubs.placeStorefrontOrder,
  recordOrderWhatsappOptIn: vi.fn(),
};
vi.mock("../src/lib/data/checkout", () => checkout);
vi.mock("@/lib/data/checkout", () => checkout);
const loyalty = {
  redeemLoyaltyForOrder: stubs.redeemLoyaltyForOrder,
  awardLoyaltyForOrder: stubs.awardLoyaltyForOrder,
};
vi.mock("../src/lib/loyalty-checkout.functions", () => loyalty);
vi.mock("@/lib/loyalty-checkout.functions", () => loyalty);
const carts = { markCartRecoveredOnOrder: vi.fn(async () => null) };
vi.mock("../src/lib/abandoned-carts.functions", () => carts);
vi.mock("@/lib/abandoned-carts.functions", () => carts);
const analytics = { trackStorefrontEvent: vi.fn() };
vi.mock("../src/lib/storefront-analytics", () => analytics);
vi.mock("@/lib/storefront-analytics", () => analytics);
const receipt = { uploadBenefitReceipt: vi.fn() };
vi.mock("../src/lib/benefit-receipt", () => receipt);
vi.mock("@/lib/benefit-receipt", () => receipt);

const { usePlaceOrder } = await import("../src/features/checkout/hooks/use-place-order");

const ORDER = "00000000-0000-4000-8000-0000000000d1";
const t = (_ar: string, en: string) => en;

function props(over: Record<string, unknown> = {}) {
  return {
    brand: { id: "brand-1", slug: "pura" },
    session: { user: { id: "u1" } },
    cart: [
      {
        variant_id: "v1",
        product_id: "p1",
        name: "Abaya",
        image: null,
        price: 40,
        size: "54",
        color: "black",
        qty: 1,
        max_stock: 5,
        custom_fields: [],
      },
    ],
    grandTotal: 38,
    shipping: 2,
    currency: "BHD",
    lang: "en",
    t,
    clearCart: vi.fn(),
    form: {
      name: "Sara",
      phone: "39001122",
      email: "",
      region: "Manama",
      block: "1",
      road: "2",
      house: "3",
      flat: "",
      notes: "",
    },
    acceptedTerms: true,
    saveToProfile: false,
    whatsappOrderUpdates: false,
    isGift: false,
    giftRecipient: "",
    giftMessage: "",
    fulfillment: "delivery",
    selectedDestination: "BH",
    selectedCountryCode: "BH",
    selectedZone: undefined,
    method: "cod",
    benefitReceipt: null,
    branches: [],
    branchId: "",
    digitalChannel: "email",
    digitalContact: "",
    appliedPromo: null,
    setAppliedPromo: vi.fn(),
    customerId: "customer-1",
    effectiveRedeemedPoints: 500,
    cartSessionId: "cart-session",
    paymentErrorState: null,
    ...over,
  };
}

async function place(over: Record<string, unknown> = {}) {
  const { result } = renderHook(() => usePlaceOrder(props(over) as never));
  await act(async () => {
    await result.current.submit();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.placeStorefrontOrder.mockResolvedValue({ orderId: ORDER, confirmationToken: "tok" });
  stubs.redeemLoyaltyForOrder.mockResolvedValue({ applied: true, discount: 5, total: 33 });
  stubs.awardLoyaltyForOrder.mockResolvedValue({ awarded: true });
});

describe("placing an order with loyalty points", () => {
  it("has the server redeem the points on the order that was just placed, then award its points", async () => {
    await place();
    expect(stubs.placeStorefrontOrder).toHaveBeenCalledTimes(1);
    expect(stubs.redeemLoyaltyForOrder).toHaveBeenCalledWith({
      data: { orderId: ORDER, points: 500 },
    });
    expect(stubs.awardLoyaltyForOrder).toHaveBeenCalledWith({ data: { orderId: ORDER } });
    expect(stubs.toast.warning).not.toHaveBeenCalled();
    expect(stubs.navigate).toHaveBeenCalled();
  });

  it("tells the shopper when the points could not be applied, and still places the order", async () => {
    stubs.redeemLoyaltyForOrder.mockResolvedValue({ applied: false, error: "Insufficient" });
    await place();
    expect(stubs.toast.warning).toHaveBeenCalledWith(
      "Your points could not be applied: the order total does not include the points discount.",
    );
    expect(stubs.navigate).toHaveBeenCalled();

    vi.clearAllMocks();
    stubs.placeStorefrontOrder.mockResolvedValue({ orderId: ORDER, confirmationToken: "tok" });
    stubs.redeemLoyaltyForOrder.mockRejectedValue(new Error("network"));
    await place();
    expect(stubs.toast.warning).toHaveBeenCalledTimes(1);
  });

  it("asks for no redemption when no points were used, and none of it for a guest", async () => {
    await place({ effectiveRedeemedPoints: 0 });
    expect(stubs.redeemLoyaltyForOrder).not.toHaveBeenCalled();
    expect(stubs.awardLoyaltyForOrder).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    stubs.placeStorefrontOrder.mockResolvedValue({ orderId: ORDER, confirmationToken: "tok" });
    await place({ session: null, customerId: null });
    expect(stubs.redeemLoyaltyForOrder).not.toHaveBeenCalled();
    expect(stubs.awardLoyaltyForOrder).not.toHaveBeenCalled();
    expect(stubs.navigate).toHaveBeenCalled();
  });
});
