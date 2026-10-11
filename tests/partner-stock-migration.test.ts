import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import ledgerFunctions from "../supabase/migrations/20260926110000_inventory_ledger_functions.sql?raw";
import stateMachine from "../supabase/migrations/20260926120000_order_inventory_state_machine.sql?raw";
import reconciliation from "../supabase/migrations/20260926130000_inventory_reconciliation_job.sql?raw";
import engine from "../supabase/migrations/20260929100000_drop_stock_deducted_references.sql?raw";
import migration from "../supabase/migrations/20261012160000_partner_stock_has_one_source.sql?raw";

// Pieces held at partners have one source, and opening stock reaches the ledger (migration
// 20261012160000). Run in a real Postgres (PGlite) with the real order engine, partner
// transfer and return, direct-write guard and nightly reconciliation, on a small copy of the
// tables they touch.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const STAFF = "00000000-0000-4000-8000-0000000000aa";

let db: PGlite;
let product: string;
let partnerA: string;
let partnerB: string;
/** A variant created before the migration, with opening stock: the fault as it was. */
let before: string;

const functionOf = (sql: string, name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const tag = /\$(\w*)\$/.exec(sql.slice(start))![0];
  const open = sql.indexOf(tag, start);
  const end = sql.indexOf(tag, open + tag.length);
  return `${sql.slice(start, end + tag.length)};`;
};

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
  CREATE FUNCTION public.can_access_brand(b uuid) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT current_setting('app.brand', true) = b::text $$;
  CREATE FUNCTION public.has_permission(p text) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT current_setting('app.permission', true) = p $$;
  CREATE TABLE public.brands (id uuid PRIMARY KEY);
  INSERT INTO public.brands VALUES ('${BRAND}'), ('${OTHER}');
  CREATE TABLE public.products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL);
  CREATE TABLE public.product_variants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid REFERENCES public.products(id),
    brand_id uuid, stock_main integer DEFAULT 0, stock_incubator integer DEFAULT 0,
    stock integer DEFAULT 0, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  );
  CREATE FUNCTION public.product_variants_sync_stock() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN NEW.stock := COALESCE(NEW.stock_main, 0) + COALESCE(NEW.stock_incubator, 0); RETURN NEW; END $$;
  CREATE TRIGGER trg_product_variants_sync_stock BEFORE INSERT OR UPDATE OF stock_main, stock_incubator
    ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.product_variants_sync_stock();
  CREATE TABLE public.inventory_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, variant_id uuid NOT NULL,
    location text NOT NULL, delta integer NOT NULL, balance_after integer NOT NULL CHECK (balance_after >= 0),
    reason text NOT NULL, reference_type text, reference_id uuid, idempotency_key text NOT NULL,
    actor_id uuid, note text, created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX uq_inventory_movements_brand_idempotency
    ON public.inventory_movements (brand_id, idempotency_key);
  CREATE TABLE public.inventory_reconciliation_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, started_at timestamptz,
    finished_at timestamptz, variants_checked integer, drift_count integer, details jsonb
  );
  CREATE TABLE public.incubators (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, name text,
    is_active boolean NOT NULL DEFAULT true, commission_type text NOT NULL DEFAULT 'percentage',
    commission_value numeric NOT NULL DEFAULT 0
  );
  CREATE TABLE public.incubator_inventory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
    incubator_id uuid NOT NULL REFERENCES public.incubators(id) ON DELETE CASCADE,
    variant_id uuid NOT NULL, external_code text, quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    consignment_price numeric NOT NULL DEFAULT 0, commission_type text NOT NULL DEFAULT 'percentage',
    commission_value numeric NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (incubator_id, variant_id)
  );
  CREATE TABLE public.incubator_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, incubator_id uuid NOT NULL,
    variant_id uuid NOT NULL, movement_type text NOT NULL, quantity_delta integer NOT NULL,
    reference_type text, reference_id uuid, notes text, created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT incubator_movements_movement_type_check CHECK (
      movement_type = ANY (ARRAY['transfer_in', 'return', 'sale', 'sale_reversal', 'adjustment'])
    )
  );
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
    status text DEFAULT 'confirmed', payment_status text DEFAULT 'paid', payment_method text DEFAULT 'card',
    inventory_state text NOT NULL DEFAULT 'none', inventory_revision integer NOT NULL DEFAULT 0
  );
  CREATE TABLE public.order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    variant_id uuid, quantity integer NOT NULL DEFAULT 1, location text
  );
  CREATE TABLE public.order_inventory_allocations (
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE, variant_id uuid NOT NULL,
    location text NOT NULL, quantity integer NOT NULL, brand_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (order_id, variant_id, location)
  );
`;

const one = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];
const asStaff = (brand = BRAND, permission = "manage_inventory") =>
  db.exec(
    `SET app.uid = '${STAFF}'; SET app.brand = '${brand}'; SET app.permission = '${permission}'`,
  );
/** A caller with no session: a checkout, a trigger or the nightly job. */
const asServer = () => db.exec("SET app.uid = ''; SET app.brand = ''; SET app.permission = ''");

const newVariant = async (main: number, atPartners = 0) =>
  (
    await one<{ id: string }>(
      "INSERT INTO public.product_variants (product_id, brand_id, stock_main, stock_incubator) VALUES ($1, $2, $3, $4) RETURNING id",
      [product, BRAND, main, atPartners],
    )
  ).id;
const stock = async (variant: string) => {
  const row = await one<{ stock_main: number; stock_incubator: number; stock: number }>(
    "SELECT stock_main, stock_incubator, stock FROM public.product_variants WHERE id = $1",
    [variant],
  );
  return { store: row.stock_main, partners: row.stock_incubator, total: row.stock };
};
const ledger = async (variant: string) =>
  (
    await db.query<{ location: string; delta: number; reason: string; reference_type: string }>(
      "SELECT location, delta, reason, reference_type FROM public.inventory_movements WHERE variant_id = $1 ORDER BY created_at, id",
      [variant],
    )
  ).rows;
const reconcile = () => db.query("SELECT public.reconcile_inventory()");
const transfer = (partner: string, variant: string, quantity: number) =>
  db.query("SELECT public.transfer_stock_to_incubator($1, $2, $3)", [partner, variant, quantity]);
const giveBack = (partner: string, variant: string, quantity: number) =>
  db.query("SELECT public.return_stock_from_incubator($1, $2, $3)", [partner, variant, quantity]);
const held = async (partner: string, variant: string) =>
  (
    await one<{ quantity: number } | undefined>(
      "SELECT quantity FROM public.incubator_inventory WHERE incubator_id = $1 AND variant_id = $2",
      [partner, variant],
    )
  )?.quantity ?? 0;
/** What each partner is to hand over for an order: { A: n, B: n }. */
const toCollect = async (order: string) => {
  const { rows } = await db.query<{ incubator_id: string; quantity: number }>(
    "SELECT incubator_id, quantity FROM public.order_incubator_allocations WHERE order_id = $1",
    [order],
  );
  return Object.fromEntries(
    rows.map((row) => [row.incubator_id === partnerA ? "A" : "B", row.quantity]),
  );
};
/** Variants whose total at partners differs from what the partners hold: must stay empty. */
const outOfStep = async () =>
  (
    await db.query(
      `SELECT v.id FROM public.product_variants v
       LEFT JOIN (SELECT variant_id, sum(quantity) AS q FROM public.incubator_inventory GROUP BY 1) h
         ON h.variant_id = v.id
       WHERE COALESCE(v.stock_incubator, 0) <> COALESCE(h.q, 0) AND v.id <> $1`,
      [legacy],
    )
  ).rows;
let legacy = "00000000-0000-4000-8000-000000000000";

const order = async (variant: string, quantity: number, location: string | null = null) => {
  const { id } = await one<{ id: string }>(
    "INSERT INTO public.orders (brand_id) VALUES ($1) RETURNING id",
    [BRAND],
  );
  await db.query(
    "INSERT INTO public.order_items (order_id, variant_id, quantity, location) VALUES ($1, $2, $3, $4)",
    [id, variant, quantity, location],
  );
  await db.query("SELECT public.order_inventory_transition($1)", [id]);
  return id;
};
const transition = (id: string) => db.query("SELECT public.order_inventory_transition($1)", [id]);

/** A variant with 1 piece in the store, 3 at partner A and 2 at partner B. */
async function spread() {
  await asStaff();
  const variant = await newVariant(6);
  await transfer(partnerA, variant, 3);
  await transfer(partnerB, variant, 2);
  await asServer();
  return variant;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(functionOf(ledgerFunctions, "apply_inventory_movement"));
  await db.exec(functionOf(ledgerFunctions, "rpc_adjust_variant_stock"));
  await db.exec(functionOf(ledgerFunctions, "trg_guard_product_variants_stock_update"));
  await db.exec(`CREATE TRIGGER trg_guard_product_variants_stock_update
    BEFORE UPDATE OF stock_main, stock_incubator ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.trg_guard_product_variants_stock_update()`);
  await db.exec(functionOf(stateMachine, "order_inventory_desired_state"));
  await db.exec(functionOf(engine, "order_inventory_transition"));
  await db.exec(functionOf(stateMachine, "trg_orders_inventory_delete_proc"));
  await db.exec(`CREATE TRIGGER trg_orders_inventory_delete BEFORE DELETE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.trg_orders_inventory_delete_proc()`);
  await db.exec(functionOf(stateMachine, "transfer_stock_to_incubator"));
  await db.exec(functionOf(stateMachine, "return_stock_from_incubator"));
  await db.exec(functionOf(reconciliation, "reconcile_inventory"));

  product = (
    await one<{ id: string }>("INSERT INTO public.products (brand_id) VALUES ($1) RETURNING id", [
      BRAND,
    ])
  ).id;
  const partner = async (name: string) =>
    (
      await one<{ id: string }>(
        "INSERT INTO public.incubators (brand_id, name) VALUES ($1, $2) RETURNING id",
        [BRAND, name],
      )
    ).id;
  partnerA = await partner("A");
  partnerB = await partner("B");

  // Before the migration: a variant created with 7 pieces in stock, then the nightly run.
  before = await newVariant(7);
  await reconcile();
  const lost = await stock(before);

  await db.exec(migration);
  expect(lost.store).toBe(0);
});

describe("a new variant's opening stock", () => {
  it("was reset to zero by the nightly run before the change (the fault)", async () => {
    expect((await stock(before)).store).toBe(0);
  });

  it("is written to the ledger, so the nightly run leaves it alone", async () => {
    const variant = await newVariant(7);
    expect(await ledger(variant)).toEqual([
      { location: "main", delta: 7, reason: "manual_adjust", reference_type: "opening_stock" },
    ]);
    await reconcile();
    expect(await stock(variant)).toEqual({ store: 7, partners: 0, total: 7 });
    const run = await one<{ drift_count: number }>(
      "SELECT drift_count FROM public.inventory_reconciliation_runs ORDER BY started_at DESC, id DESC LIMIT 1",
    );
    expect(run.drift_count).toBe(0);
  });

  it("starts in the store: a quantity typed as 'at partners' has no partner to hold it", async () => {
    const variant = await newVariant(2, 3);
    expect(await stock(variant)).toEqual({ store: 5, partners: 0, total: 5 });
    expect(await ledger(variant)).toEqual([
      { location: "main", delta: 5, reason: "manual_adjust", reference_type: "opening_stock" },
    ]);
  });

  it("writes nothing for a variant with no stock", async () => {
    expect(await ledger(await newVariant(0))).toEqual([]);
  });
});

describe("the total at partners", () => {
  it("follows a transfer and a return, as before", async () => {
    const variant = await spread();
    expect(await stock(variant)).toEqual({ store: 1, partners: 5, total: 6 });
    await asStaff();
    await giveBack(partnerA, variant, 1);
    await asServer();
    expect(await stock(variant)).toEqual({ store: 2, partners: 4, total: 6 });
    expect(await held(partnerA, variant)).toBe(2);
    expect(await outOfStep()).toEqual([]);
  });

  it("is never changed by hand", async () => {
    const variant = await spread();
    await asStaff();
    await expect(
      db.query("SELECT public.rpc_adjust_variant_stock($1, 'incubator', 'set', 9)", [variant]),
    ).rejects.toThrow("PARTNER_STOCK_MOVES_WITH_ITS_PARTNER");
    await expect(
      db.query(
        "SELECT public.apply_inventory_movement($1, $2, 'incubator', 4, 'manual_adjust', 'manual_adjust', NULL, 'by-hand')",
        [BRAND, variant],
      ),
    ).rejects.toThrow("PARTNER_STOCK_MOVES_WITH_ITS_PARTNER");
    await asServer();
    expect(await stock(variant)).toEqual({ store: 1, partners: 5, total: 6 });
  });

  it("the store's own stock is still adjusted by hand, through the ledger", async () => {
    const variant = await spread();
    await asStaff();
    await db.query("SELECT public.rpc_adjust_variant_stock($1, 'main', 'set', 4)", [variant]);
    await asServer();
    expect(await stock(variant)).toEqual({ store: 4, partners: 5, total: 9 });
  });
});

describe("who may adjust stock", () => {
  it("not a caller with no session, another store's staff, or staff who do not manage inventory", async () => {
    const variant = await newVariant(3);
    const adjust = () =>
      db.query("SELECT public.rpc_adjust_variant_stock($1, 'main', 'set', 50)", [variant]);
    await asServer();
    await expect(adjust()).rejects.toThrow("NOT_AUTHORIZED");
    await asStaff(OTHER);
    await expect(adjust()).rejects.toThrow("NOT_AUTHORIZED");
    await asStaff(BRAND, "manage_orders");
    await expect(adjust()).rejects.toThrow("NOT_AUTHORIZED");
    await asServer();
    expect((await stock(variant)).store).toBe(3);
  });

  it("no browser can call the ledger itself, or the function that names the partner", async () => {
    const rights = await one<Record<string, boolean>>(`
      SELECT
        has_function_privilege('authenticated', 'public.apply_inventory_movement(uuid, uuid, text, integer, text, text, uuid, text, uuid, text)', 'execute') AS staff_ledger,
        has_function_privilege('anon', 'public.apply_inventory_movement(uuid, uuid, text, integer, text, text, uuid, text, uuid, text)', 'execute') AS visitor_ledger,
        has_function_privilege('authenticated', 'public.order_incubator_sync(uuid, uuid, uuid, integer)', 'execute') AS staff_sync,
        has_function_privilege('anon', 'public.order_incubator_sync(uuid, uuid, uuid, integer)', 'execute') AS visitor_sync,
        has_table_privilege('authenticated', 'public.order_incubator_allocations', 'insert') AS staff_write,
        has_table_privilege('anon', 'public.order_incubator_allocations', 'select') AS visitor_read
    `);
    expect(Object.values(rights)).toEqual([false, false, false, false, false, false]);
  });
});

describe("an order that takes pieces held at partners", () => {
  it("uses the store's stock first and says which partner hands over the rest", async () => {
    const variant = await spread();
    const first = await order(variant, 3);

    expect(await stock(variant)).toEqual({ store: 0, partners: 3, total: 3 });
    // The partner holding the most is asked first, so fewer partners have something to hand over.
    expect(await toCollect(first)).toEqual({ A: 2 });
    expect(await held(partnerA, variant)).toBe(1);
    expect(await held(partnerB, variant)).toBe(2);
    expect(await outOfStep()).toEqual([]);

    const second = await order(variant, 3);
    expect(await toCollect(second)).toEqual({ A: 1, B: 2 });
    expect(await held(partnerA, variant)).toBe(0);
    expect(await held(partnerB, variant)).toBe(0);
    expect(await stock(variant)).toEqual({ store: 0, partners: 0, total: 0 });
    expect(await outOfStep()).toEqual([]);
  });

  it("is written in the partner's own history", async () => {
    const variant = await spread();
    const id = await order(variant, 2);
    const { rows } = await db.query(
      "SELECT movement_type, quantity_delta, reference_type FROM public.incubator_movements WHERE reference_id = $1",
      [id],
    );
    expect(rows).toEqual([
      { movement_type: "order_reserve", quantity_delta: -1, reference_type: "order" },
    ]);
  });

  it("gives the pieces back to the same partner when the order is cancelled", async () => {
    const variant = await spread();
    const id = await order(variant, 4);
    expect(await toCollect(id)).toEqual({ A: 3 });

    await db.query("UPDATE public.orders SET status = 'cancelled' WHERE id = $1", [id]);
    await transition(id);
    expect(await toCollect(id)).toEqual({});
    expect(await held(partnerA, variant)).toBe(3);
    expect(await stock(variant)).toEqual({ store: 1, partners: 5, total: 6 });
    expect(await outOfStep()).toEqual([]);
  });

  it("gives back only what a smaller order no longer needs", async () => {
    const variant = await spread();
    const id = await order(variant, 5);
    expect(await toCollect(id)).toEqual({ A: 3, B: 1 });

    await db.query("UPDATE public.order_items SET quantity = 2 WHERE order_id = $1", [id]);
    await transition(id);
    expect(await stock(variant)).toEqual({ store: 0, partners: 4, total: 4 });
    expect(await toCollect(id)).toEqual({ B: 1 });
    expect(await held(partnerA, variant)).toBe(3);
    expect(await outOfStep()).toEqual([]);
  });

  it("gives everything back when the order is deleted", async () => {
    const variant = await spread();
    const id = await order(variant, 6);
    expect(await stock(variant)).toEqual({ store: 0, partners: 0, total: 0 });

    await db.query("DELETE FROM public.orders WHERE id = $1", [id]);
    expect(await stock(variant)).toEqual({ store: 1, partners: 5, total: 6 });
    expect(await held(partnerA, variant)).toBe(3);
    expect(await held(partnerB, variant)).toBe(2);
    expect(await outOfStep()).toEqual([]);
  });

  it("a line staff source from a partner is taken from the partner, not the store", async () => {
    const variant = await spread();
    const id = await order(variant, 1, "incubator");
    expect(await stock(variant)).toEqual({ store: 1, partners: 4, total: 5 });
    expect(await toCollect(id)).toEqual({ A: 1 });
    expect(await outOfStep()).toEqual([]);
  });

  it("stops the partner returning or selling a piece that an order has taken", async () => {
    const variant = await spread();
    await order(variant, 4);
    expect(await held(partnerA, variant)).toBe(0);
    await asStaff();
    await expect(giveBack(partnerA, variant, 1)).rejects.toThrow("INSUFFICIENT_INCUBATOR_STOCK");
    await asServer();
  });

  it("is refused when the store and its partners together do not have enough", async () => {
    const variant = await spread();
    await expect(order(variant, 7)).rejects.toThrow("INSUFFICIENT_STOCK");
    expect(await stock(variant)).toEqual({ store: 1, partners: 5, total: 6 });
    expect(await outOfStep()).toEqual([]);
  });

  it("still goes through when an old total has no partner behind it, recording what it can", async () => {
    // Stock from before the change that no partner holds: the order must not fail on it.
    const variant = await spread();
    legacy = variant;
    await db.exec("SELECT set_config('inventory.apply_via_ledger', '1', false)");
    await db.query(
      "UPDATE public.product_variants SET stock_incubator = stock_incubator + 2 WHERE id = $1",
      [variant],
    );
    await db.exec("SELECT set_config('inventory.apply_via_ledger', '', false)");

    const id = await order(variant, 8);
    expect(await stock(variant)).toEqual({ store: 0, partners: 0, total: 0 });
    expect(await toCollect(id)).toEqual({ A: 3, B: 2 });
  });
});
