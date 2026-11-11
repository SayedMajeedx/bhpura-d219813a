import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";

// A gift card's own page for the person it is given to: anyone holding the link may ask, so the
// page's read never carries the code or anything of the buyer's, the code is given on its own
// request only while the card can be used, and only the buyer's own token makes a new link.

const state = vi.hoisted(() => ({ admin: null as unknown, ip: "10.2.0.1" }));
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

const fns = (await import("../src/lib/gift-link.functions")) as unknown as {
  getGift: ServerFn;
  openGiftCode: ServerFn;
  resetGiftLink: ServerFn;
};

const TOKEN = "ab".repeat(32);
const link = { slug: "pura", token: TOKEN };
let ip = 0;

const card = (overrides: Record<string, unknown> = {}) => ({
  id: "c1",
  brand_id: "b1",
  code: "ABCD-EFGH-JKMN",
  currency: "BHD",
  initial_amount: 50,
  balance: 50,
  expires_on: null,
  status: "active",
  recipient_name: "Noor",
  purchaser_name: "Sara",
  gift_card_purchases: [
    {
      recipient_name: "Noor",
      message: "Eid Mubarak",
      design: { occasion: "eid", design: "type:cream", from: "Sara" },
      lang: "ar",
    },
  ],
  ...overrides,
});

function server(rows: Record<string, unknown>) {
  const fake = fakeSupabase({ rows: rows as never });
  state.admin = fake.supabase;
  return fake;
}

beforeEach(() => {
  state.ip = `10.2.0.${++ip}`;
});

describe("the gift page's read", () => {
  it("gives the card's words and design, and never its code or the buyer", async () => {
    const fake = server({ brands: { id: "b1" }, gift_cards: card() });
    const view = (await fns.getGift({ data: link, context: {} })) as Record<string, unknown>;
    expect(view).toEqual({
      brandId: "b1",
      state: "ready",
      amount: 50,
      balance: 50,
      currency: "BHD",
      to: "Noor",
      message: "Eid Mubarak",
      from: "Sara",
      expiresOn: null,
      design: { occasion: "eid", design: "type:cream", from: "Sara" },
      lang: "ar",
    });
    expect(JSON.stringify(view)).not.toContain("ABCD");
    expect(fake.queries.find((q) => q.table === "gift_cards")?.filters).toEqual([
      ["share_token", TOKEN],
    ]);
  });

  it("names the giver of a card bought online only when they wrote it on the card", async () => {
    server({
      brands: { id: "b1" },
      gift_cards: card({
        gift_card_purchases: [{ recipient_name: null, message: null, design: {}, lang: "en" }],
      }),
    });
    expect(await fns.getGift({ data: link, context: {} })).toMatchObject({
      from: null,
      to: "Noor",
    });
    // A card issued in the store carries the names staff wrote.
    server({ brands: { id: "b1" }, gift_cards: card({ gift_card_purchases: [] }) });
    expect(await fns.getGift({ data: link, context: {} })).toMatchObject({
      from: "Sara",
      design: null,
      lang: null,
    });
  });

  it("is nothing on another store's address, for no card, or for a token of the wrong shape", async () => {
    server({ brands: { id: "b2" }, gift_cards: card() });
    expect(await fns.getGift({ data: link, context: {} })).toBeNull();
    server({ brands: { id: "b1" }, gift_cards: null });
    expect(await fns.getGift({ data: link, context: {} })).toBeNull();
    await expect(
      fns.getGift({ data: { slug: "pura", token: "short" }, context: {} }),
    ).rejects.toThrow();
  });
});

describe("the code", () => {
  it("is given on its own request while the card can be used", async () => {
    server({ brands: { id: "b1" }, gift_cards: card() });
    expect(await fns.openGiftCode({ data: link, context: {} })).toEqual({
      ok: true,
      code: "ABCD-EFGH-JKMN",
    });
  });

  it("is kept back for a voided, expired or spent card", async () => {
    for (const closed of [{ status: "voided" }, { expires_on: "2020-01-01" }, { balance: 0 }]) {
      server({ brands: { id: "b1" }, gift_cards: card(closed) });
      expect(await fns.openGiftCode({ data: link, context: {} })).toEqual({
        ok: false,
        reason: "closed",
      });
    }
  });

  it("stops an address that asks too often", async () => {
    server({ brands: { id: "b1" }, gift_cards: card() });
    for (let i = 0; i < 30; i += 1) await fns.openGiftCode({ data: link, context: {} });
    expect(await fns.openGiftCode({ data: link, context: {} })).toEqual({
      ok: false,
      reason: "tries",
    });
  });
});

describe("a new link", () => {
  const ask = { purchaseId: "00000000-0000-4000-8000-0000000000c1", token: "t".repeat(64) };

  it("is made for the buyer holding the purchase's token, on its card alone", async () => {
    const fake = server({ gift_card_purchases: { status: "paid", gift_card_id: "c1" } });
    const reply = (await fns.resetGiftLink({ data: ask, context: {} })) as { giftToken: string };
    expect(reply.giftToken).toMatch(/^[a-f0-9]{64}$/);
    expect(fake.queries[0].filters).toEqual(
      expect.arrayContaining([
        ["id", ask.purchaseId],
        ["token", ask.token],
      ]),
    );
    expect(fake.writes).toEqual([
      { table: "gift_cards", values: { share_token: reply.giftToken }, filters: [["id", "c1"]] },
    ]);
  });

  it("is refused for a wrong token or a purchase with no card yet", async () => {
    const none = server({ gift_card_purchases: null });
    expect(await fns.resetGiftLink({ data: ask, context: {} })).toBeNull();
    expect(none.writes).toEqual([]);
    const pending = server({ gift_card_purchases: { status: "pending", gift_card_id: null } });
    expect(await fns.resetGiftLink({ data: ask, context: {} })).toBeNull();
    expect(pending.writes).toEqual([]);
  });
});
