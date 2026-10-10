import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import stateMachine from "../supabase/migrations/20260926120000_order_inventory_state_machine.sql?raw";
import previousEngine from "../supabase/migrations/20260929100000_drop_stock_deducted_references.sql?raw";
import previousPageData from "../supabase/migrations/20261002180000_storefront_page_data_packages.sql?raw";
import migration from "../supabase/migrations/20261010110000_made_to_order_limit.sql?raw";

// The made-to-order limit in a real Postgres (PGlite), through the order engine itself
// (order_inventory_transition): an order takes pieces from a product's limit, a cancelled order
// gives them back, an order asking for more than is left is refused, and only staff can set
// the number.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000e1";
const OTHER_BRAND = "00000000-0000-4000-8000-0000000000e2";
const STAFF = "00000000-0000-4000-8000-0000000000e9";

let db: PGlite;
let abaya: string;

const functionOf = (sql: string, name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const tag = /\$(\w*)\$/.exec(sql.slice(start))![0];
  const open = sql.indexOf(tag, start);
  const end = sql.indexOf(tag, open + tag.length);
  return sql.slice(start, end + tag.length);
};
const squash = (sql: string) => sql.replace(/\s+/g, " ").trim();
/** A function's body, without the header (whose spelling differs between a migration and pg_get_functiondef). */
const bodyOf = (sql: string, name: string) => {
  const fn = functionOf(sql, name);
  return squash(fn.slice(fn.search(/\bDECLARE\b/)));
};

const one = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];
const available = async (productId = abaya) =>
  (
    await one<{ made_to_order_available: number | null }>(
      "SELECT made_to_order_available FROM public.products WHERE id = $1",
      [productId],
    )
  ).made_to_order_available;
const newProduct = async (brand = BRAND) =>
  (
    await one<{ id: string }>("INSERT INTO public.products (brand_id) VALUES ($1) RETURNING id", [
      brand,
    ])
  ).id;
const asStaff = (brand = BRAND) => db.exec(`SET app.uid = '${STAFF}'; SET app.brand = '${brand}'`);
const setLimit = (value: number | null, productId = abaya) =>
  db.query("SELECT public.set_made_to_order_limit($1, $2)", [productId, value]);

/** Places an order with made-to-order lines (location 'custom') and runs the order engine. */
const placeOrder = async (lines: Array<{ product?: string; quantity: number }>) => {
  const { id } = await one<{ id: string }>(
    "INSERT INTO public.orders (brand_id) VALUES ($1) RETURNING id",
    [BRAND],
  );
  for (const line of lines) {
    await db.query(
      "INSERT INTO public.order_items (order_id, product_id, quantity, location) VALUES ($1, $2, $3, 'custom')",
      [id, line.product ?? abaya, line.quantity],
    );
  }
  return id;
};
const transition = (orderId: string) =>
  db.query("SELECT public.order_inventory_transition($1)", [orderId]);
const setStatus = (orderId: string, status: string) =>
  db.query("UPDATE public.orders SET status = $2 WHERE id = $1", [orderId, status]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
    CREATE FUNCTION public.can_access_brand(b uuid) RETURNS boolean LANGUAGE sql STABLE
      AS $$ SELECT current_setting('app.brand', true) = b::text $$;
    CREATE TABLE public.brands (id uuid PRIMARY KEY);
    INSERT INTO public.brands VALUES ('${BRAND}'), ('${OTHER_BRAND}');
    CREATE TABLE public.products (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
      is_made_to_order boolean NOT NULL DEFAULT true, name text
    );
    CREATE TABLE public.product_variants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid, brand_id uuid,
      stock_main integer DEFAULT 0, stock_incubator integer DEFAULT 0
    );
    CREATE TABLE public.orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
      status text DEFAULT 'pending', payment_status text DEFAULT 'unpaid', payment_method text,
      created_at timestamptz NOT NULL DEFAULT now(),
      inventory_state text NOT NULL DEFAULT 'none', inventory_revision integer NOT NULL DEFAULT 0
    );
    CREATE TABLE public.order_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
      product_id uuid, variant_id uuid, quantity integer NOT NULL DEFAULT 1, location text
    );
    CREATE TABLE public.order_inventory_allocations (
      order_id uuid NOT NULL, variant_id uuid NOT NULL, location text NOT NULL,
      quantity integer NOT NULL, brand_id uuid NOT NULL, PRIMARY KEY (order_id, variant_id, location)
    );
    -- The ledger's stock movement, reduced to what the engine needs of it here.
    CREATE FUNCTION public.apply_inventory_movement(
      p_brand_id uuid, p_variant_id uuid, p_location text, p_delta integer, p_reason text,
      p_reference_type text, p_reference_id uuid, p_idempotency_key text,
      p_actor_id uuid DEFAULT NULL, p_note text DEFAULT NULL
    ) RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      UPDATE public.product_variants SET stock_main = stock_main + p_delta WHERE id = p_variant_id;
    END $$;
  `);
  await db.exec(functionOf(stateMachine, "order_inventory_desired_state") + ";");
  // Everything of the migration except the storefront page data (it needs the whole catalog).
  await db.exec(migration.slice(0, migration.indexOf("-- 7. The storefront's page data")));
  await asStaff();
});

beforeEach(async () => {
  await asStaff();
  abaya = await newProduct();
});

describe("the limit on a product", () => {
  it("is not set to begin with, and an order takes nothing", async () => {
    expect(await available()).toBeNull();
    await transition(await placeOrder([{ quantity: 4 }]));
    expect(await available()).toBeNull();
  });

  it("goes down by the pieces an order asks for", async () => {
    await setLimit(3);
    await transition(await placeOrder([{ quantity: 1 }]));
    expect(await available()).toBe(2);
    await transition(await placeOrder([{ quantity: 2 }]));
    expect(await available()).toBe(0);
  });

  it("refuses an order asking for more than is left, and takes nothing for it", async () => {
    await setLimit(2);
    const order = await placeOrder([{ quantity: 3 }]);
    await expect(transition(order)).rejects.toThrow(`MADE_TO_ORDER_SOLD_OUT:${abaya}`);
    expect(await available()).toBe(2);
  });

  it("counts two lines of the same product together", async () => {
    await setLimit(3);
    const order = await placeOrder([{ quantity: 2 }, { quantity: 2 }]);
    await expect(transition(order)).rejects.toThrow(/MADE_TO_ORDER_SOLD_OUT/);
    expect(await available()).toBe(3);
  });

  it("comes back when the order is cancelled, once", async () => {
    await setLimit(3);
    const order = await placeOrder([{ quantity: 2 }]);
    await transition(order);
    expect(await available()).toBe(1);
    await setStatus(order, "cancelled");
    await transition(order);
    await transition(order);
    expect(await available()).toBe(3);
  });

  it("does not come back when the order is delivered or returned", async () => {
    await setLimit(3);
    const order = await placeOrder([{ quantity: 1 }]);
    await transition(order);
    for (const status of ["confirmed", "sent_to_tailor", "completed", "returned"]) {
      await setStatus(order, status);
      await transition(order);
      expect(await available(), status).toBe(2);
    }
  });

  it("follows an order whose quantity is changed", async () => {
    await setLimit(5);
    const order = await placeOrder([{ quantity: 1 }]);
    await transition(order);
    await db.query("UPDATE public.order_items SET quantity = 3 WHERE order_id = $1", [order]);
    await transition(order);
    expect(await available()).toBe(2);
    await db.query("UPDATE public.order_items SET quantity = 2 WHERE order_id = $1", [order]);
    await transition(order);
    expect(await available()).toBe(3);
  });

  it("is not touched by an order placed before the limit was set", async () => {
    const earlier = await placeOrder([{ quantity: 2 }]);
    await transition(earlier);
    await setLimit(3);
    await setStatus(earlier, "confirmed");
    await transition(earlier);
    expect(await available()).toBe(3);
    await setStatus(earlier, "cancelled");
    await transition(earlier);
    expect(await available()).toBe(3);
  });

  it("keeps each product's own count in one order", async () => {
    const scarf = await newProduct();
    await setLimit(2);
    await setLimit(1, scarf);
    await transition(await placeOrder([{ quantity: 2 }, { product: scarf, quantity: 1 }]));
    expect([await available(), await available(scarf)]).toEqual([0, 0]);
  });

  it("is left alone by a ready-made line of the same product", async () => {
    await setLimit(2);
    const variant = (
      await one<{ id: string }>(
        "INSERT INTO public.product_variants (product_id, brand_id, stock_main) VALUES ($1, $2, 5) RETURNING id",
        [abaya, BRAND],
      )
    ).id;
    const { id } = await one<{ id: string }>(
      "INSERT INTO public.orders (brand_id) VALUES ($1) RETURNING id",
      [BRAND],
    );
    await db.query(
      "INSERT INTO public.order_items (order_id, product_id, variant_id, quantity, location) VALUES ($1, $2, $3, 2, 'main')",
      [id, abaya, variant],
    );
    await transition(id);
    expect(await available()).toBe(2);
    expect(
      (
        await one<{ stock_main: number }>(
          "SELECT stock_main FROM public.product_variants WHERE id = $1",
          [variant],
        )
      ).stock_main,
    ).toBe(3);
  });
});

describe("who can change the number", () => {
  it("staff of the store, through set_made_to_order_limit, with every change recorded", async () => {
    await setLimit(3);
    await transition(await placeOrder([{ quantity: 1 }]));
    await setLimit(null);
    const rows = (
      await db.query<{
        reason: string;
        available_before: number | null;
        available_after: number | null;
      }>(
        "SELECT reason, available_before, available_after FROM public.made_to_order_movements WHERE product_id = $1 ORDER BY created_at, available_after DESC NULLS LAST",
        [abaya],
      )
    ).rows;
    expect(rows).toEqual([
      { reason: "manual_set", available_before: null, available_after: 3 },
      { reason: "order_reserve", available_before: 3, available_after: 2 },
      { reason: "manual_set", available_before: 2, available_after: null },
    ]);
  });

  it("not staff of another store, a visitor, or a negative number", async () => {
    await asStaff(OTHER_BRAND);
    await expect(setLimit(3)).rejects.toThrow(/NOT_AUTHORIZED/);
    await db.exec("SET app.uid = ''");
    await expect(setLimit(3)).rejects.toThrow(/NOT_AUTHORIZED/);
    await asStaff();
    await expect(setLimit(-1)).rejects.toThrow(/INVALID_MADE_TO_ORDER_LIMIT/);
    expect(await available()).toBeNull();
  });

  it("not a direct update of the column (a form saved with an old number)", async () => {
    await setLimit(3);
    await expect(
      db.query("UPDATE public.products SET made_to_order_available = 9 WHERE id = $1", [abaya]),
    ).rejects.toThrow(/DIRECT_MADE_TO_ORDER_LIMIT_UPDATE_FORBIDDEN/);
    // Saving other fields, or the same number, is fine.
    await db.query(
      "UPDATE public.products SET name = 'Abaya', made_to_order_available = 3 WHERE id = $1",
      [abaya],
    );
    expect(await available()).toBe(3);
  });

  it("a visitor's role cannot call the engine or the setter", async () => {
    const { rows } = await db.query<{ fn: string; anon: boolean; authenticated: boolean }>(`
      SELECT p.proname AS fn,
             has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
      FROM pg_proc p
      WHERE p.proname IN ('set_made_to_order_limit', 'order_made_to_order_transition')
      ORDER BY 1`);
    expect(rows).toEqual([
      { fn: "order_made_to_order_transition", anon: false, authenticated: false },
      { fn: "set_made_to_order_limit", anon: false, authenticated: true },
    ]);
  });
});

describe("the two redefined functions change one thing each", () => {
  it("order_inventory_transition gains the made-to-order step and nothing else", () => {
    const before = bodyOf(previousEngine, "order_inventory_transition");
    const after = bodyOf(migration, "order_inventory_transition");
    const added =
      squash(`-- Made-to-order pieces: reserve from, or give back to, each product's limit.
      PERFORM public.order_made_to_order_transition(p_order_id, v_desired_state);`);
    expect(after).toContain(added);
    expect(squash(after.replace(added, ""))).toBe(before);
  });

  it("get_storefront_page_data gains the limit on each product and nothing else", () => {
    const before = bodyOf(previousPageData, "get_storefront_page_data");
    const after = bodyOf(migration, "get_storefront_page_data");
    const added = "'made_to_order_available', p.made_to_order_available,";
    expect(after).toContain(added);
    expect(squash(after.replace(added, ""))).toBe(before);
  });
});
