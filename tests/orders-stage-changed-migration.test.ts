import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261028180000_orders_stage_changed_at.sql?raw";

// When an order last changed what the team has to do with it (migration 20261028180000), run in a
// real Postgres: existing orders are given the time of their latest recorded change without
// touching anything else, and from then on the database moves it for a change of status, stage,
// payment or way of reaching the customer, and for no other write.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const A = "00000000-0000-4000-8000-00000000a001"; // has stage changes in the log
const B = "00000000-0000-4000-8000-00000000a002"; // only unrelated log entries
const C = "00000000-0000-4000-8000-00000000a003"; // no log at all
const D = "00000000-0000-4000-8000-00000000a004"; // nothing at all: created_at only

let db: PGlite;

const stageOf = async (id: string) => {
  const { rows } = await db.query<{ s: string | null; u: string }>(
    `SELECT stage_changed_at::text AS s, updated_at::text AS u FROM public.orders WHERE id = $1`,
    [id],
  );
  return rows[0];
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    SET TIME ZONE 'UTC';
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      status text, fulfillment_status text, payment_status text, fulfillment_method text,
      notes text, shipping numeric DEFAULT 0,
      created_at timestamptz DEFAULT now(), updated_at timestamptz);
    -- The table's own trigger that moves updated_at on every write: the backfill must not run it.
    CREATE FUNCTION public.touch() RETURNS trigger LANGUAGE plpgsql
      AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
    CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders
      FOR EACH ROW EXECUTE FUNCTION public.touch();
    CREATE TABLE public.activity_logs (order_id uuid, action text, created_at timestamptz);

    INSERT INTO public.orders (id, status, fulfillment_status, payment_status, fulfillment_method,
      created_at, updated_at) VALUES
      ('${A}', 'confirmed', 'PACKING', 'paid', 'delivery', '2026-10-01', '2026-10-27'),
      ('${B}', 'pending', 'ON_HOLD', 'unpaid', 'pickup', '2026-10-02', '2026-10-20'),
      ('${C}', 'pending', 'ON_HOLD', 'unpaid', 'delivery', '2026-10-03', '2026-10-21'),
      ('${D}', 'pending', 'ON_HOLD', 'unpaid', 'delivery', '2026-10-04', NULL);
    INSERT INTO public.activity_logs VALUES
      ('${A}', 'order_created', '2026-10-01 10:00+00'),
      ('${A}', 'fulfillment_status_changed', '2026-10-05 10:00+00'),
      ('${A}', 'payment_status_changed', '2026-10-08 10:00+00'),
      ('${A}', 'booking_reminder', '2026-10-26 10:00+00'),
      ('${B}', 'booking_reminder', '2026-10-25 10:00+00');
  `);
  await db.exec(migration);
});

describe("existing orders", () => {
  it("are given the time of their latest recorded change, not of an unrelated entry", async () => {
    expect((await stageOf(A)).s).toBe("2026-10-08 10:00:00+00");
  });

  it("else the time they were last written, else created", async () => {
    expect((await stageOf(B)).s).toBe("2026-10-20 00:00:00+00");
    expect((await stageOf(C)).s).toBe("2026-10-21 00:00:00+00");
    expect((await stageOf(D)).s).toBe("2026-10-04 00:00:00+00");
  });

  it("without touching updated_at or any other column the table's triggers keep", async () => {
    expect((await stageOf(A)).u).toBe("2026-10-27 00:00:00+00");
    expect((await stageOf(D)).u).toBeNull();
  });
});

describe("from then on", () => {
  const change = (id: string, set: string) =>
    db.query(`UPDATE public.orders SET ${set} WHERE id = $1`, [id]);

  it("a new order starts now, whatever it sent", async () => {
    const { rows } = await db.query<{ id: string; s: string }>(
      `INSERT INTO public.orders (status, stage_changed_at)
       VALUES ('pending', '2001-01-01') RETURNING id, stage_changed_at::text AS s`,
    );
    expect(rows[0].s.startsWith("2001")).toBe(false);
  });

  /** Puts the stamp back to a day long ago, bypassing the trigger (as only the table's owner can). */
  const age = async (id: string) => {
    await db.exec(`ALTER TABLE public.orders DISABLE TRIGGER USER`);
    await db.query(`UPDATE public.orders SET stage_changed_at = '2020-01-01' WHERE id = $1`, [id]);
    await db.exec(`ALTER TABLE public.orders ENABLE TRIGGER USER`);
  };

  it("moves for a change of status, stage, payment or way of reaching the customer", async () => {
    for (const set of [
      "status = 'confirmed'",
      "fulfillment_status = 'SHIPPED'",
      "payment_status = 'partially_paid'",
      "fulfillment_method = 'delivery'",
    ]) {
      await age(B);
      await change(B, set);
      const year = new Date((await stageOf(B)).s as string).getFullYear();
      expect(year, set).toBeGreaterThanOrEqual(2026);
    }
  });

  it("stays for any other write: a note, a fee, a stage written again as it was", async () => {
    const before = (await stageOf(A)).s;
    await change(A, `notes = 'call the customer'`);
    await change(A, `shipping = 2`);
    await change(A, `fulfillment_status = 'PACKING'`);
    expect((await stageOf(A)).s).toBe(before);
  });

  it("ignores a value a browser writes", async () => {
    const before = (await stageOf(C)).s;
    await change(C, `stage_changed_at = '2001-01-01', notes = 'x'`);
    expect((await stageOf(C)).s).toBe(before);
  });

  it("is not a function a browser can call", async () => {
    const { rows } = await db.query<{ ok: boolean }>(
      `SELECT has_function_privilege('authenticated', 'public.orders_track_stage_change()', 'EXECUTE') AS ok`,
    );
    expect(rows[0].ok).toBe(false);
  });
});
