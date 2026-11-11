import React from "react";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GIFT_OPTIONS,
  giftCardFee,
  giftPayload,
  giftPriceFromText,
  giftRefusal,
  orderGift,
  readGiftOptions,
  type GiftChoice,
} from "../src/lib/gift-order";
import { giftAdvanceLines } from "../src/features/checkout/lib/advance-cart-lines";
import { placeOrderFailure } from "../src/features/checkout/lib/place-order";
import { giftOrderNote } from "../src/lib/gift-order-note";
import { orderTotals } from "../src/lib/order-tax";

// A gift order by the store's settings: what the store offers, what its message card adds to the
// order, what checkout sends (never a price), how staff read an order's gift, and the screens:
// the checkout's gift fields, the settings card and the order page's card block.

const stubs = vi.hoisted(() => ({
  options: null as unknown,
  settings: null as unknown,
  save: vi.fn(async () => undefined),
}));

const data = vi.hoisted(() => ({
  giftOrderQueries: {
    storefront: (slug: string, enabled = true) => ({
      queryKey: ["gift-options", slug],
      queryFn: async () => stubs.options,
      enabled,
    }),
    settings: (brandId: string) => ({
      queryKey: ["gift-settings", brandId],
      queryFn: async () => stubs.settings,
    }),
  },
  saveGiftOrderSettings: (...args: unknown[]) => stubs.save(...(args as [])),
  invalidateGiftOrderSettings: vi.fn(async () => undefined),
}));
vi.mock("../src/lib/data/gift-orders", () => data);
vi.mock("@/lib/data/gift-orders", () => data);
const storefront = {
  useStorefront: () => ({
    brand: { id: "b1", slug: "pura", name_en: "Pura Line", name_ar: "بيورا لاين" },
    settings: {},
    lang: "en",
    t: (_ar: string, en: string) => en,
  }),
  formatPrice: (n: number, currency: string) => `${currency} ${n.toFixed(3)}`,
};
vi.mock("../src/lib/storefront-context", () => storefront);
vi.mock("@/lib/storefront-context", () => storefront);
const designs = vi.hoisted(() => ({
  cardDesignQueries: {
    store: () => ({
      queryKey: ["designs"],
      queryFn: async () => ({ off: [], signature: null, photo_products: [], photos: [] }),
    }),
  },
}));
vi.mock("../src/lib/data/gift-cards/designs", () => designs);
vi.mock("@/lib/data/gift-cards/designs", () => designs);
const brand = { id: "b1", slug: "pura", name_en: "Pura Line", name_ar: "بيورا لاين" };
vi.mock("../src/lib/brand-context", () => ({ useBrand: () => brand }));
vi.mock("@/lib/brand-context", () => ({ useBrand: () => brand }));
const currency = { useMoneyLabel: () => "BHD", useStoreCurrency: () => "BHD" };
vi.mock("../src/hooks/use-store-currency", () => currency);
vi.mock("@/hooks/use-store-currency", () => currency);
const print = {
  PrintButton: ({ label, source }: { label: string; source: () => unknown }) => (
    <button type="button" data-source={JSON.stringify(source())}>
      {label}
    </button>
  ),
};
vi.mock("../src/features/gift-cards/components/PrintCardDialog", () => print);
vi.mock("@/features/gift-cards/components/PrintCardDialog", () => print);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../src/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const { useCheckoutGift } = await import("../src/features/checkout/hooks/use-checkout-gift");
const { GiftOrderFields } = await import("../src/features/checkout/components/GiftOrderFields");
const { GiftOrdersSettingCard } =
  await import("../src/features/settings/tabs/orders/GiftOrdersSettingCard");
const { GiftMessageCardBlock } =
  await import("../src/features/gift-cards/components/GiftMessageCard");

const t = (_ar: string, en: string) => en;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);
const PRICED = { enabled: true, card: true, cardPrice: 1.5, prepaid: false };
const choice = (overrides: Partial<GiftChoice> = {}): GiftChoice => ({
  isGift: true,
  recipient: " Noor ",
  message: " Eid Mubarak ",
  from: " Sara ",
  withCard: true,
  tone: "cream",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  stubs.options = PRICED;
  stubs.settings = PRICED;
});

describe("the gift order's rules", () => {
  it("read a store that set nothing as before: gift orders on, a free card", () => {
    expect(readGiftOptions(null)).toEqual(DEFAULT_GIFT_OPTIONS);
    expect(DEFAULT_GIFT_OPTIONS).toEqual({
      enabled: true,
      card: true,
      cardPrice: 0,
      prepaid: false,
    });
    expect(readGiftOptions({ enabled: true, card: true, card_price: 1.5, prepaid: true })).toEqual({
      enabled: true,
      card: true,
      cardPrice: 1.5,
      prepaid: true,
    });
    // No card without gift orders, whatever its own switch says.
    expect(readGiftOptions({ enabled: false, card: true, card_price: 2 }).card).toBe(false);
  });

  it("charge the card's price only when the order is a gift that keeps the card", () => {
    expect(giftCardFee(choice(), PRICED)).toBe(1.5);
    expect(giftCardFee(choice({ withCard: false }), PRICED)).toBe(0);
    expect(giftCardFee(choice({ isGift: false }), PRICED)).toBe(0);
    expect(giftCardFee(choice(), { ...PRICED, card: false })).toBe(0);
    expect(giftCardFee(choice(), DEFAULT_GIFT_OPTIONS)).toBe(0);
  });

  it("send the shopper's words and the card's design, and never a price", () => {
    expect(giftPayload(choice(), PRICED)).toEqual({
      recipient: "Noor",
      from: "Sara",
      card: true,
      message: "Eid Mubarak",
      design: "signature:cream",
    });
    // Without the card there is no message to print.
    expect(giftPayload(choice({ withCard: false }), PRICED)).toEqual({
      recipient: "Noor",
      from: "Sara",
      card: false,
    });
    expect(giftPayload(choice({ isGift: false }), PRICED)).toBeNull();
    expect(giftPayload(choice(), { ...PRICED, enabled: false })).toBeNull();
  });

  it("give the checkout the total the database charges: the card taxed, after the discount", () => {
    // 25.000 piece, 5.000 code, 1.500 card, 10% VAT on top (tests/gift-orders-migration.test.ts).
    const totals = orderTotals(
      {
        subtotal: 25 + giftCardFee(choice(), PRICED),
        discount: 5,
        shipping: 0,
        loyaltyDiscount: 0,
      },
      { rate: 10, inclusive: false },
    );
    expect(totals.total).toBeCloseTo(23.65, 3);
    expect(giftAdvanceLines(1.5)).toEqual([
      { amount: 1.5, madeToOrder: false, productId: null, category: null },
    ]);
    expect(giftAdvanceLines(0)).toEqual([]);
  });

  it("read an order's gift from its own details, else from an older order's notes", () => {
    expect(
      orderGift({
        gift: {
          recipient: "Noor",
          from: "Sara",
          card: true,
          card_price: 1.5,
          design: "type:cream",
        },
        notes: null,
      }),
    ).toEqual({
      recipient: "Noor",
      message: null,
      from: "Sara",
      card: true,
      cardPrice: 1.5,
      design: "type:cream",
    });
    expect(orderGift({ gift: null, notes: giftOrderNote("Noor", "Eid Mubarak") })).toEqual({
      recipient: "Noor",
      message: "Eid Mubarak",
      from: null,
      card: true,
      cardPrice: 0,
      design: null,
    });
    expect(orderGift({ gift: null, notes: "Leave it at the door" })).toBeNull();
  });

  it("read the price as typed and word the database's refusals", () => {
    expect(giftPriceFromText("1.5")).toBe(1.5);
    expect(giftPriceFromText("١٫٥")).toBe(1.5);
    expect(giftPriceFromText("")).toBe(0);
    expect(giftPriceFromText("-1")).toBeNull();
    expect(giftPriceFromText("abc")).toBeNull();
    expect(giftPriceFromText("5000")).toBeNull();
    expect(giftRefusal("GIFT_ORDER_PREPAID", "en")).toMatch(/paid in advance/);
    expect(giftRefusal("something else", "en")).toBeNull();
    expect(placeOrderFailure("GIFT_ORDER_PREPAID", t).message).toMatch(/paid in advance/);
  });
});

describe("the checkout's gift", () => {
  const props = { slug: "pura", recipient: "Noor", message: "Eid Mubarak", enabled: true };

  it("adds the store's card price for a gift, and nothing for an order that is not one", async () => {
    const { result, rerender } = renderHook(
      (isGift: boolean) => useCheckoutGift({ ...props, isGift }),
      {
        wrapper,
        initialProps: false,
      },
    );
    await waitFor(() => expect(result.current.options.cardPrice).toBe(1.5));
    expect(result.current.fee).toBe(0);
    expect(result.current.payload).toBeNull();
    rerender(true);
    expect(result.current.fee).toBe(1.5);
    expect(result.current.payload).toMatchObject({ recipient: "Noor", card: true });
  });

  it("leaves cash on delivery out of a gift order the store asks to be paid first", async () => {
    stubs.options = { ...PRICED, prepaid: true };
    const { result } = renderHook(() => useCheckoutGift({ ...props, isGift: true }), { wrapper });
    await waitFor(() => expect(result.current.prepaid).toBe(true));
    const plain = renderHook(() => useCheckoutGift({ ...props, isGift: false }), { wrapper });
    await waitFor(() => expect(plain.result.current.options.prepaid).toBe(true));
    expect(plain.result.current.prepaid).toBe(false);
  });

  it("offers nothing where an order is a booking, or the store takes no gift orders", async () => {
    const booking = renderHook(() => useCheckoutGift({ ...props, isGift: true, enabled: false }), {
      wrapper,
    });
    expect(booking.result.current.offered).toBe(false);
    expect(booking.result.current.payload).toBeNull();
    stubs.options = { ...PRICED, enabled: false, card: false };
    const off = renderHook(() => useCheckoutGift({ ...props, isGift: true }), { wrapper });
    await waitFor(() => expect(off.result.current.offered).toBe(false));
    expect(off.result.current.fee).toBe(0);
  });
});

describe("the checkout's gift fields", () => {
  function Fields({ start = false }: { start?: boolean }) {
    const [isGift, setIsGift] = React.useState(start);
    const [recipient, setRecipient] = React.useState("");
    const [message, setMessage] = React.useState("");
    const gift = useCheckoutGift({ slug: "pura", isGift, recipient, message, enabled: true });
    return (
      <>
        <GiftOrderFields
          gift={gift}
          isGift={isGift}
          setIsGift={setIsGift}
          recipient={recipient}
          setRecipient={setRecipient}
          message={message}
          setMessage={setMessage}
          currency="BHD"
          lang="en"
          t={t}
        />
        <output data-testid="fee">{gift.fee}</output>
      </>
    );
  }

  it("show the card with the store's price, the message, who it is from and the card's colour", async () => {
    render(<Fields start />, { wrapper });
    expect(await screen.findByText("+ BHD 1.500")).toBeInTheDocument();
    expect(screen.getByLabelText("Recipient's name (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("The card's message")).toBeInTheDocument();
    expect(screen.getByLabelText("From (optional)")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Store colour" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("radio", { name: "Cream" }));
    expect(screen.getByRole("radio", { name: "Cream" })).toHaveAttribute("aria-checked", "true");
    // The card is drawn as it will be printed.
    expect(screen.getByRole("img", { name: "Front of the card" })).toBeInTheDocument();
    expect(screen.getByTestId("fee")).toHaveTextContent("1.5");
  });

  it("charge nothing and ask for no message once the card is taken off", async () => {
    render(<Fields start />, { wrapper });
    await screen.findByText("+ BHD 1.500");
    fireEvent.click(screen.getByRole("checkbox", { name: /A gift card with your message/ }));
    expect(screen.queryByLabelText("The card's message")).not.toBeInTheDocument();
    expect(screen.getByTestId("fee")).toHaveTextContent("0");
    expect(screen.getByLabelText("Recipient's name (optional)")).toBeInTheDocument();
  });

  it("say a free card is free, and show no card a store does not offer", async () => {
    stubs.options = { ...PRICED, cardPrice: 0 };
    const free = render(<Fields start />, { wrapper });
    expect(await screen.findByText("Free")).toBeInTheDocument();
    free.unmount();
    stubs.options = { ...PRICED, card: false };
    render(<Fields start />, { wrapper });
    await screen.findByLabelText("Recipient's name (optional)");
    await waitFor(() =>
      expect(
        screen.queryByRole("checkbox", { name: /A gift card with your message/ }),
      ).not.toBeInTheDocument(),
    );
  });

  it("are not shown by a store that takes no gift orders", async () => {
    stubs.options = { ...PRICED, enabled: false };
    render(<Fields />, { wrapper });
    await waitFor(() =>
      expect(screen.queryByText("Send this order as a gift?")).not.toBeInTheDocument(),
    );
  });
});

describe("the store's gift settings", () => {
  it("save the card's price and the switches, once something changed", async () => {
    render(<GiftOrdersSettingCard lang="en" />, { wrapper });
    const price = await screen.findByLabelText("The card's price (BHD)");
    const save = screen.getByRole("button", { name: "Save gift settings" });
    expect(save).toBeDisabled();
    fireEvent.change(price, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("switch", { name: "A gift order is paid in advance" }));
    fireEvent.click(save);
    await waitFor(() =>
      expect(stubs.save).toHaveBeenCalledWith("b1", {
        enabled: true,
        card: true,
        cardPrice: 2,
        prepaid: true,
      }),
    );
  });

  it("refuse a price that is not one, and fold the rest when gift orders are off", async () => {
    render(<GiftOrdersSettingCard lang="en" />, { wrapper });
    fireEvent.change(await screen.findByLabelText("The card's price (BHD)"), {
      target: { value: "abc" },
    });
    expect(screen.getByText("Write a number from 0 to 1000.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save gift settings" })).toBeDisabled();
    fireEvent.click(screen.getByRole("switch", { name: "We take gift orders" }));
    expect(screen.queryByLabelText("The card's price (BHD)")).not.toBeInTheDocument();
  });
});

describe("the order page's gift block", () => {
  const sourceOf = () =>
    JSON.parse(screen.getByRole("button").getAttribute("data-source") ?? "{}") as {
      details: Record<string, unknown>;
      initial: Record<string, unknown>;
    };

  it("prints the card in the colour the shopper chose, with who it is from", () => {
    render(
      <GiftMessageCardBlock
        gift={{
          recipient: "Noor",
          message: "Eid Mubarak",
          from: "Sara",
          card: true,
          card_price: 1.5,
          design: "signature:cream",
        }}
        notes={null}
        invoiceNumber={1042}
        lang="en"
      />,
    );
    expect(screen.getByText("Gift message card")).toBeInTheDocument();
    expect(screen.getByText(/To Noor · From Sara/)).toBeInTheDocument();
    const source = sourceOf();
    expect(source.details).toMatchObject({
      to: "Noor",
      message: "Eid Mubarak",
      purpose: "message",
    });
    expect(source.initial).toMatchObject({ design: "signature:cream", from: "Sara" });
  });

  it("says a gift sent with no card, and still reads an older order's notes", () => {
    const { unmount } = render(
      <GiftMessageCardBlock
        gift={{ recipient: "Noor", card: false, card_price: 0 }}
        notes={null}
        invoiceNumber={7}
        lang="en"
      />,
    );
    expect(screen.getByText("A gift order with no card")).toBeInTheDocument();
    unmount();
    render(
      <GiftMessageCardBlock
        notes={giftOrderNote("Noor", "Eid Mubarak")}
        invoiceNumber={8}
        lang="en"
      />,
    );
    expect(screen.getByText("Gift message card")).toBeInTheDocument();
    expect(sourceOf().details).toMatchObject({ to: "Noor", message: "Eid Mubarak" });
  });
});
