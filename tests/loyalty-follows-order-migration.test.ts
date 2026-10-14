import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import suite from "../supabase/migrations/20260829102904_loyalty_and_abandoned_carts_suite.sql?raw";
import migration from "../supabase/migrations/20261014110000_loyalty_points_follow_the_order.sql?raw";

vi.setConfig({ testTimeout: 60_000 });

// Loyalty points follow the order, whoever wrote it (found 2026-10-14: no store had a single
// point). An order earned only at the storefront's checkout, for a signed-in shopper, when it was
// placed; staff orders never earned, a cancelled order kept its points, held points were never
// released, nothing expired, and the award could not even write to the ledger (an integer invoice
// number joined to ''). This runs the real loyalty tables and functions, then the migration.

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const ORDER = "00000000-0000-4000-8000-0000000000d1";
const SECOND = "00000000-0000-4000-8000-0000000000d2";

/** The loyalty suite's tables and its tier and points-calculation functions, as they were. */
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
    CREATE SCHEMA cron;
    CREATE TABLE cron.job (jobid serial PRIMARY KEY, jobname text UNIQUE, schedule text, command text);
    CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint
      LANGUAGE sql AS $$ INSERT INTO cron.job (jobname, schedule, command) VALUES ($1, $2, $3) RETURNING jobid::bigint $$;
    CREATE FUNCTION cron.unschedule(job_name text) RETURNS boolean
      LANGUAGE sql AS $$ DELETE FROM cron.job WHERE jobname = $1 RETURNING true $$;
    CREATE TABLE public.brands (id uuid PRIMARY KEY);
    CREATE TABLE public.customers (id uuid PRIMARY KEY);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY);
    CREATE TABLE public.order_reviews (id uuid PRIMARY KEY);
    CREATE TABLE public.orders (
      id uuid PRIMARY KEY, brand_id uuid NOT NULL, customer_id uuid, invoice_number integer,
      status text, payment_status text DEFAULT 'unpaid', subtotal numeric NOT NULL DEFAULT 0,
      discount numeric NOT NULL DEFAULT 0, tax_amount numeric NOT NULL DEFAULT 0,
      shipping numeric NOT NULL DEFAULT 0, total numeric NOT NULL DEFAULT 0
    );
    INSERT INTO public.brands VALUES ('${BRAND}');
    INSERT INTO public.customers VALUES ('${CUSTOMER}');
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
  await db.exec(migration);
  if (program) {
    const settings = { holding_period_days: 0, first_order_bonus_points: 0, ...program };
    const cols = Object.keys(settings);
    await db.exec(
      `INSERT INTO public.brand_loyalty_programs (brand_id, ${cols.join(", ")})
       VALUES ('${BRAND}', ${cols.map((c) => `'${settings[c as keyof typeof settings]}'`).join(", ")})`,
    );
  }
  return db;
}

const placeOrder = (
  db: PGlite,
  { id = ORDER, status = "pending", payment = "unpaid", subtotal = 20, invoice = 1090 } = {},
) =>
  db.exec(
    `INSERT INTO public.orders (id, brand_id, customer_id, invoice_number, status, payment_status, subtotal, total)
     VALUES ('${id}', '${BRAND}', '${CUSTOMER}', ${invoice}, '${status}', '${payment}', ${subtotal}, ${subtotal})`,
  );
const setOrder = (db: PGlite, fields: string, id = ORDER) =>
  db.exec(`UPDATE public.orders SET ${fields} WHERE id = '${id}'`);
const account = async (db: PGlite) =>
  (
    await db.query<{ active_points: number; pending_points: number; lifetime_points: number }>(
      `SELECT active_points, pending_points, lifetime_points FROM public.loyalty_accounts WHERE customer_id = '${CUSTOMER}'`,
    )
  ).rows[0];
const ledger = async (db: PGlite) =>
  (
    await db.query<{
      event_type: string;
      points: number;
      points_status: string;
      idempotency_key: string;
      reference_note_en: string;
    }>(
      `SELECT event_type, points, points_status, idempotency_key, reference_note_en
       FROM public.loyalty_ledger ORDER BY created_at, idempotency_key`,
    )
  ).rows;

describe("an order's points", () => {
  it("are earned when a staff order is completed, with its number in the ledger", async () => {
    const db = await database();
    await placeOrder(db, { status: "completed", payment: "paid", subtotal: 20 });
    expect(await account(db)).toMatchObject({ active_points: 200, lifetime_points: 200 });
    const [row] = await ledger(db);
    expect(row).toMatchObject({
      event_type: "earn_order",
      points: 200,
      idempotency_key: `award:${ORDER}`,
    });
    expect(row.reference_note_en).toBe("Points earned for Order #1090");
  });

  it("wait for the order to be paid or completed, then come once", async () => {
    const db = await database();
    await placeOrder(db);
    expect(await ledger(db)).toEqual([]);
    await setOrder(db, "payment_status = 'paid'");
    await setOrder(db, "status = 'completed'");
    expect((await ledger(db)).map((r) => r.points)).toEqual([200]);
    expect((await account(db)).active_points).toBe(200);
  });

  it("come when the stage reaches its end and another trigger sets the status", async () => {
    // The screens write the stage; trg_orders_status_follows_fulfillment sets the status.
    const db = await database();
    await db.exec(`
      ALTER TABLE public.orders ADD COLUMN fulfillment_status text;
      CREATE FUNCTION public.status_follows_stage() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.fulfillment_status = 'DELIVERED' THEN NEW.status := 'completed'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER trg_status_follows_stage BEFORE UPDATE ON public.orders
        FOR EACH ROW EXECUTE FUNCTION public.status_follows_stage();
    `);
    await placeOrder(db, { status: "confirmed" });
    await setOrder(db, "fulfillment_status = 'DELIVERED'");
    expect((await account(db)).active_points).toBe(200);
  });

  it("are not given again to an order the checkout already rewarded", async () => {
    const db = await database();
    await placeOrder(db);
    await db.exec(
      `SELECT public.rpc_award_order_loyalty_points('${BRAND}', '${ORDER}', 'award:${ORDER}')`,
    );
    await setOrder(db, "status = 'completed', payment_status = 'paid'");
    expect((await ledger(db)).length).toBe(1);
    expect((await account(db)).active_points).toBe(200);
  });

  it("are nothing while the store has no programme, and the order still saves", async () => {
    const db = await database(null);
    await placeOrder(db, { status: "completed", payment: "paid" });
    expect(await ledger(db)).toEqual([]);
    expect((await db.query(`SELECT 1 FROM public.orders`)).rows.length).toBe(1);
  });

  it("never stop an order from being saved", async () => {
    // Far more points than an integer holds: the award fails, the order is saved anyway.
    const db = await database({ points_per_currency_unit: 1000000000 });
    await placeOrder(db, { status: "completed", payment: "paid", subtotal: 100 });
    expect(await ledger(db)).toEqual([]);
    expect((await db.query(`SELECT status FROM public.orders`)).rows).toEqual([
      { status: "completed" },
    ]);
  });

  it("are taken back when the order is cancelled, held points first, and come back once if it is restored", async () => {
    const db = await database({ holding_period_days: 14 });
    await placeOrder(db, { status: "completed", payment: "paid" });
    expect(await account(db)).toMatchObject({ pending_points: 200, active_points: 0 });

    await setOrder(db, "status = 'cancelled'");
    expect(await account(db)).toMatchObject({
      pending_points: 0,
      active_points: 0,
      lifetime_points: 0,
    });
    const afterCancel = await ledger(db);
    expect(afterCancel.map((r) => [r.event_type, r.points, r.points_status])).toEqual([
      ["earn_order", 200, "cancelled"],
      ["revoke_cancelled", -200, "cancelled"],
    ]);
    // Cancelled points are never released.
    await db.exec(`UPDATE public.loyalty_ledger SET effective_at = now() - interval '1 day'`);
    await db.exec(`SELECT public.release_due_loyalty_points()`);
    expect((await account(db)).active_points).toBe(0);

    await setOrder(db, "status = 'completed'");
    await setOrder(db, "status = 'completed', payment_status = 'paid'");
    const keys = (await ledger(db)).map((r) => r.idempotency_key);
    expect(keys.filter((k) => k.startsWith("award:"))).toEqual([
      `award:${ORDER}`,
      `award:${ORDER}:2`,
    ]);
    expect((await account(db)).pending_points).toBe(200);
  });

  it("are taken back from the available balance when the payment is refunded later", async () => {
    const db = await database();
    await placeOrder(db, { status: "completed", payment: "paid" });
    await setOrder(db, "payment_status = 'refunded'");
    expect(await account(db)).toMatchObject({ active_points: 0, lifetime_points: 0 });
  });
});

describe("held points", () => {
  it("become available when the holding period is over, not before", async () => {
    const db = await database({ holding_period_days: 14 });
    await placeOrder(db, { status: "completed", payment: "paid" });
    await db.exec(`SELECT public.release_due_loyalty_points()`);
    expect(await account(db)).toMatchObject({ pending_points: 200, active_points: 0 });

    await db.exec(`UPDATE public.loyalty_ledger SET effective_at = now() - interval '1 minute'`);
    await db.exec(`SELECT public.release_due_loyalty_points()`);
    expect(await account(db)).toMatchObject({ pending_points: 0, active_points: 200 });
    expect((await ledger(db))[0].points_status).toBe("active");
  });
});

describe("expired points", () => {
  it("go after what the customer already spent, once", async () => {
    const db = await database({ points_expiry_days: 30 });
    await placeOrder(db, { status: "completed", payment: "paid", subtotal: 10 }); // 100 points
    await placeOrder(db, {
      id: SECOND,
      status: "completed",
      payment: "paid",
      subtotal: 5,
      invoice: 1091,
    }); // 50
    // The first order's points reach their date; the customer spent 30 of them.
    await db.exec(`
      UPDATE public.loyalty_ledger SET expires_at = now() - interval '1 day' WHERE order_id = '${ORDER}';
      UPDATE public.loyalty_accounts SET active_points = active_points - 30;
      INSERT INTO public.loyalty_ledger (brand_id, customer_id, account_id, event_type, points, points_status, idempotency_key)
      SELECT brand_id, customer_id, id, 'redeem_checkout', -30, 'redeemed', 'spent' FROM public.loyalty_accounts;
    `);
    await db.exec(`SELECT public.expire_loyalty_points()`);
    expect((await account(db)).active_points).toBe(50);
    await db.exec(`SELECT public.expire_loyalty_points()`);
    expect((await account(db)).active_points).toBe(50);
    expect(
      (await ledger(db)).filter((r) => r.event_type === "expire_points").map((r) => r.points),
    ).toEqual([-70]);
  });
});

describe("a customer's tier", () => {
  it("counts the orders that count as sold, not the ones still waiting", async () => {
    const db = await database();
    await db.exec(`
      INSERT INTO public.brand_loyalty_tiers (brand_id, tier_key, name_ar, name_en, min_spend, min_points)
      VALUES ('${BRAND}', 'silver', 'فضي', 'Silver', 100, 0);
    `);
    await placeOrder(db, { status: "completed", payment: "paid", subtotal: 20 });
    await placeOrder(db, { id: SECOND, status: "pending", subtotal: 500, invoice: 1091 });
    const tier = async () =>
      (
        await db.query<{ t: string }>(
          `SELECT public.rpc_evaluate_customer_loyalty_tier('${BRAND}', '${CUSTOMER}') AS t`,
        )
      ).rows[0].t;
    expect(await tier()).toBe("bronze");
    await setOrder(db, "status = 'confirmed'", SECOND);
    expect(await tier()).toBe("silver");
  });
});

describe("who runs it", () => {
  it("is the scheduler, never a browser", async () => {
    const db = await database();
    const jobs = (await db.query<{ jobname: string }>(`SELECT jobname FROM cron.job ORDER BY 1`))
      .rows;
    expect(jobs.map((j) => j.jobname)).toEqual([
      "loyalty_expire_nightly",
      "loyalty_release_hourly",
    ]);
    for (const fn of [
      "public.release_due_loyalty_points()",
      "public.expire_loyalty_points()",
      "public.loyalty_revoke_order_points(uuid, text)",
      "public.rpc_award_order_loyalty_points(uuid, uuid, text)",
    ]) {
      for (const role of ["anon", "authenticated"]) {
        const { rows } = await db.query<{ ok: boolean }>(
          `SELECT has_function_privilege('${role}', '${fn}', 'execute') AS ok`,
        );
        expect(rows[0].ok, `${role} ${fn}`).toBe(false);
      }
    }
  });
});
