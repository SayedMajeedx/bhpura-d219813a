import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Gift cards, step one, on the admin's screens: the rules that read a card, the page that lists
// and issues them, and taking one as payment on an order (the database's own rules are run in a
// real Postgres by tests/gift-cards-migration.test.ts).

const data = vi.hoisted(() => ({
  cards: [] as unknown[],
  moves: [] as unknown[],
  issueGiftCard: vi.fn(),
  voidGiftCard: vi.fn(),
  redeemGiftCardOnOrder: vi.fn(),
  settings: null as unknown,
  purchases: [] as unknown[],
  saveGiftCardSettings: vi.fn(async () => null),
  approveGiftCardPurchase: vi.fn(async () => null),
  cancelGiftCardPurchase: vi.fn(async () => undefined),
  markGiftCardPurchaseSent: vi.fn(async () => undefined),
}));
vi.mock("../src/lib/data/gift-cards", () => ({
  giftCardQueries: {
    list: () => ({ queryKey: ["gift-cards", "list"], queryFn: async () => data.cards }),
    moves: (_b: string, id: string) => ({
      queryKey: ["gift-cards", "moves", id],
      queryFn: async () => data.moves,
    }),
  },
  invalidateGiftCards: vi.fn(async () => undefined),
  issueGiftCard: data.issueGiftCard,
  voidGiftCard: data.voidGiftCard,
  redeemGiftCardOnOrder: data.redeemGiftCardOnOrder,
  giftCardOnlineQueries: {
    settings: () => ({ queryKey: ["gift-cards", "settings"], queryFn: async () => data.settings }),
    purchases: () => ({
      queryKey: ["gift-cards", "purchases"],
      queryFn: async () => data.purchases,
    }),
  },
  saveGiftCardSettings: data.saveGiftCardSettings,
  approveGiftCardPurchase: data.approveGiftCardPurchase,
  cancelGiftCardPurchase: data.cancelGiftCardPurchase,
  markGiftCardPurchaseSent: data.markGiftCardPurchaseSent,
  invalidateGiftCardOnline: vi.fn(async () => undefined),
}));
const purchaseFns = {
  getGiftCardPurchaseReceiptUrl: vi.fn(async () => ({ url: "https://r2.test/r" })),
};
vi.mock("../src/lib/gift-card-purchase.functions", () => purchaseFns);
vi.mock("@/lib/gift-card-purchase.functions", () => purchaseFns);
const confirm = vi.hoisted(() => ({ confirmDialog: vi.fn(async () => true) }));
vi.mock("../src/components/ui/confirm-dialog", () => confirm);
vi.mock("@/components/ui/confirm-dialog", () => confirm);
vi.mock("@/lib/data/gift-cards", async () => await import("../src/lib/data/gift-cards"));
vi.mock("../src/lib/data/orders/mutations", () => ({
  invalidateOrders: vi.fn(async () => undefined),
}));
vi.mock("@/lib/data/orders/mutations", () => ({ invalidateOrders: vi.fn(async () => undefined) }));
const brand = { id: "b1", slug: "pura", name_en: "Pura Line", name_ar: "بيورا لاين" };
vi.mock("../src/lib/brand-context", () => ({ useBrand: () => brand }));
vi.mock("@/lib/brand-context", () => ({ useBrand: () => brand }));
vi.mock("../src/lib/i18n", () => ({ useI18n: () => ({ lang: "en" }) }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ lang: "en" }) }));
vi.mock("../src/hooks/use-store-currency", () => ({
  useStoreCurrency: () => "BHD",
  useMoneyLabel: () => "BHD",
}));
vi.mock("@/hooks/use-store-currency", () => ({
  useStoreCurrency: () => "BHD",
  useMoneyLabel: () => "BHD",
}));
const profile = vi.hoisted(() => ({ allowed: true }));
vi.mock("../src/lib/profile-context", () => ({
  useProfileOptional: () => ({ hasPermission: () => profile.allowed }),
  useProfile: () => ({ hasPermission: () => profile.allowed }),
}));
vi.mock("@/lib/profile-context", () => ({
  useProfileOptional: () => ({ hasPermission: () => profile.allowed }),
  useProfile: () => ({ hasPermission: () => profile.allowed }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const rules = await import("../src/features/gift-cards/lib/gift-cards");
const { GiftCardsPage } = await import("../src/features/gift-cards/components/GiftCardsPage");
const { OrderGiftCardPayment } =
  await import("../src/features/gift-cards/components/OrderGiftCardPayment");

const card = (overrides: Record<string, unknown> = {}) => ({
  id: "c1",
  brand_id: "b1",
  code: "ABCD-EFGH-JKMN",
  currency: "BHD",
  initial_amount: 50,
  balance: 30,
  expires_on: null,
  status: "active",
  recipient_name: "Sara",
  purchaser_name: "Mona",
  note: null,
  source_order_id: null,
  issued_by: null,
  issued_at: "2026-10-01T10:00:00Z",
  voided_by: null,
  voided_at: null,
  void_reason: null,
  ...overrides,
});

const wrap = (node: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

describe("a card's rules", () => {
  it("read a card as active, used up, expired or voided", () => {
    expect(rules.cardState(card(), "2026-10-31")).toBe("active");
    expect(rules.cardState(card({ balance: 0 }), "2026-10-31")).toBe("used");
    expect(rules.cardState(card({ expires_on: "2026-10-30" }), "2026-10-31")).toBe("expired");
    expect(rules.cardState(card({ status: "voided" }), "2026-10-31")).toBe("voided");
  });

  it("sum what the store holds on usable cards, apart from expired ones", () => {
    const held = rules.cardsHeld(
      [
        card(),
        card({ id: "c2", balance: 12.5 }),
        card({ id: "c3", expires_on: "2026-01-01", balance: 7 }),
      ] as never,
      "2026-10-31",
    );
    expect(held).toEqual({ held: 42.5, active: 2, expired: 7 });
  });

  it("find a card by its code typed any way, or by a name", () => {
    const list = [
      card(),
      card({ id: "c2", code: "ZZZZ-YYYY-XXXX", recipient_name: "Ali" }),
    ] as never;
    expect(rules.searchCards(list, "abcdefgh").map((c) => c.id)).toEqual(["c1"]);
    expect(rules.searchCards(list, "ali").map((c) => c.id)).toEqual(["c2"]);
  });

  it("ask how a card came to be, and read it back", () => {
    const form = { ...rules.emptyIssueForm(), amount: "10" };
    expect(rules.issueProblems(form, "2026-10-31")).toEqual(["origin"]);
    expect(rules.issueProblems({ ...form, origin: "given" }, "2026-10-31")).toEqual([]);
    expect(rules.paidWithOf("given")).toBeNull();
    expect(rules.paidWithOf("transfer")).toBe("transfer");
    expect(rules.cardOrigin({ paid_with: "card" })).toBe("card");
    expect(rules.cardOrigin({ paid_with: null })).toBe("given");
  });

  it("say what an order would take, and that a card-payment order must be paid in full", () => {
    expect(
      rules.orderGiftCardOffer({ total: 80, advance_paid: 30, payment_method: "cod" }),
    ).toEqual({
      owed: 50,
      mustCoverAll: false,
    });
    expect(
      rules.orderGiftCardOffer({ total: 80, advance_paid: 0, payment_method: "card" }),
    ).toEqual({
      owed: 80,
      mustCoverAll: true,
    });
    expect(
      rules.orderGiftCardOffer({ total: 80, advance_paid: 0, payment_method: "benefit" }),
    ).toEqual({ owed: 80, mustCoverAll: false });
    expect(rules.orderGiftCardOffer({ total: 80, advance_paid: 80 })).toBeNull();
    expect(rules.orderGiftCardOffer({ total: 80, status: "cancelled" })).toBeNull();
  });

  it("word the database's refusals, and write the card's message for a person to send", () => {
    expect(rules.giftCardError(new Error("GIFT_CARD_EXPIRED"), "en")).toBe(
      "This gift card has expired.",
    );
    expect(rules.giftCardError(new Error("boom"), "ar")).toBe("تعذّر إتمام العملية.");
    const message = rules.giftCardMessage(
      card() as never,
      {
        amount: "BHD 30.000",
        storeName: "Pura Line",
        storeLink: "https://pura.boutq.store/pura",
        expiry: null,
      },
      "ar",
    );
    expect(message).toContain("مرحبًا Sara،");
    expect(message).toContain("رمز البطاقة: ABCD-EFGH-JKMN");
    expect(message).not.toContain("صالحة حتى");
  });
});

describe("the gift cards page", () => {
  beforeEach(() => {
    data.cards = [
      card(),
      card({ id: "c2", code: "ZZZZ-YYYY-XXXX", balance: 0, recipient_name: null }),
    ];
    data.moves = [
      { id: "m1", kind: "issued", amount: 50, created_at: "2026-10-01T10:00:00Z", note: null },
    ];
  });

  it("shows what is held and every card, and opens one with its moves", async () => {
    wrap(<GiftCardsPage />);
    expect(await screen.findByText("ABCD-EFGH-JKMN")).toBeInTheDocument();
    expect(screen.getByText("Held on active cards")).toBeInTheDocument();
    expect(screen.getByText(/Used up/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("ABCD-EFGH-JKMN"));
    expect(await screen.findByText("Issued")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Void card" })).toBeDisabled();
  });

  it("issues a card and shows its code to send", async () => {
    data.issueGiftCard.mockResolvedValueOnce(
      card({ id: "new", code: "NEWC-ARDC-ODE2", balance: 25 }),
    );
    wrap(<GiftCardsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Issue a card" }));
    fireEvent.click(screen.getByRole("button", { name: "Issue card" }));
    expect(await screen.findByText("Write an amount above zero.")).toBeInTheDocument();
    // Sold or given is asked every time, never assumed.
    expect(
      screen.getByText("Choose how the card was paid for, or that the store gave it."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Amount \(/), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("radio", { name: "Cash" }));
    expect(screen.getByRole("radio", { name: "Cash" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: "Issue card" }));
    expect(await screen.findByText("NEWC-ARDC-ODE2")).toBeInTheDocument();
    expect(data.issueGiftCard).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ amount: 25, paidWith: "cash" }),
    );
    expect(
      screen.getByRole("link", { name: /Send the card on WhatsApp/ }).getAttribute("href"),
    ).toContain("wa.me");
  });
});

describe("paying an order with a card", () => {
  it("takes the card and the order shows what it paid", async () => {
    profile.allowed = true;
    data.redeemGiftCardOnOrder.mockResolvedValueOnce({ amount: 30, balance: 0, owed: 50 });
    const setOrder = vi.fn();
    const order = {
      id: "o1",
      brand_id: "b1",
      total: 80,
      advance_paid: 0,
      payment_method: "cod",
      gift_card_paid: 0,
    };
    wrap(<OrderGiftCardPayment order={order} setOrder={setOrder} currency="BHD" lang="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Pay with a gift card" }));
    fireEvent.change(screen.getByLabelText("Card code"), { target: { value: "abcd efgh jkmn" } });
    fireEvent.click(screen.getByRole("button", { name: "Pay with the card" }));
    await waitFor(() =>
      expect(data.redeemGiftCardOnOrder).toHaveBeenCalledWith("o1", "abcd efgh jkmn", null),
    );
    const patch = setOrder.mock.calls[0][0] as (o: typeof order) => typeof order;
    expect(patch(order)).toMatchObject({
      advance_paid: 30,
      gift_card_paid: 30,
      payment_status: "partially_paid",
    });
  });

  it("asks a card order's card to pay everything, and offers nothing to staff without order rights", () => {
    profile.allowed = true;
    const view = wrap(
      <OrderGiftCardPayment
        order={{ id: "o2", total: 40, advance_paid: 0, payment_method: "card" }}
        setOrder={vi.fn()}
        currency="BHD"
        lang="en"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pay with a gift card" }));
    expect(screen.getByText(/the gift card pays all that is owed/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Amount/)).toBeNull();
    view.unmount();
    profile.allowed = false;
    const none = wrap(
      <OrderGiftCardPayment
        order={{ id: "o3", total: 40, advance_paid: 0 }}
        setOrder={vi.fn()}
        currency="BHD"
        lang="en"
      />,
    );
    expect(none.container.innerHTML).toBe("");
  });
});

describe("selling cards on the store", () => {
  it("saves the store's offer: on, its amounts as typed and how long a card lasts", async () => {
    profile.allowed = true;
    data.settings = null;
    data.purchases = [];
    wrap(<GiftCardsPage />);
    fireEvent.click(await screen.findByRole("switch", { name: "Sell gift cards on the store" }));
    fireEvent.change(screen.getByLabelText(/Amounts offered/), { target: { value: "50, 25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(data.saveGiftCardSettings).toHaveBeenCalledWith("b1", {
        sellOnline: true,
        amounts: [25, 50],
        validMonths: 12,
      }),
    );
  });

  it("lists a transfer to check and approves it, which issues its card", async () => {
    data.settings = { sell_online: true, amounts: [25], valid_months: 12, updated_at: "x" };
    data.purchases = [
      {
        id: "pu1",
        brand_id: "b1",
        amount: 25,
        currency: "BHD",
        payment_method: "benefit",
        status: "pending",
        buyer_name: "Sara",
        buyer_phone: "+97339001122",
        recipient_name: "Noor",
        receipt_key: "brands/b1/benefit-receipts/x.jpg",
        created_at: "2026-10-31T10:00:00Z",
      },
    ];
    wrap(<GiftCardsPage />);
    expect(await screen.findByText(/Transfers to check/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve and issue the card" }));
    await waitFor(() => expect(data.approveGiftCardPurchase).toHaveBeenCalledWith("pu1"));
  });

  it("says how the buyer asked for the code, and sends a WhatsApp one in their language", async () => {
    data.settings = { sell_online: true, amounts: [25], valid_months: 12, updated_at: "x" };
    const paid = {
      brand_id: "b1",
      amount: 50,
      currency: "BHD",
      payment_method: "card",
      status: "paid",
      recipient_name: "Noor",
      message: "Eid Mubarak",
      receipt_key: null,
      created_at: "2026-10-31T10:00:00Z",
      paid_at: "2026-10-31T10:01:00Z",
      code_sent_at: null,
    };
    data.purchases = [
      {
        ...paid,
        id: "pu2",
        buyer_name: "Sara",
        buyer_phone: "+97339001122",
        buyer_email: null,
        delivery_channel: "whatsapp",
        lang: "ar",
        gift_cards: { code: "WXYZ-2345-6789", expires_on: null },
      },
      {
        ...paid,
        id: "pu3",
        buyer_name: "Mona",
        buyer_phone: null,
        buyer_email: "mona@mail.com",
        delivery_channel: "email",
        lang: "en",
        gift_cards: { code: "QRST-2345-6789", expires_on: null },
      },
    ];
    wrap(<GiftCardsPage />);
    expect(await screen.findByText(/Codes to send on WhatsApp/)).toBeInTheDocument();
    expect(screen.getByText("Code on WhatsApp to +97339001122")).toBeInTheDocument();
    expect(screen.getByText("Code by email to mona@mail.com")).toBeInTheDocument();
    expect(screen.getByText(/Code emailed automatically/)).toBeInTheDocument();
    // Only the WhatsApp buyer's code waits for a person; the emailed one has no button.
    const send = screen.getByRole("link", { name: /Send the code on WhatsApp/ });
    expect(screen.getAllByRole("link", { name: /Send the code/ })).toHaveLength(1);
    const href = send.getAttribute("href") ?? "";
    expect(href.startsWith("https://wa.me/97339001122?text=")).toBe(true);
    expect(decodeURIComponent(href)).toContain("WXYZ-2345-6789");
    expect(decodeURIComponent(href)).toContain("بطاقة هدية");
    fireEvent.click(send);
    await waitFor(() => expect(data.markGiftCardPurchaseSent).toHaveBeenCalledWith("pu2"));
  });

  it("shows the offer's settings only to staff who may change settings", async () => {
    profile.allowed = false;
    data.purchases = [];
    wrap(<GiftCardsPage />);
    await screen.findByText("Selling on the store");
    expect(screen.queryByRole("switch", { name: "Sell gift cards on the store" })).toBeNull();
    profile.allowed = true;
  });
});
