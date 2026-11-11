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
  saveGiftCardPrint: vi.fn(async () => null),
  setGiftCardPrintStep: vi.fn(async () => undefined),
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
  saveGiftCardPrint: data.saveGiftCardPrint,
  setGiftCardPrintStep: data.setGiftCardPrintStep,
  invalidateGiftCardOnline: vi.fn(async () => undefined),
}));
const purchaseFns = {
  getGiftCardPurchaseReceiptUrl: vi.fn(async () => ({ url: "https://r2.test/r" })),
  getGiftCardOrderRecord: vi.fn(async () => ({
    link: "https://pura.boutq.store/pura/gift-card/pu3?t=secret",
    paidEmail: { status: "processed", customer_done: true, last_error: null },
    hasMailbox: true,
  })),
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
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Link: ({ children, params }: { children: React.ReactNode; params: { id: string } }) => (
    <a href={`/orders/${params.id}`}>{children}</a>
  ),
}));

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
  share_token: "ab".repeat(32),
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

  it("word the database's refusals", () => {
    expect(rules.giftCardError(new Error("GIFT_CARD_EXPIRED"), "en")).toBe(
      "This gift card has expired.",
    );
    expect(rules.giftCardError(new Error("boom"), "ar")).toBe("تعذّر إتمام العملية.");
  });
});

// The page keeps its tab in the address, which a test's window keeps too.
beforeEach(() => window.history.replaceState(null, "", "/"));

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
    expect(await screen.findByText("Held on active cards")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Cards" }));
    expect(await screen.findByText("ABCD-EFGH-JKMN")).toBeInTheDocument();
    expect(screen.getAllByText(/Used up/).length).toBeGreaterThan(0);
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
      screen.getByRole("link", { name: /Send the gift link on WhatsApp/ }).getAttribute("href"),
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

describe("a gift card order", () => {
  const paid = {
    id: "9f1c2d3e-0000-4000-8000-000000000001",
    brand_id: "b1",
    amount: 50,
    currency: "BHD",
    payment_method: "card",
    status: "paid",
    buyer_name: "Mona",
    buyer_phone: "+97339001122",
    buyer_email: "mona@mail.com",
    recipient_name: "Noor",
    message: "Eid Mubarak",
    receipt_key: null,
    gateway_reference: "chg_123",
    gift_card_id: "c1",
    delivery_channel: "email",
    lang: "en",
    buyer_user_id: null,
    created_at: "2026-10-31T10:00:00Z",
    paid_at: "2026-10-31T10:01:00Z",
    code_sent_at: null,
    gift_cards: { code: "ABCD-EFGH-JKMN", expires_on: null, balance: 30, status: "active" },
  };

  it("has a reference, and its sheet says everything, with the buyer's link", async () => {
    data.cards = [card()];
    data.purchases = [paid];
    wrap(<GiftCardsPage />);
    expect(await screen.findByText(/GC-9F1C2D/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Mona"));
    expect(await screen.findByText("Buyer's page")).toBeInTheDocument();
    expect(screen.getByText("chg_123")).toBeInTheDocument();
    expect(screen.getByText("“Eid Mubarak”")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "mona@mail.com" })).toHaveAttribute(
      "href",
      "mailto:mona@mail.com",
    );
    // The email's state and the link come from the server, not from a guess.
    expect(await screen.findByText("Code emailed")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Open the page" })).toHaveAttribute(
      "href",
      "https://pura.boutq.store/pura/gift-card/pu3?t=secret",
    );
    expect(screen.getByText("Paid and issued")).toBeInTheDocument();
  });

  it("leads to its card, and the card leads back", async () => {
    data.cards = [card()];
    data.purchases = [paid];
    data.moves = [
      {
        id: "m1",
        kind: "redeemed",
        amount: -20,
        order_id: "o9",
        created_at: "2026-10-31T11:00:00Z",
        note: null,
      },
    ];
    wrap(<GiftCardsPage />);
    fireEvent.click(await screen.findByText("Mona"));
    fireEvent.click(await screen.findByRole("button", { name: "Open the card" }));
    expect(await screen.findByRole("link", { name: "View order" })).toHaveAttribute(
      "href",
      "/orders/o9",
    );
    fireEvent.click(screen.getByRole("button", { name: "View the order" }));
    expect(await screen.findByText("Buyer's page")).toBeInTheDocument();
  });

  it("opens the Orders tab on what waits, and keeps the other groups a tap away", async () => {
    data.cards = [];
    data.purchases = [
      { ...paid, id: "a", buyer_name: "Done Buyer" },
      {
        ...paid,
        id: "b",
        buyer_name: "Waiting Buyer",
        status: "pending",
        payment_method: "benefit",
        gift_cards: null,
      },
    ];
    wrap(<GiftCardsPage />);
    expect(await screen.findByText("Waiting Buyer")).toBeInTheDocument();
    expect(screen.queryByText("Done Buyer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Completed/ }));
    expect(await screen.findByText("Done Buyer")).toBeInTheDocument();
    expect(screen.queryByText("Waiting Buyer")).toBeNull();
  });
});

describe("selling cards on the store", () => {
  it("saves the store's offer: on, its amounts as typed and how long a card lasts", async () => {
    profile.allowed = true;
    data.settings = null;
    data.purchases = [];
    wrap(<GiftCardsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
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
    // It opens on what waits, and the row says what to do.
    fireEvent.click(await screen.findByText("Sara"));
    fireEvent.click(await screen.findByRole("button", { name: "Approve and issue the card" }));
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
        gift_cards: { code: "WXYZ-2345-6789", expires_on: null, share_token: "ef".repeat(32) },
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
    // Only the WhatsApp buyer's code waits for a person; the email one is done.
    fireEvent.click(await screen.findByText("Sara"));
    const send = await screen.findByRole("link", { name: /Send the code on WhatsApp/ });
    const href = send.getAttribute("href") ?? "";
    expect(href.startsWith("https://wa.me/97339001122?text=")).toBe(true);
    // The buyer is sent the card's gift link to pass on, never its code.
    expect(decodeURIComponent(href)).toContain(
      `https://pura.boutq.store/pura/gift/${"ef".repeat(32)}`,
    );
    expect(decodeURIComponent(href)).not.toContain("WXYZ-2345-6789");
    expect(decodeURIComponent(href)).toContain("بطاقة الهدية من بيورا لاين جاهزة");
    fireEvent.click(send);
    await waitFor(() => expect(data.markGiftCardPurchaseSent).toHaveBeenCalledWith("pu2"));
  });

  it("saves whether the store prints cards, and its fee for printing and delivering one", async () => {
    profile.allowed = true;
    data.settings = {
      sell_online: true,
      amounts: [25],
      valid_months: 12,
      print_enabled: false,
      print_fee: 0,
      updated_at: "x",
    };
    data.purchases = [];
    wrap(<GiftCardsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("switch", { name: "We print and deliver cards" }));
    fireEvent.change(screen.getByLabelText(/Printing and delivery fee/), {
      target: { value: "٢٫٥" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save printing" }));
    await waitFor(() =>
      expect(data.saveGiftCardPrint).toHaveBeenCalledWith("b1", { enabled: true, fee: 2.5 }),
    );
  });

  it("asks staff to print a paid card the store prints, then to deliver it", async () => {
    data.settings = { sell_online: true, amounts: [25], valid_months: 12, updated_at: "x" };
    const order = {
      id: "pu5",
      brand_id: "b1",
      amount: 25,
      currency: "BHD",
      payment_method: "benefit",
      status: "paid",
      buyer_name: "Hessa",
      buyer_phone: null,
      buyer_email: "hessa@mail.com",
      delivery_channel: "email",
      lang: "ar",
      recipient_name: "Noor",
      message: null,
      receipt_key: null,
      created_at: "2026-11-08T10:00:00Z",
      paid_at: "2026-11-08T10:05:00Z",
      code_sent_at: null,
      design: { occasion: "birthday", design: "type:cream", print: true },
      print_by_store: true,
      print_fee: 2.5,
      print_address: "Adliya, block 338, road 3803, house 12",
      print_phone: "+97339001122",
      printed_at: null,
      print_delivered_at: null,
      gift_cards: { code: "PRNT-2345-6789", expires_on: null },
    };
    data.purchases = [order];
    wrap(<GiftCardsPage />);
    fireEvent.click(await screen.findByText("Hessa"));
    expect(await screen.findAllByText("Print the card")).not.toHaveLength(0);
    expect(screen.getByText("Adliya, block 338, road 3803, house 12")).toBeInTheDocument();
    // The buyer paid the card's value and the fee; the card holds the value.
    expect(screen.getByText("BHD 27.500")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Printed" }));
    await waitFor(() => expect(data.setGiftCardPrintStep).toHaveBeenCalledWith("pu5", "printed"));
  });

  it("shows the offer's settings only to staff who may change settings", async () => {
    profile.allowed = false;
    data.purchases = [];
    wrap(<GiftCardsPage />);
    await screen.findByRole("tab", { name: "Orders" });
    expect(screen.queryByRole("tab", { name: "Settings" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Sell gift cards on the store" })).toBeNull();
    profile.allowed = true;
  });
});
