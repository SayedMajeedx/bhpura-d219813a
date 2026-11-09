import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { BRAND, STAFF, asRole, giftCardDb } from "./helpers/gift-cards-db";

// The store prints a gift card, never the buyer (migration 20261124100000), run in a real Postgres
// after every gift card migration: the store turns printing on with its own fee, a purchase asking
// for it carries that fee, where to deliver and a number there, and costs value plus fee; the card
// itself holds its value only; staff record it printed, then delivered.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;
const as = (role: "anon" | "authenticated" | "service_role", sql: string, params: unknown[] = []) =>
  asRole(db, role, sql, params);
const staff = (perms = "manage_orders,manage_settings") =>
  db.exec(`SET test.staff_of = '${BRAND}'; SET test.perms = '${perms}';`);

const offer = async () =>
  (await as("anon", "SELECT public.storefront_gift_card_offer('pura') AS r")).rows[0].r as Record<
    string,
    unknown
  >;

const buy = (buyer: Record<string, unknown>, amount = 25) =>
  as(
    "service_role",
    "SELECT public.create_gift_card_purchase('pura', $1, 'card', $2::jsonb, NULL, NULL) AS r",
    [
      amount,
      JSON.stringify({
        name: "Sara",
        delivery: "email",
        email: "sara@example.com",
        design: { occasion: "birthday", design: "type:cream" },
        ...buyer,
      }),
    ],
  );

const purchase = async (id: string) =>
  (
    await db.query<Record<string, unknown>>(
      "SELECT * FROM public.gift_card_purchases WHERE id = $1",
      [id],
    )
  ).rows[0];

const PRINT = { address: "Block 338, Road 3803, House 12, Adliya", phone: "+973 3995 0016" };

beforeAll(async () => {
  db = await giftCardDb();
  await staff();
  await as("authenticated", "SELECT public.set_gift_card_settings($1, true, ARRAY[25, 50], 12)", [
    BRAND,
  ]);
});

describe("the store's printing offer", () => {
  it("is off until the store turns it on, and a visitor reads it with its fee", async () => {
    expect(await offer()).toMatchObject({ print: false, print_fee: 0 });
    const saved = await as(
      "authenticated",
      "SELECT public.set_gift_card_print($1, true, 2.5) AS r",
      [BRAND],
    );
    expect(saved.error).toBeNull();
    expect(await offer()).toMatchObject({ print: true, print_fee: 2.5 });
  });

  it("is for staff who may change settings, with a fee from 0 to 1000", async () => {
    await staff("manage_orders");
    expect(
      (await as("authenticated", "SELECT public.set_gift_card_print($1, true, 1)", [BRAND])).error,
    ).toMatch(/FORBIDDEN/);
    await staff();
    expect(
      (await as("authenticated", "SELECT public.set_gift_card_print($1, true, -1)", [BRAND])).error,
    ).toMatch(/GIFT_CARD_PRINT_FEE_INVALID/);
    expect(
      (await as("anon", "SELECT public.set_gift_card_print($1, true, 1)", [BRAND])).error,
    ).toMatch(/permission denied/);
  });
});

describe("a purchase the store prints", () => {
  it("costs the card's value plus the store's fee, and the card holds the value only", async () => {
    const reply = await buy({ print: PRINT });
    expect(reply.error).toBeNull();
    const id = (reply.rows[0].r as { id: string }).id;
    const row = await purchase(id);
    expect(row).toMatchObject({
      print_by_store: true,
      print_address: PRINT.address,
      print_phone: "+97339950016",
    });
    expect(Number(row.print_fee)).toBe(2.5);
    expect(Number(row.total_due)).toBe(27.5);
    expect((row.design as { print: boolean }).print).toBe(true);

    await as("service_role", "SELECT public.settle_gift_card_purchase($1, 'chg_1', NULL)", [id]);
    const card = await db.query<{ balance: string }>(
      "SELECT c.balance FROM public.gift_cards c JOIN public.gift_card_purchases p ON p.gift_card_id = c.id WHERE p.id = $1",
      [id],
    );
    expect(Number(card.rows[0].balance)).toBe(25);
  });

  it("keeps the fee it was bought at when the store changes it later", async () => {
    const id = ((await buy({ print: PRINT })).rows[0].r as { id: string }).id;
    await as("authenticated", "SELECT public.set_gift_card_print($1, true, 4)", [BRAND]);
    expect(Number((await purchase(id)).print_fee)).toBe(2.5);
    await as("authenticated", "SELECT public.set_gift_card_print($1, true, 2.5)", [BRAND]);
  });

  it("needs where to deliver and a number there", async () => {
    expect((await buy({ print: { phone: PRINT.phone } })).error).toMatch(
      /GIFT_CARD_PRINT_ADDRESS_REQUIRED/,
    );
    expect((await buy({ print: { address: PRINT.address, phone: "12" } })).error).toMatch(
      /GIFT_CARD_PRINT_PHONE_REQUIRED/,
    );
  });

  it("is refused while the store does not print", async () => {
    await as("authenticated", "SELECT public.set_gift_card_print($1, false, 2.5)", [BRAND]);
    expect((await buy({ print: PRINT })).error).toMatch(/GIFT_CARD_PRINT_NOT_OFFERED/);
    await as("authenticated", "SELECT public.set_gift_card_print($1, true, 2.5)", [BRAND]);
  });

  it("is never asked by the design alone: a buyer's own print flag no longer prints anything", async () => {
    const reply = await buy({
      design: { occasion: "birthday", design: "type:cream", print: true },
    });
    const row = await purchase((reply.rows[0].r as { id: string }).id);
    expect(row).toMatchObject({ print_by_store: false, print_address: null });
    expect(Number(row.print_fee)).toBe(0);
    expect(Number(row.total_due)).toBe(25);
    expect((row.design as { print: boolean }).print).toBe(false);
  });
});

describe("where the fee is read", () => {
  it("the report gives each period's printing fees apart from what cards hold", async () => {
    await db.exec("SET test.perms = 'manage_orders,manage_settings,view_financials'");
    const periods = JSON.stringify([
      { from: "2000-01-01T00:00:00Z", to: "2100-01-01T00:00:00Z" },
      { from: "2000-01-01T00:00:00Z", to: "2000-02-01T00:00:00Z" },
    ]);
    const read = await as(
      "authenticated",
      "SELECT public.rpc_reporting_gift_cards($1::jsonb) AS r",
      [periods],
    );
    expect(read.error).toBeNull();
    const [all, none] = (read.rows[0].r as { periods: Record<string, number>[] }).periods;
    const paid = await db.query<{ fees: string; n: string }>(
      "SELECT sum(print_fee) AS fees, count(*) AS n FROM public.gift_card_purchases WHERE status = 'paid' AND print_by_store",
    );
    expect(Number(all.print_fees)).toBe(Number(paid.rows[0].fees));
    expect(Number(all.print_count)).toBe(Number(paid.rows[0].n));
    expect(Number(all.print_count)).toBeGreaterThan(0);
    // The cards hold their value only: what was issued is the purchases' amounts.
    const issued = await db.query<{ s: string }>(
      "SELECT sum(amount) AS s FROM public.gift_card_purchases WHERE status = 'paid'",
    );
    expect(Number(all.held_at_end)).toBe(Number(issued.rows[0].s));
    expect(Number(none.print_fees)).toBe(0);
    await staff();
  });

  it("the emails and the store's alert are given what the buyer paid and where it goes", async () => {
    const id = ((await buy({ print: PRINT })).rows[0].r as { id: string }).id;
    const claimed = (
      await as("service_role", "SELECT public.claim_gift_card_purchase_events(50) AS r")
    ).rows[0].r as Record<string, unknown>[];
    expect(claimed.find((e) => e.purchase_id === id)).toMatchObject({
      print_by_store: true,
      print_fee: 2.5,
      print_address: PRINT.address,
    });
    // A card payment alerts the store once it is paid, with what was paid.
    await as("service_role", "SELECT public.settle_gift_card_purchase($1, 'chg_x', NULL)", [id]);
    const push = await db.query<{ body: string }>(
      "SELECT body FROM public.push_notification_events WHERE entity_id = $1",
      [id],
    );
    expect(push.rows[0].body).toBe("Sara — 27.500 BHD · مطبوعة");
  });
});

describe("the fee in the store's sales", () => {
  it("keeps the store's VAT rate on the purchase, and the report gives the fee net of it", async () => {
    await db.query(
      "UPDATE public.business_settings SET default_tax_rate = 10 WHERE brand_id = $1",
      [BRAND],
    );
    await as("authenticated", "SELECT public.set_gift_card_print($1, true, 2.2)", [BRAND]);
    const id = ((await buy({ print: PRINT })).rows[0].r as { id: string }).id;
    expect(Number((await purchase(id)).print_tax_rate)).toBe(10);
    // A digital card keeps no rate.
    const digital = ((await buy({})).rows[0].r as { id: string }).id;
    expect(Number((await purchase(digital)).print_tax_rate)).toBe(0);
    // A later change of rate never moves a purchase already made.
    await db.query("UPDATE public.business_settings SET default_tax_rate = 0 WHERE brand_id = $1", [
      BRAND,
    ]);
    expect(Number((await purchase(id)).print_tax_rate)).toBe(10);

    await as("service_role", "SELECT public.settle_gift_card_purchase($1, 'chg_vat', NULL)", [id]);
    await db.exec("SET test.perms = 'manage_orders,manage_settings,view_financials'");
    const read = await as(
      "authenticated",
      "SELECT public.rpc_reporting_gift_card_services(now() - interval '1 minute', now() + interval '1 minute') AS r",
    );
    expect(read.error).toBeNull();
    const fees = await db.query<{ gross: string; net: string; n: string }>(
      `SELECT sum(print_fee) AS gross, sum(print_fee * 100 / (100 + print_tax_rate)) AS net, count(*) AS n
         FROM public.gift_card_purchases
        WHERE status = 'paid' AND print_by_store AND paid_at > now() - interval '1 minute'`,
    );
    const [bhd] = read.rows[0].r as Record<string, number>[];
    expect(bhd.currency).toBe("BHD");
    expect(Number(bhd.service_gross)).toBeCloseTo(Number(fees.rows[0].gross), 6);
    expect(Number(bhd.service_sales)).toBeCloseTo(Number(fees.rows[0].net), 6);
    expect(Number(bhd.service_vat)).toBeCloseTo(
      Number(fees.rows[0].gross) - Number(fees.rows[0].net),
      6,
    );
    // This purchase's own part: 2.2 with 10% inside it is 2 and 0.2.
    expect((2.2 * 100) / 110).toBeCloseTo(2, 9);
    await db.exec("SET test.perms = 'manage_orders,manage_settings'");
    expect(
      (
        await as(
          "authenticated",
          "SELECT public.rpc_reporting_gift_card_services(now() - interval '1 day', now())",
        )
      ).error,
    ).toMatch(/view_financials/);
    await as("authenticated", "SELECT public.set_gift_card_print($1, true, 2.5)", [BRAND]);
  });
});

describe("recording the printing", () => {
  const paidPrinted = async () => {
    const id = ((await buy({ print: PRINT })).rows[0].r as { id: string }).id;
    await as("service_role", "SELECT public.settle_gift_card_purchase($1, 'chg', NULL)", [id]);
    return id;
  };

  it("marks it printed, then delivered, once each, by whoever pressed", async () => {
    const id = await paidPrinted();
    expect(
      (await as("authenticated", "SELECT public.set_gift_card_print_step($1, 'printed')", [id]))
        .error,
    ).toBeNull();
    const printed = await purchase(id);
    expect(printed.printed_at).not.toBeNull();
    expect(printed.printed_by).toBe(STAFF);
    expect(printed.print_delivered_at).toBeNull();

    await as("authenticated", "SELECT public.set_gift_card_print_step($1, 'delivered')", [id]);
    await as("authenticated", "SELECT public.set_gift_card_print_step($1, 'printed')", [id]);
    const delivered = await purchase(id);
    expect(delivered.print_delivered_at).not.toBeNull();
    expect(String(delivered.printed_at)).toBe(String(printed.printed_at));
  });

  it("delivered without printed first counts as printed too", async () => {
    const id = await paidPrinted();
    await as("authenticated", "SELECT public.set_gift_card_print_step($1, 'delivered')", [id]);
    const row = await purchase(id);
    expect(row.printed_at).not.toBeNull();
    expect(row.print_delivered_at).not.toBeNull();
  });

  it("is only for a paid purchase the store prints, by its order staff", async () => {
    const unpaid = ((await buy({ print: PRINT })).rows[0].r as { id: string }).id;
    expect(
      (await as("authenticated", "SELECT public.set_gift_card_print_step($1, 'printed')", [unpaid]))
        .error,
    ).toMatch(/PURCHASE_NOT_PAID/);
    const digital = ((await buy({})).rows[0].r as { id: string }).id;
    expect(
      (
        await as("authenticated", "SELECT public.set_gift_card_print_step($1, 'printed')", [
          digital,
        ])
      ).error,
    ).toMatch(/PURCHASE_NOT_PRINTED_BY_STORE/);
    const id = await paidPrinted();
    await staff("manage_settings");
    expect(
      (await as("authenticated", "SELECT public.set_gift_card_print_step($1, 'printed')", [id]))
        .error,
    ).toMatch(/PURCHASE_NOT_FOUND/);
    await staff();
    expect(
      (await as("anon", "SELECT public.set_gift_card_print_step($1, 'printed')", [id])).error,
    ).toMatch(/permission denied/);
  });

  it("staff read the printing columns, never the token", async () => {
    const read = await as(
      "authenticated",
      "SELECT print_by_store, print_fee, print_address, print_phone, printed_at, print_delivered_at, total_due FROM public.gift_card_purchases LIMIT 1",
    );
    expect(read.error).toBeNull();
    expect(
      (await as("authenticated", "SELECT token FROM public.gift_card_purchases LIMIT 1")).error,
    ).toMatch(/permission denied/);
  });
});
