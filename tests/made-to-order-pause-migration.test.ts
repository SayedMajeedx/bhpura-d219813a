import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import stateMachine from "../supabase/migrations/20260926120000_order_inventory_state_machine.sql?raw";
import limit from "../supabase/migrations/20261010110000_made_to_order_limit.sql?raw";
import migration from "../supabase/migrations/20261010120000_made_to_order_pause.sql?raw";

// Pausing a made-to-order product in a real Postgres (PGlite), through the order engine itself
// (order_inventory_transition): a shopper's order placed during the pause is refused, earlier
// orders and staff orders go on, the limit keeps its number, and only staff can pause.
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
const placeOrder = async (
  lines: Array<{ product?: string; quantity: number }>,
  channel = "storefront",
) => {
  const { id } = await one<{ id: string }>(
    "INSERT INTO public.orders (brand_id, channel) VALUES ($1, $2) RETURNING id",
    [BRAND, channel],
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
      channel text NOT NULL DEFAULT 'storefront',
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
  await db.exec(limit.slice(0, limit.indexOf("-- 7. The storefront's page data")));
  await db.exec(migration.slice(0, migration.indexOf("-- 5. The storefront's page data")));
  await asStaff();
});

beforeEach(async () => {
  await asStaff();
  abaya = await newProduct();
});

const pause = (paused: boolean, productId = abaya) =>
  db.query("SELECT public.set_made_to_order_paused($1, $2)", [productId, paused]);
const pausedAt = async (productId = abaya) =>
  (
    await one<{ made_to_order_paused_at: string | null }>(
      "SELECT made_to_order_paused_at FROM public.products WHERE id = $1",
      [productId],
    )
  ).made_to_order_paused_at;

describe("pausing a made-to-order product", () => {
  it("refuses a shopper's order placed during the pause, with or without a limit", async () => {
    await pause(true);
    await expect(transition(await placeOrder([{ quantity: 1 }]))).rejects.toThrow(
      `MADE_TO_ORDER_PAUSED:${abaya}`,
    );
    await setLimit(5);
    await expect(transition(await placeOrder([{ quantity: 1 }]))).rejects.toThrow(
      /MADE_TO_ORDER_PAUSED/,
    );
    expect(await available()).toBe(5);
  });

  it("lets an order placed before the pause go on, and be cancelled", async () => {
    await setLimit(3);
    const earlier = await placeOrder([{ quantity: 1 }]);
    await transition(earlier);
    await pause(true);
    for (const status of ["confirmed", "sent_to_tailor", "completed"]) {
      await setStatus(earlier, status);
      await transition(earlier);
    }
    expect(await available()).toBe(2);
    await setStatus(earlier, "cancelled");
    await transition(earlier);
    expect(await available()).toBe(3);
  });

  it("does not stop an order staff make themselves, which still counts against the limit", async () => {
    await setLimit(2);
    await pause(true);
    await transition(await placeOrder([{ quantity: 1 }], "admin"));
    expect(await available()).toBe(1);
  });

  it("takes orders again when resumed, with the limit as it was", async () => {
    await setLimit(4);
    await pause(true);
    await pause(false);
    expect(await pausedAt()).toBeNull();
    await transition(await placeOrder([{ quantity: 1 }]));
    expect(await available()).toBe(3);
  });

  it("refuses the whole order when one of its products is paused", async () => {
    const scarf = await newProduct();
    await pause(true, scarf);
    await setLimit(2);
    await expect(
      transition(await placeOrder([{ quantity: 1 }, { product: scarf, quantity: 1 }])),
    ).rejects.toThrow(`MADE_TO_ORDER_PAUSED:${scarf}`);
    expect(await available()).toBe(2);
  });
});

describe("who can pause", () => {
  it("staff of the store, with each pause and resume recorded once", async () => {
    await setLimit(3);
    await pause(true);
    await pause(true);
    await pause(false);
    const rows = (
      await db.query<{ reason: string; available_after: number | null }>(
        "SELECT reason, available_after FROM public.made_to_order_movements WHERE product_id = $1 AND reason IN ('paused', 'resumed') ORDER BY reason",
        [abaya],
      )
    ).rows;
    expect(rows).toEqual([
      { reason: "paused", available_after: 3 },
      { reason: "resumed", available_after: 3 },
    ]);
  });

  it("not staff of another store or a visitor, and not a direct update", async () => {
    await asStaff(OTHER_BRAND);
    await expect(pause(true)).rejects.toThrow(/NOT_AUTHORIZED/);
    await db.exec("SET app.uid = ''");
    await expect(pause(true)).rejects.toThrow(/NOT_AUTHORIZED/);
    await asStaff();
    await expect(
      db.query("UPDATE public.products SET made_to_order_paused_at = now() WHERE id = $1", [abaya]),
    ).rejects.toThrow(/DIRECT_MADE_TO_ORDER_LIMIT_UPDATE_FORBIDDEN/);
    expect(await pausedAt()).toBeNull();
  });

  it("a visitor's role cannot call it", async () => {
    const row = await one<{ anon: boolean; authenticated: boolean }>(`
      SELECT has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
      FROM pg_proc p WHERE p.proname = 'set_made_to_order_paused'`);
    expect(row).toEqual({ anon: false, authenticated: true });
  });
});

describe("the two redefined functions change only what the pause needs", () => {
  it("order_made_to_order_transition gains the pause rule", () => {
    const before = bodyOf(limit, "order_made_to_order_transition");
    const after = bodyOf(migration, "order_made_to_order_transition");
    expect(after).toContain("RAISE EXCEPTION 'MADE_TO_ORDER_PAUSED:%', v_row.product_id;");
    const withoutPause = squash(
      after
        .replace(
          /-- Paused: a shopper's order placed since the pause.*?END IF; (?=v_target := CASE)/,
          "",
        )
        .replace(
          "WHERE p.id = v_row.product_id AND (p.made_to_order_available IS NOT NULL OR p.made_to_order_paused_at IS NOT NULL)",
          "WHERE p.id = v_row.product_id AND p.made_to_order_available IS NOT NULL",
        ),
    );
    expect(withoutPause).toBe(before);
  });

  it("get_storefront_page_data gains one key", () => {
    const before = bodyOf(limit, "get_storefront_page_data");
    const after = bodyOf(migration, "get_storefront_page_data");
    const added = "'made_to_order_paused_at', p.made_to_order_paused_at,";
    expect(after).toContain(added);
    expect(squash(after.replace(added, ""))).toBe(before);
  });
});
