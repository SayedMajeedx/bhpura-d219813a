import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";

// The shopper's side of buying a card (step four): the server writes the purchase through the
// database's own function, a few times an hour per address, and shows a purchase's code only
// to the token its buyer was given, and only once it is paid.

const state = vi.hoisted(() => ({ admin: null as unknown, ip: "10.1.0.1" }));
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

const fns = (await import("../src/lib/gift-card-purchase.functions")) as unknown as {
  startGiftCardPurchase: ServerFn;
  getGiftCardPurchase: ServerFn;
};

const PURCHASE = "00000000-0000-4000-8000-0000000000c1";
const TOKEN = "t".repeat(64);
let ip = 0;

function server(
  rows: Record<string, unknown> = {},
  reply: unknown = null,
  error: string | null = null,
) {
  const fake = fakeSupabase({ rows: rows as never });
  const rpc = vi.fn(async () => ({ data: reply, error: error ? { message: error } : null }));
  state.admin = { ...fake.supabase, rpc };
  return { fake, rpc };
}

const start = {
  slug: "pura",
  amount: 50,
  method: "card",
  buyer: { name: "Sara", phone: "39001122", recipient: "Noor" },
};

beforeEach(() => {
  state.ip = `10.1.0.${++ip}`;
});

describe("starting a purchase", () => {
  it("writes it through the database's function and answers its token", async () => {
    const { rpc } = server({}, { id: PURCHASE, token: TOKEN, brand_id: "b1" });
    expect(await fns.startGiftCardPurchase({ data: start })).toEqual({
      ok: true,
      id: PURCHASE,
      token: TOKEN,
      brandId: "b1",
    });
    expect(rpc).toHaveBeenCalledWith("create_gift_card_purchase", {
      p_slug: "pura",
      p_amount: 50,
      p_method: "card",
      p_buyer: start.buyer,
      p_receipt_id: null,
    });
  });

  it("passes the database's refusal on, and stops an address after ten tries an hour", async () => {
    server({}, null, "GIFT_CARD_AMOUNT_NOT_OFFERED");
    expect(await fns.startGiftCardPurchase({ data: start })).toEqual({
      ok: false,
      reason: "GIFT_CARD_AMOUNT_NOT_OFFERED",
    });
    for (let i = 0; i < 9; i += 1) await fns.startGiftCardPurchase({ data: start });
    expect(await fns.startGiftCardPurchase({ data: start })).toEqual({
      ok: false,
      reason: "GIFT_CARD_TRIES",
    });
  });
});

describe("a purchase's page", () => {
  const row = (status: string) => ({
    status,
    payment_method: "card",
    amount: 50,
    currency: "BHD",
    recipient_name: "Noor",
    message: null,
    brand_id: "b1",
    gift_cards: status === "paid" ? { code: "ABCD-EFGH-JKMN", expires_on: "2027-10-31" } : null,
  });

  it("is read by its id and its token", async () => {
    const { fake } = server({ gift_card_purchases: row("paid") });
    const view = (await fns.getGiftCardPurchase({
      data: { purchaseId: PURCHASE, token: TOKEN },
    })) as {
      code: string;
    };
    expect(view.code).toBe("ABCD-EFGH-JKMN");
    expect(fake.queries[0].filters).toEqual(
      expect.arrayContaining([
        ["id", PURCHASE],
        ["token", TOKEN],
      ]),
    );
  });

  it("shows no code until it is paid, and nothing for a wrong token", async () => {
    server({ gift_card_purchases: row("pending") });
    expect(
      await fns.getGiftCardPurchase({ data: { purchaseId: PURCHASE, token: TOKEN } }),
    ).toMatchObject({
      status: "pending",
      code: null,
    });
    server({ gift_card_purchases: null });
    expect(
      await fns.getGiftCardPurchase({ data: { purchaseId: PURCHASE, token: TOKEN } }),
    ).toBeNull();
  });
});
