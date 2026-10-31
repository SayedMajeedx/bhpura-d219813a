import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./helpers/server-fn";
import { judgeGiftCardCharge, tapCustomer } from "../src/lib/payments/gift-card-charge";

// A gift card bought online and paid by card (step four): the charge route starts a Tap charge
// for the purchase's own amount, and the redirect and the webhook check the charge with Tap
// before the card is issued, once, whichever comes first.

const state = vi.hoisted(() => ({ admin: null as unknown }));
const adminClient = {
  get supabaseAdmin() {
    return state.admin;
  },
};
vi.mock("../src/integrations/supabase/client.server", () => adminClient);
vi.mock("@/integrations/supabase/client.server", () => adminClient);

const { Route: ChargeRoute } = await import("../src/routes/api.public.gift-cards.charge");
const { Route: RedirectRoute } = await import("../src/routes/api.public.gift-cards.tap-redirect");
const { Route: WebhookRoute } = await import("../src/routes/api.public.webhooks.tap");

type Handler = (context: { request: Request }) => Promise<Response>;
const handler = (route: unknown, method: "GET" | "POST"): Handler =>
  (route as { options: { server: { handlers: Record<string, Handler> } } }).options.server.handlers[
    method
  ];

const PURCHASE = "00000000-0000-4000-8000-0000000000c1";
const BRAND = "00000000-0000-4000-8000-0000000000b1";
const TOKEN = "t".repeat(64);

const purchaseRow = (over: Record<string, unknown> = {}) => ({
  id: PURCHASE,
  brand_id: BRAND,
  amount: 50,
  currency: "BHD",
  status: "pending",
  payment_method: "card",
  gateway_reference: "chg_1",
  token: TOKEN,
  buyer_name: "Sara Ali",
  buyer_phone: "+97339001122",
  buyer_email: null,
  ...over,
});

function server(purchase: Record<string, unknown> | null, rpc: Record<string, unknown> = {}) {
  const fake = fakeSupabase({
    rows: { gift_card_purchases: purchase, brands: { slug: "pura" } } as never,
  });
  const calls: Array<[string, unknown]> = [];
  const rpcFn = vi.fn(async (name: string, args: unknown) => {
    calls.push([name, args]);
    if (name === "get_integration_credential_secret") {
      return { data: [{ api_key: "sk_test" }], error: null };
    }
    return { data: rpc[name] ?? null, error: null };
  });
  state.admin = { ...fake.supabase, rpc: rpcFn };
  return { fake, calls };
}

const tapAnswers = (charge: Record<string, unknown>) =>
  vi.fn(async () => new Response(JSON.stringify(charge), { status: 200 }));

const captured = {
  status: "CAPTURED",
  amount: 50,
  currency: "BHD",
  metadata: { gift_card_purchase_id: PURCHASE, brand_id: BRAND },
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("judging a charge", () => {
  const purchase = { id: PURCHASE, brandId: BRAND, amount: 50, currency: "BHD" };
  it("issues the card only for a captured charge of this purchase, its amount and currency", () => {
    expect(judgeGiftCardCharge(captured, purchase)).toBe("paid");
    expect(judgeGiftCardCharge({ ...captured, amount: 5 }, purchase)).toBe("mismatch");
    expect(judgeGiftCardCharge({ ...captured, currency: "SAR" }, purchase)).toBe("mismatch");
    expect(
      judgeGiftCardCharge(
        { ...captured, metadata: { gift_card_purchase_id: "x", brand_id: BRAND } },
        purchase,
      ),
    ).toBe("mismatch");
    expect(judgeGiftCardCharge({ ...captured, status: "DECLINED" }, purchase)).toBe("failed");
    expect(judgeGiftCardCharge({ ...captured, status: "INITIATED" }, purchase)).toBe("pending");
  });

  it("gives Tap the buyer's name and phone, the country taken from the number", () => {
    expect(
      tapCustomer({ name: "Sara Ali", phone: "+966 50 123 4567", id: PURCHASE }),
    ).toMatchObject({
      first_name: "Sara",
      last_name: "Ali",
      phone: { country_code: "966", number: "501234567" },
    });
    expect(tapCustomer({ name: "Sara", phone: "39001122", id: PURCHASE }).phone).toEqual({
      country_code: "973",
      number: "39001122",
    });
  });
});

describe("starting the card payment", () => {
  const start = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
    handler(
      ChargeRoute,
      "POST",
    )({
      request: new Request("https://pura.boutq.store/api/public/gift-cards/charge", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
    });

  it("charges the purchase's own amount, for this purchase, and keeps the charge on it", async () => {
    const { fake } = server(purchaseRow({ gateway_reference: null }));
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ id: "chg_new", transaction: { url: "https://tap.test/pay" } }),
          {
            status: 200,
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await start({ purchaseId: PURCHASE, brandId: BRAND, token: TOKEN, amount: 1 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirectUrl: "https://tap.test/pay" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({
      amount: 50,
      currency: "BHD",
      metadata: { gift_card_purchase_id: PURCHASE, brand_id: BRAND },
    });
    expect(fake.queries[0].filters).toEqual(
      expect.arrayContaining([
        ["id", PURCHASE],
        ["brand_id", BRAND],
        ["token", TOKEN],
      ]),
    );
    expect(fake.writes).toEqual([
      expect.objectContaining({
        table: "gift_card_purchases",
        values: { gateway_reference: "chg_new" },
      }),
    ]);
  });

  it("refuses another site, a purchase not found, and one already paid", async () => {
    server(purchaseRow());
    expect(
      (
        await start(
          { purchaseId: PURCHASE, brandId: BRAND, token: TOKEN },
          { "sec-fetch-site": "cross-site" },
        )
      ).status,
    ).toBe(403);
    server(null);
    expect((await start({ purchaseId: PURCHASE, brandId: BRAND, token: "wrong" })).status).toBe(
      404,
    );
    server(purchaseRow({ status: "paid" }));
    expect((await start({ purchaseId: PURCHASE, brandId: BRAND, token: TOKEN })).status).toBe(409);
  });
});

describe("coming back from Tap", () => {
  const back = () =>
    handler(
      RedirectRoute,
      "GET",
    )({
      request: new Request(
        `https://pura.boutq.store/api/public/gift-cards/tap-redirect?tap_id=chg_1&purchase_id=${PURCHASE}&brand_id=${BRAND}`,
      ),
    });

  it("issues the card for a captured charge and opens the purchase's page", async () => {
    const { calls } = server(purchaseRow());
    vi.stubGlobal("fetch", tapAnswers(captured));
    const response = await back();
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`/pura/gift-card/${PURCHASE}?t=${TOKEN}`);
    expect(calls).toContainEqual([
      "settle_gift_card_purchase",
      { p_purchase_id: PURCHASE, p_reference: "chg_1" },
    ]);
  });

  it("issues nothing for a charge of another amount, and says a declined one failed", async () => {
    let { calls } = server(purchaseRow());
    vi.stubGlobal("fetch", tapAnswers({ ...captured, amount: 1 }));
    expect((await back()).status).toBe(400);
    expect(calls.map(([name]) => name)).not.toContain("settle_gift_card_purchase");

    ({ calls } = server(purchaseRow()));
    vi.stubGlobal("fetch", tapAnswers({ ...captured, status: "DECLINED" }));
    const response = await back();
    expect(response.headers.get("Location")).toContain("payment=failed");
    expect(calls.map(([name]) => name)).not.toContain("settle_gift_card_purchase");
  });

  it("checks a charge that is not the one the purchase started", async () => {
    const { calls } = server(purchaseRow({ gateway_reference: "chg_other" }));
    vi.stubGlobal("fetch", tapAnswers(captured));
    expect((await back()).status).toBe(400);
    expect(calls.map(([name]) => name)).not.toContain("settle_gift_card_purchase");
  });
});

describe("the gateway's webhook", () => {
  it("settles a gift card purchase on its own path, never as an order", async () => {
    const { calls, fake } = server(purchaseRow());
    vi.stubGlobal("fetch", tapAnswers(captured));
    const response = await handler(
      WebhookRoute,
      "POST",
    )({
      request: new Request("https://boutq.store/api/public/webhooks/tap", {
        method: "POST",
        body: JSON.stringify({ id: "chg_1", status: "CAPTURED", metadata: captured.metadata }),
      }),
    });
    expect(response.status).toBe(200);
    expect(calls.map(([name]) => name)).toContain("settle_gift_card_purchase");
    expect(fake.queries.map((q) => q.table)).not.toContain("orders");
  });
});
