import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Placing an order with a gift card: the card pays once the order exists, after the points and
// before the card gateway; a card that pays all that is asked now skips the gateway and the
// transfer receipt, and a card that could not be used is said.

const stubs = vi.hoisted(() => ({
  placeStorefrontOrder: vi.fn(),
  redeemLoyaltyForOrder: vi.fn(),
  redeemGiftCardAtCheckout: vi.fn(),
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
};
vi.mock("../src/lib/loyalty-checkout.functions", () => loyalty);
vi.mock("@/lib/loyalty-checkout.functions", () => loyalty);
const giftCards = { redeemGiftCardAtCheckout: stubs.redeemGiftCardAtCheckout };
vi.mock("../src/lib/gift-card-checkout.functions", () => giftCards);
vi.mock("@/lib/gift-card-checkout.functions", () => giftCards);
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
    effectiveRedeemedPoints: 0,
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

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  stubs.placeStorefrontOrder.mockResolvedValue({ orderId: ORDER, confirmationToken: "tok" });
  stubs.redeemGiftCardAtCheckout.mockResolvedValue({ applied: true, amount: 30, owed: 8 });
});

const CODE = "ABCD-EFGH-JKMN";
const charge = (status: number, body: unknown) =>
  fetchMock.mockResolvedValue({ ok: status < 300, status, json: async () => body });

describe("placing an order with a gift card", () => {
  it("takes the card on the order just placed, proven by its token", async () => {
    await place({ giftCardCode: CODE });
    expect(stubs.redeemGiftCardAtCheckout).toHaveBeenCalledWith({
      data: { orderId: ORDER, brandId: "brand-1", confirmationToken: "tok", code: CODE },
    });
    expect(stubs.toast.warning).not.toHaveBeenCalled();
    expect(stubs.navigate).toHaveBeenCalled();
  });

  it("sends a card order on to the gateway for what is left", async () => {
    charge(200, { redirectUrl: "https://pay.example/x" });
    const location = { href: "" };
    vi.stubGlobal("location", location);
    await place({ giftCardCode: CODE, method: "card" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(stubs.redeemGiftCardAtCheckout.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0],
    );
  });

  it("skips the gateway when the card paid the whole order", async () => {
    stubs.redeemGiftCardAtCheckout.mockResolvedValue({ applied: true, amount: 38, owed: 0 });
    await place({ giftCardCode: CODE, method: "card" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stubs.navigate).toHaveBeenCalled();
  });

  it("goes to the thank-you page when the card paid all the charge would have asked", async () => {
    charge(409, { error: "Order is already paid.", code: "ORDER_ALREADY_PAID" });
    await place({ giftCardCode: CODE, method: "card" });
    expect(stubs.toast.error).not.toHaveBeenCalled();
    expect(stubs.navigate).toHaveBeenCalled();
  });

  it("asks for no transfer receipt when the card pays all that is asked now", async () => {
    await place({ giftCardCode: CODE, method: "benefit", giftCardCoversNow: true });
    expect(stubs.placeStorefrontOrder).toHaveBeenCalledTimes(1);
    expect(stubs.toast.error).not.toHaveBeenCalled();

    vi.clearAllMocks();
    await place({ giftCardCode: CODE, method: "benefit", giftCardCoversNow: false });
    expect(stubs.placeStorefrontOrder).not.toHaveBeenCalled();
    expect(stubs.toast.error).toHaveBeenCalled();
  });

  it("tells the shopper when the card could not be used, and still places the order", async () => {
    stubs.redeemGiftCardAtCheckout.mockResolvedValue({ applied: false, reason: "GIFT_CARD_EMPTY" });
    await place({ giftCardCode: CODE });
    expect(stubs.toast.warning).toHaveBeenCalledWith(
      "The gift card could not be used: the order is paid without it.",
    );
    expect(stubs.navigate).toHaveBeenCalled();
  });

  it("asks nothing of a card when none was applied", async () => {
    await place();
    expect(stubs.redeemGiftCardAtCheckout).not.toHaveBeenCalled();
  });
});

describe("the gift card in the order summary", () => {
  it("offers the field, then shows the card with what it pays and what is left", async () => {
    const { render, screen, fireEvent } = await import("@testing-library/react");
    const { GiftCardBox, GiftCardLines } =
      await import("../src/features/checkout/components/GiftCardBox");
    const apply = vi.fn();
    const base = {
      offered: true,
      input: "",
      setInput: vi.fn(),
      card: null,
      checking: false,
      refusal: null,
      apply,
      remove: vi.fn(),
    };
    const { rerender } = render(
      <GiftCardBox giftCard={{ ...base, refusal: "not_found" }} currency="BHD" lang="en" t={t} />,
    );
    expect(screen.getByLabelText("Have a gift card?")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("No usable gift card");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(apply).toHaveBeenCalled();

    rerender(
      <GiftCardBox
        giftCard={{ ...base, card: { code: "ABCD-EFGH-JKMN", balance: 30, currency: "BHD" } }}
        currency="BHD"
        lang="en"
        t={t}
      />,
    );
    expect(screen.getByText("ABCD-EFGH-JKMN")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();

    render(
      <GiftCardLines
        pay={{ used: 30, left: 50, payNow: 0, coversNow: true }}
        code="ABCD-EFGH-JKMN"
        method="benefit"
        currency="BHD"
        lang="en"
        t={t}
      />,
    );
    expect(screen.getByText("Left to pay")).toBeTruthy();
    expect(screen.getByText(/No transfer receipt is needed/)).toBeTruthy();
  });
});
