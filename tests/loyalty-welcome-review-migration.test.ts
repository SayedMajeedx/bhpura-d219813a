import { describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { BRAND, loyaltyDatabase } from "./helpers/loyalty-db";
import migration from "../supabase/migrations/20261226100000_loyalty_welcome_and_review_points.sql?raw";

vi.setConfig({ testTimeout: 60_000 });

// Welcome points and review points (migration 20261226100000): two settings that were saved and
// given by nothing. Run on the real loyalty tables and engine in a real Postgres (PGlite).

const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const SHOPPER = "00000000-0000-4000-8000-0000000000a1";
const ORDER = "00000000-0000-4000-8000-0000000000d1";
const REQUEST = "00000000-0000-4000-8000-0000000000e1";
const TOKEN = "00000000-0000-4000-8000-0000000000f1";

async function database(program: Record<string, unknown> | null = {}) {
  return loyaltyDatabase([migration], program);
}

type Ledger = {
  event_type: string;
  points: number;
  points_status: string;
  review_id: string | null;
};
const ledger = async (db: PGlite) =>
  (
    await db.query<Ledger>(
      `SELECT event_type, points, points_status, review_id
         FROM public.loyalty_ledger ORDER BY created_at, event_type`,
    )
  ).rows;
const account = async (db: PGlite) =>
  (
    await db.query<{ active_points: number; pending_points: number }>(
      `SELECT active_points, pending_points FROM public.loyalty_accounts WHERE customer_id = '${CUSTOMER}'`,
    )
  ).rows[0];

const addCustomer = (db: PGlite, auth: string | null = null) =>
  db.exec(
    `INSERT INTO public.customers (id, brand_id, auth_user_id)
     VALUES ('${CUSTOMER}', '${BRAND}', ${auth ? `'${auth}'` : "NULL"})`,
  );

/** A completed order with a review link ready, as the store has one after a hand-over. */
async function reviewReady(db: PGlite, { status = "completed", subtotal = 0 } = {}) {
  await addCustomer(db);
  await db.exec(`
    INSERT INTO public.orders (id, brand_id, customer_id, invoice_number, status, subtotal, total, customer_name_snapshot)
    VALUES ('${ORDER}', '${BRAND}', '${CUSTOMER}', 1042, '${status}', ${subtotal}, ${subtotal}, 'Noor Ali');
    INSERT INTO public.order_review_requests (id, brand_id, order_id, public_token)
    VALUES ('${REQUEST}', '${BRAND}', '${ORDER}', '${TOKEN}');
  `);
}
const review = async (db: PGlite) =>
  (
    await db.query<{ code: string | null }>(
      `SELECT public.submit_public_order_review('${TOKEN}', 5, ARRAY['quality'], 'Lovely', false) AS code`,
    )
  ).rows[0].code;
const page = async (db: PGlite) =>
  (
    await db.query<{ state: string; reward_code: string | null; reward_points: number | null }>(
      `SELECT state, reward_code, reward_points FROM public.get_public_order_review('${TOKEN}')`,
    )
  ).rows[0];
const choosePoints = (db: PGlite) =>
  db.exec(
    `UPDATE public.business_settings SET review_reward_points = true WHERE brand_id = '${BRAND}'`,
  );

describe("welcome points", () => {
  it("are given once when a shopper's account is linked to the store's customer", async () => {
    const db = await database({ welcome_bonus_points: 20 });
    await addCustomer(db);
    expect(await ledger(db)).toEqual([]);
    const link = `UPDATE public.customers SET auth_user_id = '${SHOPPER}' WHERE id = '${CUSTOMER}'`;
    await db.exec(link);
    await db.exec(`UPDATE public.customers SET name = 'Noor' WHERE id = '${CUSTOMER}'`);
    await db.exec(`UPDATE public.customers SET auth_user_id = NULL WHERE id = '${CUSTOMER}'`);
    await db.exec(link);
    expect(await ledger(db)).toEqual([
      { event_type: "earn_welcome", points: 20, points_status: "active", review_id: null },
    ]);
    expect(await account(db)).toEqual({ active_points: 20, pending_points: 0 });
  });

  it("come with a customer made for a signed-in shopper", async () => {
    const db = await database({ welcome_bonus_points: 20 });
    await addCustomer(db, SHOPPER);
    expect((await ledger(db)).map((row) => row.event_type)).toEqual(["earn_welcome"]);
  });

  it("are nothing while the store has no programme, it is off, or its welcome is zero", async () => {
    for (const program of [
      null,
      { is_enabled: false, welcome_bonus_points: 20 },
      { welcome_bonus_points: 0 },
    ]) {
      const db = await database(program);
      await addCustomer(db, SHOPPER);
      expect(await ledger(db)).toEqual([]);
    }
  });

  it("never stop a customer from being saved", async () => {
    const db = await database({ welcome_bonus_points: 20 });
    await db.exec(`DROP FUNCTION public.rpc_evaluate_customer_loyalty_tier(uuid, uuid) CASCADE`);
    await addCustomer(db, SHOPPER);
    expect((await db.query(`SELECT 1 FROM public.customers`)).rows).toHaveLength(1);
    expect(await ledger(db)).toEqual([]);
  });
});

describe("a review's thank-you", () => {
  it("is the store's code, as before, while it did not choose points", async () => {
    const db = await database({ review_bonus_points: 25 });
    await reviewReady(db);
    expect((await page(db)).reward_points).toBeNull();
    expect(await review(db)).toBe("THANKS10");
    expect(await ledger(db)).toEqual([]);
  });

  it("is the store's points instead of its code once it chose points, held like the order's", async () => {
    const db = await database({ review_bonus_points: 25, holding_period_days: 14 });
    await choosePoints(db);
    await reviewReady(db);
    expect(await page(db)).toMatchObject({ state: "ready", reward_code: null, reward_points: 25 });
    expect(await review(db)).toBeNull();
    const rows = await ledger(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event_type: "earn_review",
      points: 25,
      points_status: "pending",
    });
    expect(rows[0].review_id).not.toBeNull();
    expect(await account(db)).toEqual({ active_points: 0, pending_points: 25 });
    expect(await page(db)).toMatchObject({ state: "completed", reward_points: 25 });
  });

  it("is given once, however often the link is sent", async () => {
    const db = await database({ review_bonus_points: 25 });
    await choosePoints(db);
    await reviewReady(db);
    await review(db);
    await review(db);
    expect(await ledger(db)).toHaveLength(1);
    expect(await account(db)).toEqual({ active_points: 25, pending_points: 0 });
  });

  it("gives no points while the programme is off or the order no longer earns", async () => {
    const off = await database({ is_enabled: false, review_bonus_points: 25 });
    await choosePoints(off);
    await reviewReady(off);
    expect((await page(off)).reward_points).toBeNull();
    await review(off);
    expect(await ledger(off)).toEqual([]);

    const cancelled = await database({ review_bonus_points: 25 });
    await choosePoints(cancelled);
    await reviewReady(cancelled, { status: "cancelled" });
    await review(cancelled);
    expect(await ledger(cancelled)).toEqual([]);
    expect((await page(cancelled)).reward_points).toBeNull();
  });

  it("is taken back with the order's points when the order is cancelled", async () => {
    const db = await database({ review_bonus_points: 25, holding_period_days: 14 });
    await choosePoints(db);
    await reviewReady(db);
    await review(db);
    await db.exec(`UPDATE public.orders SET status = 'cancelled' WHERE id = '${ORDER}'`);
    expect(await account(db)).toEqual({ active_points: 0, pending_points: 0 });
    const events = (await ledger(db)).map((row) => [row.event_type, row.points_status]);
    expect(events).toContainEqual(["earn_review", "cancelled"]);
    expect(events).toContainEqual(["revoke_cancelled", "cancelled"]);
  });
});

describe("a cancelled order", () => {
  const setStatus = (db: PGlite, status: string) =>
    db.exec(`UPDATE public.orders SET status = '${status}' WHERE id = '${ORDER}'`);

  it("takes back its own points and its review's together", async () => {
    const db = await database({ review_bonus_points: 25, points_per_currency_unit: 1 });
    await choosePoints(db);
    await reviewReady(db, { subtotal: 40 });
    await review(db);
    expect(await account(db)).toEqual({ active_points: 65, pending_points: 0 });
    await setStatus(db, "cancelled");
    expect(await account(db)).toEqual({ active_points: 0, pending_points: 0 });
  });

  it("still takes back its own points after being put back, when the review's were taken alone", async () => {
    const db = await database({ review_bonus_points: 25 });
    await choosePoints(db);
    await reviewReady(db);
    await review(db);
    await setStatus(db, "cancelled");
    expect(await account(db)).toEqual({ active_points: 0, pending_points: 0 });
    // The programme now earns on amounts; the order is put back, earns, and is cancelled again.
    await db.exec(`UPDATE public.brand_loyalty_programs SET points_per_currency_unit = 1`);
    await db.exec(`UPDATE public.orders SET subtotal = 30, total = 30 WHERE id = '${ORDER}'`);
    await setStatus(db, "completed");
    expect((await account(db)).active_points).toBe(30);
    await setStatus(db, "cancelled");
    expect(await account(db)).toEqual({ active_points: 0, pending_points: 0 });
  });
});

describe("who may call it", () => {
  it("gives bonuses from the database only, never a browser", async () => {
    const db = await database();
    const rights = await db.query<{ routine_name: string }>(
      `SELECT DISTINCT routine_name FROM information_schema.routine_privileges
        WHERE grantee IN ('anon', 'authenticated', 'PUBLIC')
          AND routine_name IN ('loyalty_grant_bonus', 'customers_loyalty_welcome', 'store_review_points')`,
    );
    expect(rights.rows).toEqual([]);
    const reviewPage = await db.query<{ grantee: string }>(
      `SELECT grantee FROM information_schema.routine_privileges
        WHERE routine_name = 'get_public_order_review' AND grantee = 'anon'`,
    );
    expect(reviewPage.rows).toHaveLength(1);
  });
});
