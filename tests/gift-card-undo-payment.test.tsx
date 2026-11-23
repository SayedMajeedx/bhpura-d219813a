import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Undoing a gift card's payment on an order (the owner's report of 2026-11-23: a wrong card taken
// in the admin could not be given back). The rules that say what a card still holds on an order,
// and the order page's and the card's own Undo (the database's step, `undo_gift_card_payment`, is
// run in a real Postgres by tests/gift-cards-checkout-migration.test.ts).

const data = vi.hoisted(() => ({
  orderMoves: [] as unknown[],
  cardMoves: [] as unknown[],
  undoGiftCardPayment: vi.fn(),
}));
const giftCardsModule = vi.hoisted(() => ({
  giftCardQueries: {
    order: (_b: string, id: string) => ({
      queryKey: ["gift-cards", "order", id],
      queryFn: async () => data.orderMoves,
    }),
    moves: (_b: string, id: string) => ({
      queryKey: ["gift-cards", "moves", id],
      queryFn: async () => data.cardMoves,
    }),
  },
  invalidateGiftCards: vi.fn(async () => undefined),
  undoGiftCardPayment: data.undoGiftCardPayment,
  redeemGiftCardOnOrder: vi.fn(),
  voidGiftCard: vi.fn(),
  resetGiftCardShareLink: vi.fn(),
}));
vi.mock("../src/lib/data/gift-cards", () => giftCardsModule);
vi.mock("@/lib/data/gift-cards", () => giftCardsModule);
const orders = vi.hoisted(() => ({ invalidateOrders: vi.fn(async () => undefined) }));
vi.mock("../src/lib/data/orders/mutations", () => orders);
vi.mock("@/lib/data/orders/mutations", () => orders);
const confirm = vi.hoisted(() => ({ confirmDialog: vi.fn(async () => true) }));
vi.mock("../src/components/ui/confirm-dialog", () => confirm);
vi.mock("@/components/ui/confirm-dialog", () => confirm);
const profile = vi.hoisted(() => ({ allowed: true }));
const profileModule = vi.hoisted(() => ({
  useProfileOptional: () => ({ hasPermission: () => profile.allowed }),
  useProfile: () => ({ hasPermission: () => profile.allowed }),
}));
vi.mock("../src/lib/profile-context", () => profileModule);
vi.mock("@/lib/profile-context", () => profileModule);
const toasts = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("sonner", () => toasts);
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/order">{children}</a>,
}));
// The card's share links are another feature's; this test is about its moves.
vi.mock("../src/features/gift-cards/components/GiftCardShare", () => ({
  GiftCardShare: () => null,
}));

const rules = await import("../src/features/gift-cards/lib/card-payments");
const { OrderGiftCardPayment } =
  await import("../src/features/gift-cards/components/OrderGiftCardPayment");
const { GiftCardDetailsSheet } =
  await import("../src/features/gift-cards/components/GiftCardDetailsSheet");

const wrap = (node: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

const move = (gift_card_id: string, kind: string, amount: number, extra = {}) => ({
  gift_card_id,
  kind,
  amount,
  code: `CARD-${gift_card_id.toUpperCase()}-WXYZ`,
  status: "active",
  ...extra,
});

beforeEach(() => {
  profile.allowed = true;
  data.undoGiftCardPayment.mockReset();
  confirm.confirmDialog.mockClear();
  toasts.toast.success.mockClear();
});

describe("what a card still holds on an order", () => {
  it("is what it paid less what was given back, a card at a time", () => {
    expect(
      rules.cardsOnOrder([
        move("a", "redeemed", -20),
        move("b", "redeemed", -30),
        move("a", "returned", 20),
        move("b", "redeemed", -5),
      ]),
    ).toEqual([{ cardId: "b", code: "CARD-B-WXYZ", voided: false, held: 35 }]);
  });

  it("offers a card's undo on its latest payment on each order it still holds money on", () => {
    const moves = [
      { id: "m1", kind: "issued", amount: 50, order_id: null },
      { id: "m2", kind: "redeemed", amount: -10, order_id: "o1" },
      { id: "m3", kind: "redeemed", amount: -15, order_id: "o1" },
      { id: "m4", kind: "redeemed", amount: -5, order_id: "o2" },
      { id: "m5", kind: "returned", amount: 5, order_id: "o2" },
    ];
    expect([...rules.undoableOrders(moves)]).toEqual([["o1", { moveId: "m3", held: 25 }]]);
  });

  it("says what the order owes after, keeping its other payments", () => {
    expect(rules.owedAfterUndo({ total: 80, advance_paid: 60 }, 20)).toBe(40);
    expect(rules.owedAfterUndo({ total: 37, advance_paid: 37 }, 37)).toBe(37);
    expect(rules.cardTail("ABCD-EFGH-JKMN")).toBe("…JKMN");
  });
});

describe("the order page", () => {
  const order = {
    id: "o1",
    brand_id: "b1",
    status: "confirmed",
    total: 37,
    advance_paid: 37,
    gift_card_paid: 37,
    payment_method: "cod",
  };

  it("lists the card that paid and undoes its payment after asking", async () => {
    data.orderMoves = [move("a", "redeemed", -37)];
    data.undoGiftCardPayment.mockResolvedValueOnce({ amount: 37, balance: 50, owed: 37 });
    wrap(<OrderGiftCardPayment order={order} currency="BHD" lang="en" />);
    expect(await screen.findByText("CARD-A-WXYZ")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo the payment by card …WXYZ" }));
    await waitFor(() => expect(data.undoGiftCardPayment).toHaveBeenCalledWith("o1", "a"));
    expect(confirm.confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ destructive: true, title: "Undo this card's payment?" }),
    );
    await waitFor(() =>
      expect(orders.invalidateOrders).toHaveBeenCalledWith(expect.anything(), "b1"),
    );
    expect(toasts.toast.success).toHaveBeenCalledWith(expect.stringContaining("…WXYZ"));
  });

  it("does nothing when the question is answered no", async () => {
    data.orderMoves = [move("a", "redeemed", -37)];
    confirm.confirmDialog.mockResolvedValueOnce(false);
    wrap(<OrderGiftCardPayment order={order} currency="BHD" lang="en" />);
    fireEvent.click(await screen.findByRole("button", { name: /Undo the payment/ }));
    await waitFor(() => expect(confirm.confirmDialog).toHaveBeenCalled());
    expect(data.undoGiftCardPayment).not.toHaveBeenCalled();
  });

  it("offers no undo for a voided card, to staff without order rights, or while unsaved", async () => {
    data.orderMoves = [move("a", "redeemed", -37, { status: "voided" })];
    const voided = wrap(<OrderGiftCardPayment order={order} currency="BHD" lang="en" />);
    expect(await screen.findByText("CARD-A-WXYZ")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Undo/ })).toBeNull();
    voided.unmount();

    data.orderMoves = [move("a", "redeemed", -37)];
    const unsaved = wrap(<OrderGiftCardPayment order={order} unsaved currency="BHD" lang="en" />);
    expect(await screen.findByText("CARD-A-WXYZ")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Undo/ })).toBeNull();
    unsaved.unmount();

    profile.allowed = false;
    wrap(<OrderGiftCardPayment order={order} currency="BHD" lang="en" />);
    expect(await screen.findByText("CARD-A-WXYZ")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Undo/ })).toBeNull();
  });
});

describe("the card's own page", () => {
  const card = {
    id: "c1",
    brand_id: "b1",
    code: "ABCD-EFGH-JKMN",
    currency: "BHD",
    initial_amount: 50,
    balance: 13,
    expires_on: null,
    status: "active",
    recipient_name: null,
    purchaser_name: null,
    note: null,
    source_order_id: null,
    issued_by: null,
    issued_at: "2026-11-01T10:00:00Z",
    voided_by: null,
    voided_at: null,
    void_reason: null,
    paid_with: "cash",
    share_token: "ab".repeat(32),
  };

  it("undoes the payment on the order it still holds money on, and words the database's note", async () => {
    data.cardMoves = [
      {
        id: "m1",
        kind: "issued",
        amount: 50,
        order_id: null,
        created_at: "2026-11-01T10:00:00Z",
        note: null,
      },
      {
        id: "m2",
        kind: "redeemed",
        amount: -37,
        order_id: "o1",
        created_at: "2026-11-23T10:00:00Z",
        note: null,
      },
      {
        id: "m3",
        kind: "redeemed",
        amount: -5,
        order_id: "o2",
        created_at: "2026-11-23T11:00:00Z",
        note: null,
      },
      {
        id: "m4",
        kind: "returned",
        amount: 5,
        order_id: "o2",
        created_at: "2026-11-23T12:00:00Z",
        note: "Payment undone",
      },
    ];
    data.undoGiftCardPayment.mockResolvedValueOnce({ amount: 37, balance: 50, owed: 37 });
    wrap(
      <GiftCardDetailsSheet
        card={card as never}
        brandId="b1"
        slug="pura"
        lang="ar"
        onClose={() => undefined}
      />,
    );
    expect(await screen.findByText("أُلغي الدفع بها")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: "إلغاء الدفع على هذا الطلب" });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(data.undoGiftCardPayment).toHaveBeenCalledWith("o1", "c1"));
  });
});
