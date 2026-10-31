import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { BRAND, OTHER, STAFF, asRole, giftCardDb } from "./helpers/gift-cards-db";

// Gift cards bought online, refined (migration 20261105100000), run in a real Postgres with the
// four gift card migrations before it: the code's delivery decides which contact is required, a
// signed-in shopper's purchase is theirs to read with its code once paid, and every purchase's
// events wait for the Worker's emails, with an alert to the installed admin.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const SHOPPER = "00000000-0000-4000-8000-0000000000e1";
let db: PGlite;
const as = (role: "anon" | "authenticated" | "service_role", sql: string, params: unknown[] = []) =>
  asRole(db, role, sql, params);
const staff = (perms = "manage_orders,manage_settings") =>
  db.exec(`SET test.staff_of = '${BRAND}'; SET test.perms = '${perms}';`);

const buy = (
  buyer: Record<string, unknown>,
  method: "card" | "benefit" = "card",
  receipt: string | null = null,
  user: string | null = null,
) =>
  as(
    "service_role",
    "SELECT public.create_gift_card_purchase('pura', 25, $1, $2::jsonb, $3, $4) AS r",
    [method, JSON.stringify({ name: "Sara", ...buyer }), receipt, user],
  );

const bought = async (...args: Parameters<typeof buy>) => {
  const reply = await buy(...args);
  if (reply.error) throw new Error(reply.error);
  return (reply.rows[0].r as { id: string }).id;
};

const receipt = async () =>
  (
    await db.query<{ id: string }>(
      `INSERT INTO public.pending_benefit_receipts (brand_id, object_key, uploaded_at)
       VALUES ('${BRAND}', 'brands/${BRAND}/benefit-receipts/' || gen_random_uuid() || '.jpg', now()) RETURNING id`,
    )
  ).rows[0].id;

const events = async (purchaseId: string) =>
  (
    await db.query<{ event: string }>(
      "SELECT event FROM public.gift_card_purchase_events WHERE purchase_id = $1 ORDER BY created_at, event",
      [purchaseId],
    )
  ).rows.map((r) => r.event);

const alerts = async (purchaseId: string) =>
  (
    await db.query<{ dedupe_key: string }>(
      "SELECT dedupe_key FROM public.push_notification_events WHERE entity_id = $1 AND event_type = 'gift_card_new' ORDER BY dedupe_key",
      [purchaseId],
    )
  ).rows.map((r) => r.dedupe_key.split(":")[0]);

beforeAll(async () => {
  db = await giftCardDb();
  await staff();
  await as("authenticated", "SELECT public.set_gift_card_settings($1, true, ARRAY[25, 50], 12)", [
    BRAND,
  ]);
  await db.exec("DELETE FROM public.gift_card_purchase_events");
});

describe("how the code reaches the buyer", () => {
  it("needs a phone for WhatsApp and an email for email, and nothing else", async () => {
    expect((await buy({ delivery: "whatsapp", email: "sara@example.com" })).error).toMatch(
      /GIFT_CARD_PHONE_REQUIRED/,
    );
    expect((await buy({ delivery: "email", phone: "39001122" })).error).toMatch(
      /GIFT_CARD_EMAIL_REQUIRED/,
    );
    expect((await buy({ delivery: "email", email: "not-an-email" })).error).toMatch(
      /GIFT_CARD_EMAIL_INVALID/,
    );
    expect((await buy({ delivery: "pigeon", phone: "39001122" })).error).toMatch(
      /GIFT_CARD_DELIVERY_INVALID/,
    );
    const id = await bought({ delivery: "email", email: "Sara@Example.com", lang: "en" });
    const row = (
      await db.query<Record<string, unknown>>(
        "SELECT delivery_channel, buyer_phone, buyer_email, lang FROM public.gift_card_purchases WHERE id = $1",
        [id],
      )
    ).rows[0];
    expect(row).toEqual({
      delivery_channel: "email",
      buyer_phone: null,
      buyer_email: "sara@example.com",
      lang: "en",
    });
  });
});

describe("a signed-in shopper's cards", () => {
  it("are theirs alone, with the code only once paid", async () => {
    const id = await bought({ delivery: "whatsapp", phone: "39001122" }, "card", null, SHOPPER);
    await bought({ delivery: "whatsapp", phone: "39001122" }, "card", null, null);
    await db.exec(
      `CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${SHOPPER}'::uuid $$`,
    );
    const mine = async () =>
      (
        await as(
          "authenticated",
          "SELECT id, status, code FROM public.storefront_my_gift_cards($1)",
          [BRAND],
        )
      ).rows;
    expect(await mine()).toEqual([{ id, status: "pending", code: null }]);
    await as("service_role", "SELECT public.settle_gift_card_purchase($1, 'chg_x')", [id]);
    expect((await mine())[0].code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(
      (await as("authenticated", "SELECT * FROM public.storefront_my_gift_cards($1)", [OTHER]))
        .rows,
    ).toEqual([]);
    expect(
      (await as("anon", "SELECT * FROM public.storefront_my_gift_cards($1)", [BRAND])).error,
    ).toMatch(/permission denied/);
    await db.exec(
      `CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${STAFF}'::uuid $$`,
    );
  });
});

describe("what the store and the buyer are told", () => {
  it("queues each event once, and alerts the admin to a transfer to check and a card sold", async () => {
    const card = await bought({ delivery: "email", email: "a@b.co" });
    expect(await events(card)).toEqual(["placed"]);
    expect(await alerts(card)).toEqual([]);
    await as("service_role", "SELECT public.settle_gift_card_purchase($1, 'chg_1')", [card]);
    await as("service_role", "SELECT public.settle_gift_card_purchase($1, 'chg_1')", [card]);
    expect((await events(card)).sort()).toEqual(["paid", "placed"]);
    expect(await alerts(card)).toEqual(["gift-card-paid"]);

    const transfer = await bought(
      { delivery: "whatsapp", phone: "39001122" },
      "benefit",
      await receipt(),
    );
    expect(await alerts(transfer)).toEqual(["gift-card-placed"]);
    await staff();
    await as("authenticated", "SELECT public.approve_gift_card_purchase($1)", [transfer]);
    expect((await events(transfer)).sort()).toEqual(["paid", "placed"]);
    expect(await alerts(transfer)).toEqual(["gift-card-placed"]);

    const declined = await bought(
      { delivery: "whatsapp", phone: "39001122" },
      "benefit",
      await receipt(),
    );
    await as(
      "authenticated",
      "SELECT public.cancel_gift_card_purchase($1, 'The transfer never came')",
      [declined],
    );
    expect((await events(declined)).sort()).toEqual(["cancelled", "placed"]);
  });

  it("hands the Worker each event once with what its emails say, and again only after a failure", async () => {
    await db.exec("DELETE FROM public.gift_card_purchase_events");
    const id = await bought({ delivery: "email", email: "a@b.co", recipient: "Noor" });
    const claim = async () =>
      (await as("service_role", "SELECT public.claim_gift_card_purchase_events(10) AS r")).rows[0]
        .r as Array<Record<string, unknown>>;
    const [first] = await claim();
    expect(first).toMatchObject({
      event: "placed",
      purchase_id: id,
      slug: "pura",
      amount: 25,
      delivery_channel: "email",
      buyer_email: "a@b.co",
      recipient_name: "Noor",
      code: null,
    });
    expect(String(first.token)).toHaveLength(64);
    expect(await claim()).toEqual([]);
    await as("service_role", "SELECT public.finish_gift_card_purchase_event($1, 'Resend 500')", [
      first.event_id,
    ]);
    expect((await claim()).map((e) => e.event_id)).toEqual([first.event_id]);
    await as("service_role", "SELECT public.finish_gift_card_purchase_event($1)", [first.event_id]);
    expect(await claim()).toEqual([]);
    for (const role of ["anon", "authenticated"] as const) {
      expect((await as(role, "SELECT public.claim_gift_card_purchase_events(1)")).error).toMatch(
        /permission denied/,
      );
    }
  });
});

describe("the staff's record of a code sent", () => {
  it("is kept for a paid card only, by staff who handle orders", async () => {
    const id = await bought({ delivery: "whatsapp", phone: "39001122" });
    await staff();
    expect(
      (await as("authenticated", "SELECT public.mark_gift_card_purchase_sent($1)", [id])).error,
    ).toMatch(/PURCHASE_NOT_PAID/);
    await as("service_role", "SELECT public.settle_gift_card_purchase($1)", [id]);
    await staff("view_financials");
    expect(
      (await as("authenticated", "SELECT public.mark_gift_card_purchase_sent($1)", [id])).error,
    ).toMatch(/PURCHASE_NOT_FOUND/);
    await staff();
    expect(
      (await as("authenticated", "SELECT public.mark_gift_card_purchase_sent($1)", [id])).error,
    ).toBeNull();
    const sent = (
      await db.query<{ sent: boolean }>(
        "SELECT code_sent_at IS NOT NULL AS sent FROM public.gift_card_purchases WHERE id = $1",
        [id],
      )
    ).rows[0];
    expect(sent.sent).toBe(true);
  });
});

describe("an installed admin's alert choices", () => {
  it("know the gift card alert and keep it on for a device that never chose", async () => {
    await db.exec(
      `INSERT INTO public.web_push_subscriptions (endpoint, user_id, preferences) VALUES ('https://push.test/1', '${STAFF}', '{"order_new": true}')`,
    );
    const saved = await as(
      "authenticated",
      "SELECT public.set_web_push_alert_choices('https://push.test/1', '{\"gift_card_new\": false}'::jsonb) AS r",
    );
    expect(saved.rows[0].r).toMatchObject({ order_new: true, gift_card_new: false });
  });
});
