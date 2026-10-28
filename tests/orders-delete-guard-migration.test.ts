import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261028170000_orders_delete_guard.sql?raw";
import { orderDeletable } from "../src/lib/order-deletion";

// A paid or handed-over order is never deleted by a person (migration 20261028170000), run in a
// real Postgres: the table's one policy let any member of a store's staff delete an order through
// the API, and the app's rule (`orderDeletable`) was only in two server functions. The trigger is
// the rule's twin: run here against it over every combination, as a person and as the server.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.brands (id uuid PRIMARY KEY);
    INSERT INTO public.brands VALUES ('${BRAND}');
    CREATE TABLE public.orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
      status text, fulfillment_status text, payment_status text, advance_paid numeric DEFAULT 0);
    CREATE TABLE public.stock_log (order_id uuid);
    -- The stock-restoring trigger the real table has: it must not run for a refused delete.
    CREATE FUNCTION public.orders_restore_stock_on_delete() RETURNS trigger LANGUAGE plpgsql
      AS $$ BEGIN INSERT INTO public.stock_log VALUES (OLD.id); RETURN OLD; END $$;
    CREATE TRIGGER trg_orders_restore_stock_on_delete BEFORE DELETE ON public.orders
      FOR EACH ROW EXECUTE FUNCTION public.orders_restore_stock_on_delete();
    GRANT ALL ON public.orders, public.brands, public.stock_log TO anon, authenticated, service_role;
  `);
  await db.exec(migration);
});

type Row = {
  status: string | null;
  fulfillment_status: string | null;
  payment_status: string | null;
  advance_paid: number;
};

async function insert(row: Row): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.orders (brand_id, status, fulfillment_status, payment_status, advance_paid)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [BRAND, row.status, row.fulfillment_status, row.payment_status, row.advance_paid],
  );
  return rows[0].id;
}

/** Deletes the order as a role; null when it went, else the database's refusal. */
async function deleteAs(role: string, id: string): Promise<string | null> {
  await db.exec(`SET ROLE ${role}`);
  try {
    await db.query(`DELETE FROM public.orders WHERE id = $1`, [id]);
    return null;
  } catch (error) {
    return String((error as Error).message);
  } finally {
    await db.exec(`RESET ROLE`);
  }
}

const exists = async (id: string) =>
  ((await db.query(`SELECT 1 FROM public.orders WHERE id = $1`, [id])).rows.length ?? 0) > 0;

describe("deleting an order through the API", () => {
  const paid: Row = {
    status: "confirmed",
    fulfillment_status: "PACKING",
    payment_status: "paid",
    advance_paid: 30,
  };
  const unpaid: Row = {
    status: "cancelled",
    fulfillment_status: "CANCELLED",
    payment_status: "unpaid",
    advance_paid: 0,
  };

  it("is refused for a paid order, which stays, and the stock trigger never runs", async () => {
    const id = await insert(paid);
    expect(await deleteAs("authenticated", id)).toMatch(/ORDER_NOT_DELETABLE/);
    expect(await exists(id)).toBe(true);
    const { rows } = await db.query(`SELECT 1 FROM public.stock_log WHERE order_id = $1`, [id]);
    expect(rows).toHaveLength(0);
  });

  it("goes through for an order that took nothing", async () => {
    const id = await insert(unpaid);
    expect(await deleteAs("authenticated", id)).toBeNull();
    expect(await exists(id)).toBe(false);
  });

  it("is refused the same for the anonymous role", async () => {
    const id = await insert(paid);
    expect(await deleteAs("anon", id)).toBeTruthy();
    expect(await exists(id)).toBe(true);
  });

  it("is not held against the server: the service role and a cascade from a store's removal", async () => {
    const byServer = await insert(paid);
    expect(await deleteAs("service_role", byServer)).toBeNull();
    expect(await exists(byServer)).toBe(false);

    const kept = await insert(paid);
    await db.exec(`INSERT INTO public.brands VALUES ('00000000-0000-4000-8000-0000000000b2')`);
    await db.query(
      `INSERT INTO public.orders (brand_id, status, payment_status, advance_paid)
       VALUES ('00000000-0000-4000-8000-0000000000b2', 'completed', 'paid', 10)`,
    );
    await db.exec(`SET ROLE authenticated`);
    await db.exec(`DELETE FROM public.brands WHERE id = '00000000-0000-4000-8000-0000000000b2'`);
    await db.exec(`RESET ROLE`);
    const left = await db.query(
      `SELECT count(*)::int AS n FROM public.orders WHERE brand_id = '00000000-0000-4000-8000-0000000000b2'`,
    );
    expect(left.rows[0]).toEqual({ n: 0 });
    expect(await exists(kept)).toBe(true);
  });

  it("holds the app's rule, `orderDeletable`, over every combination", async () => {
    const statuses = ["pending", "draft", "cancelled", "completed", "refunded", "confirmed"];
    const stages = [
      null,
      "ON_HOLD",
      "NEEDS_PACKING",
      "COMPLETED",
      "DELIVERED",
      "SHIPPED",
      "RETURNED",
      "PICKED_UP",
    ];
    const payments = ["unpaid", "pending", "paid", "partially_paid", "refunded", "failed", null];
    const mismatches: string[] = [];
    let checked = 0;
    for (const status of statuses) {
      for (const fulfillment_status of stages) {
        for (const payment_status of payments) {
          for (const advance_paid of [0, 5]) {
            const row = { status, fulfillment_status, payment_status, advance_paid };
            const id = await insert(row);
            const refused = (await deleteAs("authenticated", id)) !== null;
            const app = orderDeletable(row);
            if (refused === app) mismatches.push(JSON.stringify(row));
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBe(6 * 8 * 7 * 2);
    expect(mismatches).toEqual([]);
  });

  it("withdraws a privilege the anonymous role never needed", async () => {
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.role_table_grants
        WHERE table_name = 'orders' AND privilege_type = 'DELETE' AND grantee = 'anon'`,
    );
    expect(rows[0].n).toBe(0);
  });
});
