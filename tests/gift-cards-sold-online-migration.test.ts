import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { BRAND, OTHER, asRole, giftCardDb } from "./helpers/gift-cards-db";

// Gift cards, step four (migration 20261104100000), run in a real Postgres after steps one to
// three: a store offers cards online, a shopper's purchase is written by the server, its card is
// issued once its payment is in (the gateway's for a card, the staff's approval for a transfer),
// and the reports count a card bought online apart.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;
const as = (role: "anon" | "authenticated" | "service_role", sql: string, params: unknown[] = []) =>
  asRole(db, role, sql, params);
const staff = (perms = "manage_orders,manage_settings,view_financials") =>
  db.exec(`SET test.staff_of = '${BRAND}'; SET test.perms = '${perms}';`);

const offer = async (slug = "pura") =>
  (await as("anon", "SELECT public.storefront_gift_card_offer($1) AS r", [slug])).rows[0]
    ?.r as Record<string, unknown> | null;

const buyer = { name: "Sara", phone: "+973 3900 1122", recipient: "Noor", message: "Eid Mubarak" };

const purchase = async (
  amount: number,
  method: "card" | "benefit",
  receipt: string | null = null,
) =>
  as(
    "service_role",
    "SELECT public.create_gift_card_purchase('pura', $1, $2, $3::jsonb, $4) AS r",
    [amount, method, JSON.stringify(buyer), receipt],
  );

const receipt = async (uploaded = true) =>
  (
    await db.query<{ id: string }>(
      `INSERT INTO public.pending_benefit_receipts (brand_id, object_key, uploaded_at)
       VALUES ('${BRAND}', 'brands/${BRAND}/benefit-receipts/' || gen_random_uuid() || '.jpg', ${uploaded ? "now()" : "NULL"})
       RETURNING id`,
    )
  ).rows[0].id;

beforeAll(async () => {
  db = await giftCardDb();
});

describe("what a store offers", () => {
  it("is nothing until staff who may change settings turn it on with amounts", async () => {
    expect(await offer()).toBeNull();
    await staff("manage_orders");
    expect(
      (
        await as("authenticated", "SELECT public.set_gift_card_settings($1, true, ARRAY[25,50])", [
          BRAND,
        ])
      ).error,
    ).toMatch(/FORBIDDEN/);
    await staff();
    expect(
      (
        await as(
          "authenticated",
          "SELECT public.set_gift_card_settings($1, true, ARRAY[]::numeric[])",
          [BRAND],
        )
      ).error,
    ).toMatch(/GIFT_CARD_AMOUNTS_REQUIRED/);
    const set = await as(
      "authenticated",
      "SELECT amounts::text AS amounts FROM public.set_gift_card_settings($1, true, ARRAY[50, 25, 25, 100], 12)",
      [BRAND],
    );
    expect(set.error).toBeNull();
    expect(set.rows[0].amounts).toBe("{25.000,50.000,100.000}");
    expect(await offer()).toMatchObject({
      currency: "BHD",
      valid_months: 12,
      card: true,
      benefit: true,
      amounts: [25, 50, 100],
    });
    expect(await offer("other")).toBeNull();
  });

  it("is withdrawn while the store takes neither a card nor BenefitPay", async () => {
    await db.exec(
      `UPDATE public.business_settings SET card_enabled = false, benefit_enabled = false WHERE brand_id = '${BRAND}'`,
    );
    expect(await offer()).toBeNull();
    await db.exec(
      `UPDATE public.business_settings SET card_enabled = true, benefit_enabled = true WHERE brand_id = '${BRAND}'`,
    );
  });
});

describe("a shopper's purchase", () => {
  it("is one of the store's amounts, by a method it takes, and only the server writes it", async () => {
    expect((await purchase(30, "card")).error).toMatch(/GIFT_CARD_AMOUNT_NOT_OFFERED/);
    await db.exec(
      `UPDATE public.business_settings SET benefit_enabled = false WHERE brand_id = '${BRAND}'`,
    );
    expect((await purchase(25, "benefit", await receipt())).error).toMatch(
      /PAYMENT_METHOD_DISABLED/,
    );
    await db.exec(
      `UPDATE public.business_settings SET benefit_enabled = true WHERE brand_id = '${BRAND}'`,
    );
    for (const role of ["anon", "authenticated"] as const) {
      const reply = await as(
        role,
        "SELECT public.create_gift_card_purchase('pura', 25, 'card', '{}'::jsonb)",
      );
      expect(reply.error).toMatch(/permission denied/);
    }
    const reply = await purchase(25, "card");
    expect(reply.error).toBeNull();
    expect(reply.rows[0].r).toMatchObject({ brand_id: BRAND });
    expect(String((reply.rows[0].r as { token: string }).token)).toHaveLength(64);
  });

  it("by transfer brings an uploaded receipt, used once", async () => {
    expect((await purchase(25, "benefit")).error).toMatch(/BENEFIT_RECEIPT_INVALID/);
    expect((await purchase(25, "benefit", await receipt(false))).error).toMatch(
      /BENEFIT_RECEIPT_INVALID/,
    );
    const used = await receipt();
    expect((await purchase(50, "benefit", used)).error).toBeNull();
    expect((await purchase(50, "benefit", used)).error).toMatch(/BENEFIT_RECEIPT_INVALID/);
    expect((await purchase(25, "card", used)).error).toMatch(/UNEXPECTED_BENEFIT_RECEIPT/);
  });

  it("needs a name and a phone", async () => {
    const reply = await as(
      "service_role",
      "SELECT public.create_gift_card_purchase('pura', 25, 'card', '{\"name\": \"Sara\"}'::jsonb)",
    );
    expect(reply.error).toMatch(/GIFT_CARD_BUYER_INVALID/);
  });
});

describe("its card", () => {
  it("is issued once a card payment is in, once, as bought online, for the store's validity", async () => {
    const { id } = (await purchase(100, "card")).rows[0].r as { id: string };
    const first = await as(
      "service_role",
      "SELECT public.settle_gift_card_purchase($1, 'chg_1') AS r",
      [id],
    );
    expect(first.rows[0].r).toMatchObject({ already: false });
    const again = await as(
      "service_role",
      "SELECT public.settle_gift_card_purchase($1, 'chg_1') AS r",
      [id],
    );
    expect(again.rows[0].r).toMatchObject({ already: true });
    expect((again.rows[0].r as { code: string }).code).toBe(
      (first.rows[0].r as { code: string }).code,
    );

    const card = (
      await db.query<Record<string, unknown>>(
        `SELECT c.balance::float AS balance, c.paid_with, c.purchaser_name, c.recipient_name,
                c.expires_on = (current_date + interval '12 months')::date AS a_year, p.status, p.gateway_reference
           FROM public.gift_card_purchases p JOIN public.gift_cards c ON c.id = p.gift_card_id
          WHERE p.id = $1`,
        [id],
      )
    ).rows[0];
    expect(card).toEqual({
      balance: 100,
      paid_with: "online",
      purchaser_name: "Sara",
      recipient_name: "Noor",
      a_year: true,
      status: "paid",
      gateway_reference: "chg_1",
    });
    expect(
      (
        await db.query(
          `SELECT 1 FROM public.gift_card_movements m JOIN public.gift_card_purchases p ON p.gift_card_id = m.gift_card_id WHERE p.id = $1`,
          [id],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("by transfer waits for the store's staff to approve or turn it down", async () => {
    const { id } = (await purchase(25, "benefit", await receipt())).rows[0].r as { id: string };
    await staff("view_financials");
    expect(
      (await as("authenticated", "SELECT public.approve_gift_card_purchase($1)", [id])).error,
    ).toMatch(/PURCHASE_NOT_FOUND/);
    await staff();
    const approved = await as(
      "authenticated",
      "SELECT public.approve_gift_card_purchase($1) AS r",
      [id],
    );
    expect(approved.error).toBeNull();
    const paidWith = (
      await db.query<{ paid_with: string }>(
        "SELECT c.paid_with FROM public.gift_card_purchases p JOIN public.gift_cards c ON c.id = p.gift_card_id WHERE p.id = $1",
        [id],
      )
    ).rows[0].paid_with;
    expect(paidWith).toBe("transfer");
    expect(
      (
        await as("authenticated", "SELECT public.cancel_gift_card_purchase($1, 'no transfer')", [
          id,
        ])
      ).error,
    ).toMatch(/PURCHASE_NOT_PENDING/);

    const other = (await purchase(25, "benefit", await receipt())).rows[0].r as { id: string };
    expect(
      (await as("authenticated", "SELECT public.cancel_gift_card_purchase($1, 'x')", [other.id]))
        .error,
    ).toMatch(/GIFT_CARD_REASON_REQUIRED/);
    expect(
      (
        await as(
          "authenticated",
          "SELECT public.cancel_gift_card_purchase($1, 'The transfer never came')",
          [other.id],
        )
      ).error,
    ).toBeNull();
    expect(
      (await as("service_role", "SELECT public.settle_gift_card_purchase($1)", [other.id])).error,
    ).toMatch(/PURCHASE_CANCELLED/);
  });

  it("is issued for a card payment that arrives after the purchase expired", async () => {
    const { id } = (await purchase(25, "card")).rows[0].r as { id: string };
    await db.exec(
      `UPDATE public.gift_card_purchases SET created_at = now() - interval '2 days' WHERE id = '${id}'`,
    );
    expect(
      (await as("service_role", "SELECT public.expire_gift_card_purchases() AS n")).rows[0].n,
    ).toBeGreaterThan(0);
    expect(
      (await as("service_role", "SELECT public.settle_gift_card_purchase($1) AS r", [id])).error,
    ).toBeNull();
  });

  it("is never issued as 'online' by staff, who record what they took in the store", async () => {
    await staff();
    const reply = await as(
      "authenticated",
      "SELECT public.issue_gift_card(p_brand_id => $1, p_amount => 10, p_paid_with => 'online')",
      [BRAND],
    );
    expect(reply.error).toMatch(/GIFT_CARD_PAID_WITH_INVALID/);
    const cash = await as(
      "authenticated",
      "SELECT paid_with FROM public.issue_gift_card(p_brand_id => $1, p_amount => 10, p_paid_with => 'cash')",
      [BRAND],
    );
    expect(cash.rows[0].paid_with).toBe("cash");
  });
});

describe("the reports", () => {
  it("count what was bought online apart from the store's own sales", async () => {
    await staff();
    const reply = await as(
      "authenticated",
      "SELECT public.rpc_reporting_gift_cards($1::jsonb) AS r",
      [JSON.stringify([{ from: "2026-01-01T00:00:00Z", to: "2100-01-01T00:00:00Z" }])],
    );
    const [period] = (reply.rows[0].r as { periods: Record<string, number>[] }).periods;
    // 100 and 25 by card online, 25 by transfer, 10 in cash.
    expect(period).toMatchObject({ sold_online: 125, sold_transfer: 25, sold_cash: 10, sold: 160 });
  });

  it("let a staff member only read their own store's purchases", async () => {
    await db.exec(`SET test.staff_of = '${OTHER}'; SET test.perms = 'manage_orders';`);
    expect(
      (await as("authenticated", "SELECT count(*)::int AS n FROM public.gift_card_purchases"))
        .rows[0].n,
    ).toBe(0);
    expect(
      (await as("authenticated", "SELECT token FROM public.gift_card_purchases")).error,
    ).toMatch(/permission denied/);
  });
});
