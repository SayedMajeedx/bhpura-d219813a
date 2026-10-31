import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";
import {
  advanceAfterGiftCard,
  giftCardPay,
  typedGiftCode,
} from "../src/features/checkout/lib/gift-card-pay";
import type { AdvanceSplit } from "../src/lib/payments/advance-payment";

// A gift card at checkout: the server looks a code up for a store and takes the card on the order
// the shopper has just placed, proven by its confirmation token; the checkout previews what it pays.

const state = vi.hoisted(() => ({ admin: null as unknown, ip: "10.0.0.1" }));
vi.mock("@tanstack/react-start", async () =>
  (await import("./helpers/server-fn")).serverFnModule(),
);
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: new Headers({ "cf-connecting-ip": state.ip }) }),
}));
const adminClient = {
  get supabaseAdmin() {
    return state.admin;
  },
};
vi.mock("../src/integrations/supabase/client.server", () => adminClient);
vi.mock("@/integrations/supabase/client.server", () => adminClient);

const fns = (await import("../src/lib/gift-card-checkout.functions")) as unknown as {
  checkGiftCard: ServerFn;
  redeemGiftCardAtCheckout: ServerFn;
  storeTakesGiftCards: ServerFn;
};

const ORDER = "00000000-0000-4000-8000-0000000000d1";
const BRAND = "00000000-0000-4000-8000-0000000000b1";
let ipCount = 0;

function server(
  rpcReply: unknown,
  rows: Record<string, unknown> = {},
  rpcError: string | null = null,
) {
  const rpc = vi.fn(async () => ({
    data: rpcReply,
    error: rpcError ? { message: rpcError } : null,
  }));
  const fake = fakeSupabase({ rows: rows as never });
  state.admin = { ...fake.supabase, rpc };
  return { rpc, fake };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.ip = `10.0.0.${++ipCount}`;
});

describe("looking a card up", () => {
  it("says what a usable card holds, and nothing more", async () => {
    const { rpc } = server({ balance: 25, currency: "BHD", expires_on: null });
    expect(await fns.checkGiftCard({ data: { slug: "pura", code: "ABCD-EFGH-JKMN" } })).toEqual({
      found: true,
      balance: 25,
      currency: "BHD",
      expiresOn: null,
    });
    expect(rpc).toHaveBeenCalledWith("gift_card_balance_for_checkout", {
      p_slug: "pura",
      p_code: "ABCD-EFGH-JKMN",
    });
    server(null);
    expect(await fns.checkGiftCard({ data: { slug: "pura", code: "ABCD-EFGH-JKMN" } })).toEqual({
      found: false,
      limited: false,
    });
  });

  it("stops one address after ten tries an hour", async () => {
    server(null);
    for (let i = 0; i < 10; i += 1) {
      await fns.checkGiftCard({ data: { slug: "pura", code: `ABCD-EFGH-${1000 + i}` } });
    }
    expect(await fns.checkGiftCard({ data: { slug: "pura", code: "ABCD-EFGH-JKMN" } })).toEqual({
      found: false,
      limited: true,
    });
  });
});

describe("taking a card on the order just placed", () => {
  const data = {
    orderId: ORDER,
    brandId: BRAND,
    confirmationToken: "token-123456",
    code: "ABCD-EFGH-JKMN",
  };

  it("needs the order's own confirmation token", async () => {
    const { rpc, fake } = server({ amount: 10, owed: 30 }, { orders: null });
    expect(await fns.redeemGiftCardAtCheckout({ data })).toEqual({
      applied: false,
      reason: "ORDER_NOT_FOUND",
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(fake.queries[0].filters).toEqual(
      expect.arrayContaining([
        ["id", ORDER],
        ["brand_id", BRAND],
        ["confirmation_email_token", "token-123456"],
      ]),
    );
  });

  it("asks the database to take it, with only the order and the code", async () => {
    const { rpc } = server({ amount: 10, balance: 0, owed: 30 }, { orders: { id: ORDER } });
    expect(await fns.redeemGiftCardAtCheckout({ data })).toEqual({
      applied: true,
      amount: 10,
      owed: 30,
    });
    expect(rpc).toHaveBeenCalledWith("redeem_gift_card_at_checkout", {
      p_order_id: ORDER,
      p_code: "ABCD-EFGH-JKMN",
    });
  });

  it("passes the database's refusal on", async () => {
    server(null, { orders: { id: ORDER } }, "GIFT_CARD_EXPIRED");
    expect(await fns.redeemGiftCardAtCheckout({ data })).toEqual({
      applied: false,
      reason: "GIFT_CARD_EXPIRED",
    });
  });
});

describe("whether the checkout offers the field", () => {
  it("only for a store holding a card someone could use", async () => {
    server(null, { gift_cards: [{ id: "c1" }] });
    expect(await fns.storeTakesGiftCards({ data: { brandId: BRAND } })).toBe(true);
    server(null, { gift_cards: [] });
    expect(await fns.storeTakesGiftCards({ data: { brandId: BRAND } })).toBe(false);
  });
});

describe("what a card pays at checkout", () => {
  const none: AdvanceSplit = { applies: false, percent: null, of: "order", dueNow: 80, balance: 0 };
  const half: AdvanceSplit = { applies: true, percent: 50, of: "order", dueNow: 40, balance: 40 };
  const card = (balance: number) => ({ code: "ABCD-EFGH-JKMN", balance, currency: "BHD" });

  it("pays toward what is asked now first, and never more than the total", () => {
    expect(giftCardPay(card(30), 80, none, "card")).toEqual({
      used: 30,
      left: 50,
      payNow: 50,
      coversNow: false,
    });
    expect(giftCardPay(card(100), 80, none, "benefit")).toEqual({
      used: 80,
      left: 0,
      payNow: 0,
      coversNow: true,
    });
    expect(giftCardPay(card(45), 80, half, "card")).toEqual({
      used: 45,
      left: 35,
      payNow: 0,
      coversNow: true,
    });
    // Cash is paid at the door: nothing is asked now, and the card is never "covering" a transfer.
    expect(giftCardPay(card(30), 80, none, "cod")).toMatchObject({ payNow: 0, coversNow: false });
    expect(giftCardPay(null, 80, none, "card")).toBeNull();
  });

  it("tells the advance notice what is still asked now", () => {
    const pay = giftCardPay(card(30), 80, half, "card");
    expect(advanceAfterGiftCard(half, pay)).toMatchObject({
      applies: true,
      dueNow: 10,
      balance: 40,
    });
    expect(advanceAfterGiftCard(half, giftCardPay(card(45), 80, half, "card"))).toMatchObject({
      applies: false,
    });
    expect(advanceAfterGiftCard(none, pay)).toBe(none);
  });

  it("reads a code as the shopper types it", () => {
    expect(typedGiftCode("abcd efgh-jkmn")).toBe("ABCDEFGH-JKMN");
  });
});
