import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { BRAND, OTHER, asRole, giftCardDb } from "./helpers/gift-cards-db";

// A gift card's amount chosen in the store's range, and the store's gift add-ons with a card it
// prints (migration 20261206100000), run in a real Postgres after every gift card migration: the
// store sets its least and most amount (its list became its range); a purchase is a whole amount
// in it; a printed card carries add-ons priced from the store's rows; the buyer pays card, fee and
// add-ons; the add-ons count in the store's sales as the fee does.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;
const as = (role: "anon" | "authenticated" | "service_role", sql: string, params: unknown[] = []) =>
  asRole(db, role, sql, params);
const staff = (perms = "manage_orders,manage_settings,view_financials") =>
  db.exec(`SET test.staff_of = '${BRAND}'; SET test.perms = '${perms}';`);

const offer = async () =>
  (await as("anon", "SELECT public.storefront_gift_card_offer('pura') AS r")).rows[0].r as Record<
    string,
    unknown
  >;

const PRINT = { address: "Block 338, Road 3803, House 12, Adliya", phone: "+973 3995 0016" };

const buy = (amount: number, buyer: Record<string, unknown> = {}) =>
  as(
    "service_role",
    "SELECT public.create_gift_card_purchase('pura', $1, 'card', $2::jsonb, NULL, NULL) AS r",
    [
      amount,
      JSON.stringify({ name: "Sara", delivery: "email", email: "sara@example.com", ...buyer }),
    ],
  );

const purchase = async (result: Awaited<ReturnType<typeof buy>>) => {
  expect(result.error).toBeNull();
  const id = (result.rows[0].r as { id: string }).id;
  return (
    await db.query<Record<string, unknown>>(
      "SELECT amount, print_fee, addons, addons_total, total_due, print_tax_rate FROM public.gift_card_purchases WHERE id = $1",
      [id],
    )
  ).rows[0];
};

let ROSES = "";
let CHOCOLATE = "";
let OFF = "";
let FOREIGN = "";

beforeAll(async () => {
  db = await giftCardDb();
  await staff();
  // A store that sold from a list before the range.
  await as(
    "authenticated",
    "SELECT public.set_gift_card_settings($1, true, ARRAY[5, 20, 40], 12)",
    [BRAND],
  );
  await as("authenticated", "SELECT public.set_gift_card_print($1, true, 2)", [BRAND]);
  const add = async (brand: string, name: string, price: number, available = true) =>
    (
      await db.query<{ id: string }>(
        "INSERT INTO public.gift_addons (brand_id, name_ar, name_en, price, is_available) VALUES ($1, $2, $2, $3, $4) RETURNING id",
        [brand, name, price, available],
      )
    ).rows[0].id;
  ROSES = await add(BRAND, "Roses", 12);
  CHOCOLATE = await add(BRAND, "Chocolate", 4.5);
  OFF = await add(BRAND, "Balloons", 3, false);
  FOREIGN = await add(OTHER, "Other store's", 1);
});

describe("the store's range", () => {
  it("is set from the least to the most amount, and a visitor reads it", async () => {
    const saved = await as(
      "authenticated",
      "SELECT public.set_gift_card_settings($1, true, ARRAY[]::numeric[], 12, 5, 40) AS r",
      [BRAND],
    );
    expect(saved.error).toBeNull();
    expect(await offer()).toMatchObject({ min_amount: 5, max_amount: 40 });
  });

  it("takes whole amounts, the least not above the most, for staff who may change settings", async () => {
    for (const [min, max] of [
      [0, 40],
      [5.5, 40],
      [50, 40],
      [5, 200000],
    ]) {
      const r = await as(
        "authenticated",
        "SELECT public.set_gift_card_settings($1, true, ARRAY[]::numeric[], 12, $2, $3)",
        [BRAND, min, max],
      );
      expect(r.error).toMatch(/GIFT_CARD_RANGE_INVALID/);
    }
    await staff("manage_orders");
    expect(
      (
        await as(
          "authenticated",
          "SELECT public.set_gift_card_settings($1, true, ARRAY[]::numeric[], 12, 5, 40)",
          [BRAND],
        )
      ).error,
    ).toMatch(/FORBIDDEN/);
    await staff();
  });

  it("keeps its range when a page open across the release saves with four arguments", async () => {
    const r = await as(
      "authenticated",
      "SELECT public.set_gift_card_settings(p_brand_id => $1, p_sell_online => true, p_amounts => ARRAY[10, 20]::numeric[], p_valid_months => 6)",
      [BRAND],
    );
    expect(r.error).toBeNull();
    expect(await offer()).toMatchObject({ min_amount: 5, max_amount: 40, valid_months: 6 });
    const count = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'set_gift_card_settings'",
    );
    expect(count.rows[0].n).toBe(1);
  });

  it("sells any whole amount in it, and nothing outside it", async () => {
    expect((await purchase(await buy(7))).amount).toBe("7.000");
    expect((await purchase(await buy(40))).amount).toBe("40.000");
    expect((await buy(4)).error).toMatch(/GIFT_CARD_AMOUNT_NOT_OFFERED/);
    expect((await buy(41)).error).toMatch(/GIFT_CARD_AMOUNT_NOT_OFFERED/);
    expect((await buy(7.5)).error).toMatch(/GIFT_CARD_AMOUNT_NOT_OFFERED/);
  });
});

describe("a store's list becoming its range", () => {
  it("runs from the list's least to its most", async () => {
    await db.exec(`
      CREATE TEMP TABLE before AS SELECT * FROM public.gift_card_settings;
      UPDATE public.gift_card_settings SET min_amount = NULL, max_amount = NULL, amounts = ARRAY[10.5, 25, 60.75];
    `);
    const migration = await db.query<{ lo: string; hi: string }>(`
      UPDATE public.gift_card_settings s
         SET min_amount = r.lo, max_amount = r.hi
        FROM (SELECT brand_id, GREATEST(1, ceil((SELECT min(a) FROM unnest(amounts) a))) AS lo,
                     floor((SELECT max(a) FROM unnest(amounts) a)) AS hi
                FROM public.gift_card_settings WHERE cardinality(amounts) > 0) r
       WHERE s.brand_id = r.brand_id AND s.min_amount IS NULL AND r.lo <= r.hi AND r.hi <= 100000
      RETURNING s.min_amount AS lo, s.max_amount AS hi`);
    expect(migration.rows[0]).toEqual({ lo: "11.000", hi: "60.000" });
    await db.exec(`
      UPDATE public.gift_card_settings s SET min_amount = b.min_amount, max_amount = b.max_amount, amounts = b.amounts
        FROM before b WHERE b.brand_id = s.brand_id;
    `);
  });
});

describe("add-ons with a card the store prints", () => {
  it("are priced from the store's rows, kept as sold, and paid with the card and the fee", async () => {
    const row = await purchase(
      await buy(20, {
        print: {
          ...PRINT,
          addons: [
            { id: ROSES, quantity: 1 },
            { id: CHOCOLATE, quantity: 2 },
          ],
        },
      }),
    );
    expect(row.addons_total).toBe("21.000");
    expect(row.total_due).toBe("43.000");
    expect(row.addons).toEqual([
      { id: ROSES, name_ar: "Roses", name_en: "Roses", price: 12, quantity: 1 },
      { id: CHOCOLATE, name_ar: "Chocolate", name_en: "Chocolate", price: 4.5, quantity: 2 },
    ]);
  });

  it("never takes a price from the buyer", async () => {
    const row = await purchase(
      await buy(20, { print: { ...PRINT, addons: [{ id: ROSES, quantity: 1, price: 0.001 }] } }),
    );
    expect(row.addons_total).toBe("12.000");
  });

  it("refuses one switched off, another store's, the same twice, or too many", async () => {
    for (const addons of [
      [{ id: OFF, quantity: 1 }],
      [{ id: FOREIGN, quantity: 1 }],
      [
        { id: ROSES, quantity: 1 },
        { id: ROSES, quantity: 1 },
      ],
      [{ id: ROSES, quantity: 11 }],
      [{ id: ROSES, quantity: 0 }],
      [{ id: "not-an-id", quantity: 1 }],
    ]) {
      expect((await buy(20, { print: { ...PRINT, addons } })).error).toMatch(
        /GIFT_ADDON_UNAVAILABLE/,
      );
    }
  });

  it("go only with a card the store prints", async () => {
    const digital = await purchase(await buy(20, { addons: [{ id: ROSES, quantity: 1 }] }));
    expect(digital).toMatchObject({ addons: [], addons_total: "0.000", total_due: "20.000" });
    await expect(
      db.query(
        "INSERT INTO public.gift_card_purchases (brand_id, amount, currency, payment_method, buyer_name, delivery_channel, buyer_email, addons_total) VALUES ($1, 5, 'BHD', 'card', 'x', 'email', 'x@y.co', 3)",
        [BRAND],
      ),
    ).rejects.toThrow(/gift_card_purchases_addons_check/);
  });
});

describe("the money", () => {
  it("counts the add-ons in the store's sales with the fee, VAT inside at the purchase's rate", async () => {
    await db.exec("DELETE FROM public.gift_card_purchases");
    await db.exec(
      `UPDATE public.business_settings SET default_tax_rate = 10 WHERE brand_id = '${BRAND}'`,
    );
    const row = await purchase(
      await buy(20, { print: { ...PRINT, addons: [{ id: ROSES, quantity: 1 }] } }),
    );
    expect(row.print_tax_rate).toBe("10.000");
    await db.exec("UPDATE public.gift_card_purchases SET status = 'paid', paid_at = now()");
    const report = await as(
      "authenticated",
      "SELECT public.rpc_reporting_gift_card_services(now() - interval '1 day', now() + interval '1 day') AS r",
    );
    const [services] = report.rows[0].r as Array<Record<string, number>>;
    expect(Number(services.service_gross)).toBe(14);
    expect(Number(services.service_sales)).toBeCloseTo(12.727, 3);
    expect(Number(services.service_vat)).toBeCloseTo(1.273, 3);
  });

  it("tells the emails and the store's alert what was paid, add-ons included", async () => {
    const events = await as(
      "service_role",
      "SELECT public.claim_gift_card_purchase_events(20) AS r",
    );
    const sent = (events.rows[0].r as Array<Record<string, unknown>>).find(
      (e) => Number(e.addons_total) > 0,
    );
    expect(sent).toMatchObject({ addons_total: 12 });
    const alert = await db.query<{ body: string }>(
      "SELECT body FROM public.push_notification_events WHERE event_type = 'gift_card_new' ORDER BY title LIMIT 1",
    );
    expect(alert.rows.map((r) => r.body).join(" ")).toMatch(/34\.000 BHD/);
  });
});
