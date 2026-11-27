import { describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { BRAND, loyaltyDatabase } from "./helpers/loyalty-db";
import bonuses from "../supabase/migrations/20261226100000_loyalty_welcome_and_review_points.sql?raw";
import migration from "../supabase/migrations/20261228100000_loyalty_referrals.sql?raw";

vi.setConfig({ testTimeout: 60_000 });

// Referrals (migration 20261228100000), on the real loyalty tables and engine in a real Postgres
// (PGlite): a member's own code, a new customer's first order recorded through it, both given the
// programme's referral points when that order earns and both taken back when it is undone.

const MEMBER = "00000000-0000-4000-8000-0000000000c1";
const MEMBER_LOGIN = "00000000-0000-4000-8000-0000000000a1";
const FRIEND = "00000000-0000-4000-8000-0000000000c2";
const ORDER = "00000000-0000-4000-8000-0000000000d1";
const EARLIER = "00000000-0000-4000-8000-0000000000d0";

async function database(program: Record<string, unknown> | null = { referral_bonus_points: 100 }) {
  // No welcome points, so a balance is the referral's alone.
  const db = await loyaltyDatabase(
    [bonuses, migration],
    program ? { welcome_bonus_points: 0, ...program } : null,
  );
  await db.exec(`
    INSERT INTO public.customers (id, brand_id, auth_user_id, phone, email) VALUES
      ('${MEMBER}', '${BRAND}', '${MEMBER_LOGIN}', '+973 3999 0001', 'noor@example.com'),
      ('${FRIEND}', '${BRAND}', NULL, '+973 3888 0002', 'sara@example.com');
  `);
  return db;
}
const as = (db: PGlite, login: string | null) =>
  db.exec(`SELECT set_config('test.uid', '${login ?? ""}', false)`);

async function myCode(db: PGlite) {
  const row = (
    await db.query<{ r: Record<string, unknown> | null }>(
      `SELECT public.my_referral_code('${BRAND}') AS r`,
    )
  ).rows[0].r;
  return row;
}
const placeOrder = (db: PGlite, id = ORDER, customer = FRIEND, status = "pending") =>
  db.exec(`INSERT INTO public.orders (id, brand_id, customer_id, invoice_number, status, subtotal, total)
           VALUES ('${id}', '${BRAND}', '${customer}', 1050, '${status}', 0, 0)`);
const record = async (db: PGlite, code: string, order = ORDER) =>
  (await db.query<{ r: string }>(`SELECT public.record_order_referral('${order}', '${code}') AS r`))
    .rows[0].r;
const setStatus = (db: PGlite, status: string) =>
  db.exec(`UPDATE public.orders SET status = '${status}' WHERE id = '${ORDER}'`);
const balance = async (db: PGlite, customer: string) =>
  (
    await db.query<{ active_points: number; pending_points: number }>(
      `SELECT active_points, pending_points FROM public.loyalty_accounts WHERE customer_id = '${customer}'`,
    )
  ).rows[0] ?? { active_points: 0, pending_points: 0 };
const referral = async (db: PGlite) =>
  (await db.query<{ status: string }>(`SELECT status FROM public.loyalty_referrals`)).rows[0]
    ?.status ?? null;

describe("a member's referral code", () => {
  it("is made once, for the signed-in member, while the store gives points for a referral", async () => {
    const db = await database();
    await as(db, MEMBER_LOGIN);
    const first = await myCode(db);
    expect(first).toMatchObject({ points: 100, friends: 0, rewarded: 0 });
    expect(String(first?.code)).toMatch(/^[A-Z0-9]{8}$/);
    expect((await myCode(db))?.code).toBe(first?.code);
  });

  it("is nothing for a visitor, a stranger, or a store that gives no referral points", async () => {
    const db = await database();
    await as(db, null);
    expect(await myCode(db)).toBeNull();
    await as(db, "00000000-0000-4000-8000-0000000000a9");
    expect(await myCode(db)).toBeNull();
    const none = await database({ referral_bonus_points: 0 });
    await as(none, MEMBER_LOGIN);
    expect(await myCode(none)).toBeNull();
  });
});

describe("a referral", () => {
  async function referred(program?: Record<string, unknown>) {
    const db = await database(program);
    await as(db, MEMBER_LOGIN);
    const code = String((await myCode(db))?.code);
    await as(db, null);
    await placeOrder(db);
    return { db, code };
  }

  it("is recorded on a new customer's first order, and gives both points once it is completed", async () => {
    const { db, code } = await referred();
    expect(await record(db, code.toLowerCase())).toBe("RECORDED");
    expect(await referral(db)).toBe("pending");
    expect(await balance(db, MEMBER)).toEqual({ active_points: 0, pending_points: 0 });
    await setStatus(db, "completed");
    expect(await referral(db)).toBe("rewarded");
    expect(await balance(db, MEMBER)).toEqual({ active_points: 100, pending_points: 0 });
    expect(await balance(db, FRIEND)).toEqual({ active_points: 100, pending_points: 0 });
    await as(db, MEMBER_LOGIN);
    expect(await myCode(db)).toMatchObject({ friends: 1, rewarded: 1 });
  });

  it("holds the points like an order's, and takes both back when the order is cancelled", async () => {
    const { db, code } = await referred({ referral_bonus_points: 100, holding_period_days: 14 });
    await record(db, code);
    await setStatus(db, "completed");
    expect(await balance(db, MEMBER)).toEqual({ active_points: 0, pending_points: 100 });
    await setStatus(db, "cancelled");
    expect(await referral(db)).toBe("cancelled");
    expect(await balance(db, MEMBER)).toEqual({ active_points: 0, pending_points: 0 });
    expect(await balance(db, FRIEND)).toEqual({ active_points: 0, pending_points: 0 });
  });

  it("is never a member's own code, by customer, phone or email", async () => {
    const { db, code } = await referred();
    await placeOrder(db, "00000000-0000-4000-8000-0000000000d7", MEMBER);
    expect(await record(db, code, "00000000-0000-4000-8000-0000000000d7")).toBe("OWN_CODE");
    await db.exec(`UPDATE public.customers SET phone = '39990001' WHERE id = '${FRIEND}'`);
    expect(await record(db, code)).toBe("OWN_CODE");
    await db.exec(
      `UPDATE public.customers SET phone = NULL, email = 'NOOR@example.com' WHERE id = '${FRIEND}'`,
    );
    expect(await record(db, code)).toBe("OWN_CODE");
    expect(await referral(db)).toBeNull();
  });

  it("is only for a customer's first order, and only once", async () => {
    const { db, code } = await referred();
    await db.exec(`DELETE FROM public.orders WHERE id = '${ORDER}'`);
    await db.exec(`INSERT INTO public.orders (id, brand_id, customer_id, status, created_at)
                   VALUES ('${EARLIER}', '${BRAND}', '${FRIEND}', 'completed', now() - interval '1 day')`);
    await placeOrder(db);
    expect(await record(db, code)).toBe("NOT_FIRST_ORDER");

    const fresh = await referred();
    expect(await record(fresh.db, fresh.code)).toBe("RECORDED");
    expect(await record(fresh.db, fresh.code)).toBe("ALREADY_REFERRED");
  });

  it("answers why a code is refused, and gives nothing while the programme is off", async () => {
    const { db, code } = await referred();
    expect(await record(db, "NOPE1234")).toBe("UNKNOWN_CODE");
    await db.exec(`UPDATE public.brand_loyalty_programs SET is_enabled = false`);
    expect(await record(db, code)).toBe("NOT_OFFERED");
  });

  it("earns at once on an order already paid when it is recorded", async () => {
    const { db, code } = await referred();
    await db.exec(`UPDATE public.orders SET payment_status = 'paid' WHERE id = '${ORDER}'`);
    expect(await record(db, code)).toBe("RECORDED");
    expect(await referral(db)).toBe("rewarded");
    expect((await balance(db, FRIEND)).active_points).toBe(100);
  });
});

describe("who may call it", () => {
  it("lets a signed-in shopper read their own code and nothing else", async () => {
    const db = await database();
    const rights = await db.query<{ routine_name: string; grantee: string }>(
      `SELECT DISTINCT routine_name, grantee FROM information_schema.routine_privileges
        WHERE grantee IN ('anon', 'authenticated', 'PUBLIC')
          AND routine_name IN ('my_referral_code', 'record_order_referral',
            'loyalty_award_referral', 'loyalty_revoke_referral')`,
    );
    expect(rights.rows).toEqual([{ routine_name: "my_referral_code", grantee: "authenticated" }]);
  });
});
