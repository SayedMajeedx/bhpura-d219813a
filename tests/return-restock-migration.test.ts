import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import ledger from "../supabase/migrations/20260926110000_inventory_ledger_functions.sql?raw";
import previous from "../supabase/migrations/20260925113000_fix_return_and_cart_stock_columns.sql?raw";
import migration from "../supabase/migrations/20261010130000_return_restock_through_ledger.sql?raw";

// Putting a returned piece back into stock, in a real Postgres (PGlite) with the real stock ledger
// and its guard: the function as it was could not restock at all, and the fix restocks a ready
// piece through the ledger, once, and never a piece that was made to order.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000f1";
const BRANCH = "00000000-0000-4000-8000-0000000000f2";
const STAFF = "00000000-0000-4000-8000-0000000000f9";

let db: PGlite;
let variant: string;

const functionOf = (sql: string, name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const tag = /\$(\w*)\$/.exec(sql.slice(start))![0];
  const open = sql.indexOf(tag, start);
  const end = sql.indexOf(tag, open + tag.length);
  return sql.slice(start, end + tag.length);
};

const one = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];
const stock = async () =>
  (
    await one<{ stock_main: number }>(
      "SELECT stock_main FROM public.product_variants WHERE id = $1",
      [variant],
    )
  ).stock_main;

/** A returned piece of `quantity`, from a ready line or a made-to-order ("custom") one. */
const returned = async (location: "main" | "custom", quantity = 1) => {
  const line = await one<{ id: string }>(
    "INSERT INTO public.order_items (location) VALUES ($1) RETURNING id",
    [location],
  );
  const request = await one<{ id: string }>(
    "INSERT INTO public.return_requests (brand_id, return_number) VALUES ($1, 'RET-1') RETURNING id",
    [BRAND],
  );
  const item = await one<{ id: string }>(
    "INSERT INTO public.return_items (brand_id, return_id, order_item_id, variant_id, quantity) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [BRAND, request.id, line.id, variant, quantity],
  );
  return item.id;
};
const inspect = async (itemId: string, condition: string) =>
  (
    await one<{ r: Record<string, unknown> }>(
      "SELECT public.rpc_inspect_and_restock_return_item($1, $2, $3) AS r",
      [BRAND, itemId, condition],
    )
  ).r;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${STAFF}'::uuid $$;
    CREATE FUNCTION public.can_access_brand(b uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.has_permission(p text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE public.product_variants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
      stock_main integer DEFAULT 0, stock_incubator integer DEFAULT 0, updated_at timestamptz
    );
    CREATE TABLE public.inventory_movements (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, variant_id uuid NOT NULL,
      location text NOT NULL, delta integer NOT NULL, balance_after integer NOT NULL,
      reason text NOT NULL, reference_type text, reference_id uuid, idempotency_key text NOT NULL,
      actor_id uuid, note text, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (brand_id, idempotency_key)
    );
    CREATE TABLE public.branches (
      id uuid PRIMARY KEY, brand_id uuid, is_active boolean DEFAULT true,
      sort_order integer DEFAULT 0, created_at timestamptz DEFAULT now()
    );
    INSERT INTO public.branches (id, brand_id) VALUES ('${BRANCH}', '${BRAND}');
    CREATE TABLE public.order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), location text);
    CREATE TABLE public.return_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, return_number text,
      status text DEFAULT 'approved', inspected_at timestamptz, inspected_by uuid
    );
    CREATE TABLE public.return_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, return_id uuid,
      order_item_id uuid, variant_id uuid, quantity integer NOT NULL DEFAULT 1,
      condition text NOT NULL DEFAULT 'pending', restocked boolean NOT NULL DEFAULT false,
      restocked_quantity integer, restocked_at timestamptz, restocked_to_branch_id uuid,
      restocked_by uuid, inspection_notes text
    );
    CREATE TABLE public.inventory_movement_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, variant_id uuid, branch_id uuid,
      return_id uuid, return_item_id uuid, quantity_before integer, quantity_changed integer,
      quantity_after integer, movement_type text, item_condition text, handled_by uuid,
      reference_code text, created_at timestamptz DEFAULT now()
    );
  `);
  // The real ledger function and the real guard against direct stock writes.
  await db.exec(functionOf(ledger, "apply_inventory_movement") + ";");
  await db.exec(functionOf(ledger, "trg_guard_product_variants_stock_update") + ";");
  await db.exec(`
    CREATE TRIGGER trg_guard_product_variants_stock_update
    BEFORE UPDATE OF stock_main, stock_incubator ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.trg_guard_product_variants_stock_update();
  `);
  await db.exec(functionOf(previous, "rpc_inspect_and_restock_return_item") + ";");
});

beforeEach(async () => {
  variant = (
    await one<{ id: string }>(
      "INSERT INTO public.product_variants (brand_id, stock_main) VALUES ($1, 2) RETURNING id",
      [BRAND],
    )
  ).id;
});

describe("before the fix", () => {
  it("could not put a sellable piece back at all", async () => {
    await expect(inspect(await returned("main"), "sellable")).rejects.toThrow();
    expect(await stock()).toBe(2);
  });
});

describe("after the fix", () => {
  beforeAll(async () => {
    await db.exec(migration);
  });

  it("puts a ready piece back through the stock ledger", async () => {
    const item = await returned("main", 2);
    const result = await inspect(item, "sellable");
    expect(result).toMatchObject({ success: true, restocked: true, made_to_order: false });
    expect(await stock()).toBe(4);
    const movement = await one<{ reason: string; delta: number; balance_after: number }>(
      "SELECT reason, delta, balance_after FROM public.inventory_movements WHERE variant_id = $1",
      [variant],
    );
    expect(movement).toEqual({ reason: "return_restock", delta: 2, balance_after: 4 });
    const row = await one<{ restocked: boolean; restocked_quantity: number; condition: string }>(
      "SELECT restocked, restocked_quantity, condition FROM public.return_items WHERE id = $1",
      [item],
    );
    expect(row).toEqual({ restocked: true, restocked_quantity: 2, condition: "sellable" });
  });

  it("does not restock the same returned piece twice", async () => {
    const item = await returned("main");
    await inspect(item, "sellable");
    expect(await inspect(item, "sellable")).toMatchObject({
      success: false,
      error: "ITEM_ALREADY_RESTOCKED",
    });
    expect(await stock()).toBe(3);
  });

  it("never puts a made-to-order piece into ready stock, even in sellable condition", async () => {
    const item = await returned("custom");
    const result = await inspect(item, "sellable");
    expect(result).toMatchObject({ success: true, restocked: false, made_to_order: true });
    expect(await stock()).toBe(2);
    const row = await one<{ restocked: boolean; condition: string }>(
      "SELECT restocked, condition FROM public.return_items WHERE id = $1",
      [item],
    );
    expect(row).toEqual({ restocked: false, condition: "sellable" });
  });

  it("leaves stock alone for a damaged piece, as before", async () => {
    const result = await inspect(await returned("main"), "damaged");
    expect(result).toMatchObject({ success: true, restocked: false });
    expect(await stock()).toBe(2);
  });

  it("is the previous function with only the stock change and the made-to-order rule", () => {
    const squash = (sql: string) => sql.replace(/\s+/g, " ").trim();
    const body = (sql: string) => {
      const fn = functionOf(sql, "rpc_inspect_and_restock_return_item");
      return squash(fn.slice(fn.search(/\bDECLARE\b/)));
    };
    const after = body(migration);
    expect(after).not.toContain("is_active = CASE");
    expect(after).not.toMatch(/UPDATE public\.product_variants/);
    // Take the three changes out and what is left is the previous definition.
    const restored = squash(
      after
        .replace("v_made_to_order BOOLEAN := false; ", "")
        .replace(
          /-- A piece that was made to order.*?p_note => 'Return restocked' \);/,
          "IF p_condition = 'sellable' AND v_item.variant_id IS NOT NULL THEN v_qty_after := v_qty_before + v_item.quantity; UPDATE public.product_variants SET stock_main = v_qty_after, is_active = CASE WHEN v_qty_after > 0 THEN true ELSE is_active END, updated_at = NOW() WHERE id = v_item.variant_id;",
        )
        .replace(
          "'restocked', (p_condition = 'sellable' AND v_item.variant_id IS NOT NULL AND NOT v_made_to_order), 'made_to_order', v_made_to_order,",
          "'restocked', (p_condition = 'sellable'),",
        ),
    );
    expect(restored).toBe(body(previous));
  });
});
