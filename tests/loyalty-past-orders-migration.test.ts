import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import suite from "../supabase/migrations/20260829102904_loyalty_and_abandoned_carts_suite.sql?raw";
import engine from "../supabase/migrations/20261014110000_loyalty_points_follow_the_order.sql?raw";
import migration from "../supabase/migrations/20261014120000_award_past_order_loyalty_points.sql?raw";

vi.setConfig({ testTimeout: 60_000 });

// The orders a store had before its programme earned anything never pass "completed or paid"
// again, so the engine never gives them points. award_past_order_loyalty_points gives them once,
// dated from the hand-over. The first-order bonus goes to a customer's earliest order that earns
// (it went only to a customer with no other order at all). Runs the real loyalty tables and
// functions, the engine, then this migration.

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const ANA = "00000000-0000-4000-8000-0000000000c1";
const BEA = "00000000-0000-4000-8000-0000000000c2";

function suitePart(from: string, to: string) {
  const start = suite.indexOf(from);
  const end = suite.indexOf(to, start);
  if (start < 0 || end < 0) throw new Error(`suite part not found: ${from}`);
  return suite.slice(start, end);
}

async function database(program: Record<string, unknown> | null = {}) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    CREATE TABLE public.brands (id uuid PRIMARY KEY);
    CREATE TABLE public.customers (id uuid PRIMARY KEY);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY);
    CREATE TABLE public.order_reviews (id uuid PRIMARY KEY);
    CREATE TABLE public.orders (
      id uuid PRIMARY KEY, brand_id uuid NOT NULL, customer_id uuid, invoice_number integer,
      status text, payment_status text DEFAULT 'unpaid', subtotal numeric NOT NULL DEFAULT 0,
      discount numeric NOT NULL DEFAULT 0, tax_amount numeric NOT NULL DEFAULT 0,
      shipping numeric NOT NULL DEFAULT 0, total numeric NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz, completed_at timestamptz
    );
    INSERT INTO public.brands VALUES ('${BRAND}');
    INSERT INTO public.customers VALUES ('${ANA}'), ('${BEA}');
  `);
  await db.exec(
    suitePart(
      "CREATE TABLE IF NOT EXISTS public.brand_loyalty_programs",
      "-- 2. ABANDONED CARTS RECOVERY SCHEMAS",
    ) +
      suitePart(
        "CREATE OR REPLACE FUNCTION public.rpc_calculate_order_loyalty_points",
        "CREATE OR REPLACE FUNCTION public.rpc_award_order_loyalty_points",
      ),
  );
  await db.exec(engine);
  await db.exec(migration);
  if (program) {
    const settings = {
      holding_period_days: 14,
      points_expiry_days: 365,
      first_order_bonus_points: 50,
      ...program,
    };
    const cols = Object.keys(settings);
    // Saved after the orders below, the way a store sets up its programme late.
    (db as unknown as { programSql: string }).programSql =
      `INSERT INTO public.brand_loyalty_programs (brand_id, ${cols.join(", ")})
       VALUES ('${BRAND}', ${cols.map((c) => `'${settings[c as keyof typeof settings]}'`).join(", ")})`;
  }
  return db;
}

/** An order from before the programme: written with no programme, so the engine gives nothing. */
const pastOrder = (
  db: PGlite,
  id: number,
  customer: string,
  {
    status = "completed",
    payment = "paid",
    subtotal = 8,
    daysAgo = 60,
    deliveredDaysAgo = null as number | null,
  } = {},
) =>
  db.exec(
    `INSERT INTO public.orders (id, brand_id, customer_id, invoice_number, status, payment_status, subtotal, total, created_at, delivered_at)
     VALUES ('00000000-0000-4000-8000-${String(id).padStart(12, "0")}', '${BRAND}', '${customer}', ${id},
             '${status}', '${payment}', ${subtotal}, ${subtotal}, now() - interval '${daysAgo} days',
             ${deliveredDaysAgo === null ? "NULL" : `now() - interval '${deliveredDaysAgo} days'`})`,
  );
const saveProgramme = (db: PGlite) => db.exec((db as unknown as { programSql: string }).programSql);
const backfill = async (db: PGlite) =>
  (
    await db.query<{ r: Record<string, unknown> }>(
      `SELECT public.award_past_order_loyalty_points('${BRAND}') AS r`,
    )
  ).rows[0].r;
const accounts = async (db: PGlite) =>
  Object.fromEntries(
    (
      await db.query<{ customer_id: string; active_points: number; pending_points: number }>(
        `SELECT customer_id, active_points, pending_points FROM public.loyalty_accounts`,
      )
    ).rows.map((a) => [a.customer_id, { active: a.active_points, held: a.pending_points }]),
  );
const ledger = async (db: PGlite) =>
  (
    await db.query<{ invoice: number; event_type: string; points: number; points_status: string }>(
      `SELECT o.invoice_number AS invoice, l.event_type, l.points, l.points_status
       FROM public.loyalty_ledger l JOIN public.orders o ON o.id = l.order_id ORDER BY o.invoice_number`,
    )
  ).rows;

describe("points for a store's past orders", () => {
  it("are given once to every completed or paid order, with the first-order bonus", async () => {
    const db = await database();
    await pastOrder(db, 1090, ANA, { subtotal: 8, daysAgo: 60, deliveredDaysAgo: 55 });
    await pastOrder(db, 1099, BEA, { subtotal: 30, daysAgo: 16, deliveredDaysAgo: 8 });
    await pastOrder(db, 1100, BEA, {
      status: "pending",
      payment: "unpaid",
      subtotal: 99,
      daysAgo: 1,
    });
    await saveProgramme(db);

    expect(await backfill(db)).toEqual({ success: true, orders: 2, points: 480 });
    expect(await ledger(db)).toEqual([
      { invoice: 1090, event_type: "earn_first_order", points: 130, points_status: "active" },
      { invoice: 1099, event_type: "earn_first_order", points: 350, points_status: "pending" },
    ]);
    // 1090 was handed over 55 days ago: past its 14 days, available now. 1099, 8 days ago: held.
    expect(await accounts(db)).toEqual({
      [ANA]: { active: 130, held: 0 },
      [BEA]: { active: 0, held: 350 },
    });

    expect(await backfill(db)).toEqual({ success: true, orders: 0, points: 0 });
    expect((await ledger(db)).length).toBe(2);
  });

  it("dates the expiry from the hand-over too", async () => {
    const db = await database({ points_expiry_days: 30 });
    await pastOrder(db, 1090, ANA, { daysAgo: 60, deliveredDaysAgo: 55 });
    await saveProgramme(db);
    await backfill(db);
    // Handed over 55 days ago, held 14, then 30 days: expired 11 days ago.
    await db.exec(`SELECT public.expire_loyalty_points()`);
    expect((await accounts(db))[ANA]).toEqual({ active: 0, held: 0 });
  });

  it("does nothing while the store's programme is not on", async () => {
    const db = await database(null);
    await pastOrder(db, 1090, ANA);
    expect(await backfill(db)).toEqual({ success: false, error: "PROGRAMME_NOT_ON" });
    expect(await ledger(db)).toEqual([]);
  });

  it("leaves alone an order the engine already rewarded", async () => {
    const db = await database();
    await saveProgramme(db);
    await pastOrder(db, 1090, ANA, { daysAgo: 1 }); // completed with the programme on: the engine gives it
    expect((await ledger(db)).length).toBe(1);
    expect(await backfill(db)).toEqual({ success: true, orders: 0, points: 0 });
    expect((await ledger(db)).length).toBe(1);
  });

  it("is run by the owner, never by a browser", async () => {
    const db = await database();
    for (const role of ["anon", "authenticated"]) {
      const { rows } = await db.query<{ ok: boolean }>(
        `SELECT has_function_privilege('${role}', 'public.award_past_order_loyalty_points(uuid)', 'execute') AS ok`,
      );
      expect(rows[0].ok, role).toBe(false);
    }
  });
});

describe("the first-order bonus", () => {
  it("goes to a customer's earliest order that earns, once, even with more orders", async () => {
    const db = await database();
    await pastOrder(db, 1090, ANA, { subtotal: 8, daysAgo: 60, deliveredDaysAgo: 55 });
    await pastOrder(db, 1095, ANA, { subtotal: 20, daysAgo: 40, deliveredDaysAgo: 35 });
    await saveProgramme(db);
    await backfill(db);
    expect((await ledger(db)).map((r) => [r.invoice, r.event_type, r.points])).toEqual([
      [1090, "earn_first_order", 130],
      [1095, "earn_order", 200],
    ]);

    // A later order completed live earns no second bonus.
    await pastOrder(db, 1101, ANA, { subtotal: 5, daysAgo: 0 });
    expect((await ledger(db)).at(-1)).toMatchObject({
      invoice: 1101,
      event_type: "earn_order",
      points: 50,
    });
  });
});
