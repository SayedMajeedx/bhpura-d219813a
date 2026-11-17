import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import ledgerFunctions from "../supabase/migrations/20260926110000_inventory_ledger_functions.sql?raw";
import stateMachine from "../supabase/migrations/20260926120000_order_inventory_state_machine.sql?raw";
import reconciliation from "../supabase/migrations/20260926130000_inventory_reconciliation_job.sql?raw";
import engine from "../supabase/migrations/20260929100000_drop_stock_deducted_references.sql?raw";
import partnerStock from "../supabase/migrations/20261012160000_partner_stock_has_one_source.sql?raw";
import migration from "../supabase/migrations/20261212100000_partner_transfers.sql?raw";

// Partner transfers (migration 20261212100000): every batch sent to a partner, returned to the
// store or moved from one partner to another is one numbered record with a copy of its lines,
// and pieces move between partners in one step. Run in a real Postgres (PGlite) with the real
// ledger, partner transfer and return, and nightly reconciliation.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const STAFF = "00000000-0000-4000-8000-0000000000aa";

let db: PGlite;
let product: string;
let lulwa: string;
let ra: string;
let closed: string;

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
  CREATE TABLE public.products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
    name text, name_ar text, name_en text);
  CREATE TABLE public.product_variants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid REFERENCES public.products(id),
    brand_id uuid, stock_main integer DEFAULT 0, stock_incubator integer DEFAULT 0,
    size text, color text, sku text, barcode text, selling_price numeric,
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
    variant_id uuid NOT NULL, movement_type text NOT NULL,
    quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
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

type Moved = { transfer_id: string; number: number; pieces: number };

const one = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];
const asStaff = (brand = BRAND, permission = "manage_inventory") =>
  db.exec(
    `SET app.uid = '${STAFF}'; SET app.brand = '${brand}'; SET app.permission = '${permission}'`,
  );

const newVariant = async (main: number, sellingPrice = 32) =>
  (
    await one<{ id: string }>(
      `INSERT INTO public.product_variants (product_id, brand_id, stock_main, size, color, sku, barcode, selling_price)
       VALUES ($1, $2, $3, '54', 'أسود', 'S79-54', '6291000000017', $4) RETURNING id`,
      [product, BRAND, main, sellingPrice],
    )
  ).id;
const stock = async (variant: string) => {
  const row = await one<{ stock_main: number; stock_incubator: number }>(
    "SELECT stock_main, stock_incubator FROM public.product_variants WHERE id = $1",
    [variant],
  );
  return { store: row.stock_main, partners: row.stock_incubator };
};
const line = (partner: string, variant: string) =>
  one<{ quantity: number; external_code: string | null; price: number; commission: number }>(
    `SELECT quantity, external_code, consignment_price::float AS price, commission_value::float AS commission
     FROM public.incubator_inventory WHERE incubator_id = $1 AND variant_id = $2`,
    [partner, variant],
  );
const ledgerCount = async (variant: string) =>
  Number(
    (
      await one<{ n: string }>(
        "SELECT count(*) AS n FROM public.inventory_movements WHERE variant_id = $1",
        [variant],
      )
    ).n,
  );
const transfers = async () =>
  (
    await db.query<{ number: number; kind: string; pieces: number }>(
      "SELECT number, kind, pieces FROM public.incubator_transfers ORDER BY number",
    )
  ).rows;
const items = async (transfer: string) =>
  (
    await db.query<Record<string, unknown>>(
      `SELECT quantity, external_code, price::float AS price, commission_value::float AS commission,
         previous_code, product_name_ar, size, color, sku, barcode
       FROM public.incubator_transfer_items WHERE transfer_id = $1 ORDER BY created_at, id`,
      [transfer],
    )
  ).rows;
const call = async <T>(sql: string, params: unknown[]) => (await one<{ r: T }>(sql, params)).r;
const send = (partner: string, list: unknown[]) =>
  call<Moved>("SELECT public.send_stock_to_incubator($1, $2::jsonb) AS r", [
    partner,
    JSON.stringify(list),
  ]);
const move = (from: string, to: string, list: unknown[]) =>
  call<Moved>("SELECT public.move_stock_between_incubators($1, $2, $3::jsonb) AS r", [
    from,
    to,
    JSON.stringify(list),
  ]);
/** Variants whose total at partners differs from what the partners hold: must stay empty. */
const outOfStep = async () =>
  (
    await db.query(
      `SELECT v.id FROM public.product_variants v
       LEFT JOIN (SELECT variant_id, sum(quantity) AS q FROM public.incubator_inventory GROUP BY 1) h
         ON h.variant_id = v.id
       WHERE COALESCE(v.stock_incubator, 0) <> COALESCE(h.q, 0)`,
    )
  ).rows;

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
  await db.exec(functionOf(stateMachine, "transfer_stock_to_incubator"));
  await db.exec(functionOf(stateMachine, "return_stock_from_incubator"));
  await db.exec(functionOf(reconciliation, "reconcile_inventory"));
  await db.exec(partnerStock);
  await db.exec(migration);

  product = (
    await one<{ id: string }>(
      `INSERT INTO public.products (brand_id, name, name_ar, name_en)
       VALUES ($1, 'Abaya | Nasaq', 'عباية | نَسَق', 'Abaya | Nasaq') RETURNING id`,
      [BRAND],
    )
  ).id;
  const partner = async (name: string, commission: number, active = true) =>
    (
      await one<{ id: string }>(
        "INSERT INTO public.incubators (brand_id, name, commission_value, is_active) VALUES ($1, $2, $3, $4) RETURNING id",
        [BRAND, name, commission, active],
      )
    ).id;
  lulwa = await partner("دار لولوة", 0);
  ra = await partner("RA Boutique", 15);
  closed = await partner("Closed", 0, false);
});

describe("sending pieces to a partner", () => {
  it("is a numbered batch that keeps each line as it was sent", async () => {
    await asStaff();
    const variant = await newVariant(5);
    const sent = await send(lulwa, [
      { variant_id: variant, quantity: 3, external_code: "LUL-7", price: 32 },
    ]);
    expect(sent).toMatchObject({ number: 1, pieces: 3 });
    expect(await stock(variant)).toEqual({ store: 2, partners: 3 });
    expect(await items(sent.transfer_id)).toEqual([
      {
        quantity: 3,
        external_code: "LUL-7",
        price: 32,
        commission: 0,
        previous_code: null,
        product_name_ar: "عباية | نَسَق",
        size: "54",
        color: "أسود",
        sku: "S79-54",
        barcode: "6291000000017",
      },
    ]);
    // The partner's history names the batch.
    const history = await one<{ reference_type: string; reference_id: string }>(
      "SELECT reference_type, reference_id FROM public.incubator_movements WHERE variant_id = $1",
      [variant],
    );
    expect(history).toEqual({
      reference_type: "incubator_transfer",
      reference_id: sent.transfer_id,
    });
  });

  it("through the batch a page left open calls, answering the pieces as before", async () => {
    await asStaff();
    const variant = await newVariant(2);
    const pieces = await call<number>(
      "SELECT public.transfer_stock_to_incubator_batch($1, $2::jsonb) AS r",
      [lulwa, JSON.stringify([{ variant_id: variant, quantity: 2 }])],
    );
    expect(pieces).toBe(2);
    expect((await transfers()).at(-1)).toEqual({ number: 2, kind: "send", pieces: 2 });
  });

  it("leaves nothing behind when one piece cannot go, the number included", async () => {
    await asStaff();
    const enough = await newVariant(3);
    const short = await newVariant(1);
    const before = await transfers();
    await expect(
      send(lulwa, [
        { variant_id: enough, quantity: 2 },
        { variant_id: short, quantity: 4 },
      ]),
    ).rejects.toThrow(`INSUFFICIENT_MAIN_STOCK:${short}`);
    expect(await transfers()).toEqual(before);
    expect(await stock(enough)).toEqual({ store: 3, partners: 0 });
  });
});

describe("moving pieces from one partner to another", () => {
  it("lowers the first and raises the second in one step, the store's total untouched", async () => {
    await asStaff();
    const variant = await newVariant(4);
    await send(lulwa, [{ variant_id: variant, quantity: 3, external_code: "LUL-9", price: 30 }]);
    const ledgerBefore = await ledgerCount(variant);

    const moved = await move(lulwa, ra, [
      { variant_id: variant, quantity: 2, external_code: "RA-001", price: 35 },
    ]);

    expect(moved.pieces).toBe(2);
    expect(await line(lulwa, variant)).toMatchObject({ quantity: 1, external_code: "LUL-9" });
    expect(await line(ra, variant)).toEqual({
      quantity: 2,
      external_code: "RA-001",
      price: 35,
      commission: 15,
    });
    // Nothing went through the store: no ledger line, the total at partners is the same.
    expect(await stock(variant)).toEqual({ store: 1, partners: 3 });
    expect(await ledgerCount(variant)).toBe(ledgerBefore);
    await db.query("SELECT public.reconcile_inventory()");
    expect(await stock(variant)).toEqual({ store: 1, partners: 3 });
    expect(await outOfStep()).toEqual([]);

    expect(await items(moved.transfer_id)).toEqual([
      expect.objectContaining({
        quantity: 2,
        external_code: "RA-001",
        previous_code: "LUL-9",
        price: 35,
        commission: 15,
      }),
    ]);
    const history = (
      await db.query<{ incubator_id: string; movement_type: string; quantity_delta: number }>(
        `SELECT incubator_id, movement_type, quantity_delta FROM public.incubator_movements
         WHERE reference_id = $1 ORDER BY quantity_delta`,
        [moved.transfer_id],
      )
    ).rows;
    expect(history).toEqual([
      { incubator_id: lulwa, movement_type: "move_out", quantity_delta: -2 },
      { incubator_id: ra, movement_type: "move_in", quantity_delta: 2 },
    ]);
  });

  it("prices a piece at the size's selling price when none is sent", async () => {
    await asStaff();
    const variant = await newVariant(1, 28);
    await send(lulwa, [{ variant_id: variant, quantity: 1, price: 20 }]);
    await move(lulwa, ra, [{ variant_id: variant, quantity: 1 }]);
    expect(await line(ra, variant)).toMatchObject({ quantity: 1, price: 28 });
  });

  it("moves only what the first partner holds, and nothing at all when one line is short", async () => {
    await asStaff();
    const a = await newVariant(2);
    const b = await newVariant(2);
    await send(lulwa, [
      { variant_id: a, quantity: 2 },
      { variant_id: b, quantity: 1 },
    ]);
    const before = await transfers();
    await expect(
      move(lulwa, ra, [
        { variant_id: a, quantity: 2 },
        { variant_id: b, quantity: 2 },
      ]),
    ).rejects.toThrow(`INSUFFICIENT_INCUBATOR_STOCK:${b}`);
    expect(await line(lulwa, a)).toMatchObject({ quantity: 2 });
    expect(await line(ra, a)).toBeUndefined();
    expect(await transfers()).toEqual(before);
  });

  it("refuses the same partner, an ended one as the receiver, and anyone not allowed", async () => {
    await asStaff();
    const variant = await newVariant(1);
    await send(lulwa, [{ variant_id: variant, quantity: 1 }]);
    const piece = [{ variant_id: variant, quantity: 1 }];
    await expect(move(lulwa, lulwa, piece)).rejects.toThrow("SAME_PARTNER");
    await expect(move(lulwa, closed, piece)).rejects.toThrow("PARTNER_INACTIVE");
    await asStaff(BRAND, "manage_orders");
    await expect(move(lulwa, ra, piece)).rejects.toThrow("NOT_AUTHORIZED");
    await asStaff(OTHER);
    await expect(move(lulwa, ra, piece)).rejects.toThrow("NOT_AUTHORIZED");
  });

  it("can empty a partner that has ended", async () => {
    await asStaff();
    const variant = await newVariant(1);
    await send(lulwa, [{ variant_id: variant, quantity: 1 }]);
    await db.query("UPDATE public.incubators SET is_active = false WHERE id = $1", [lulwa]);
    await move(lulwa, ra, [{ variant_id: variant, quantity: 1 }]);
    expect(await line(lulwa, variant)).toMatchObject({ quantity: 0 });
    await db.query("UPDATE public.incubators SET is_active = true WHERE id = $1", [lulwa]);
  });
});

describe("returning pieces to the store", () => {
  it("is a numbered batch that remembers the partner's code", async () => {
    await asStaff();
    const variant = await newVariant(2);
    await send(ra, [{ variant_id: variant, quantity: 2, external_code: "RA-7" }]);
    const back = await call<Moved>("SELECT public.return_stock_to_store($1, $2::jsonb) AS r", [
      ra,
      JSON.stringify([{ variant_id: variant, quantity: 1 }]),
    ]);
    expect(back.pieces).toBe(1);
    expect(await stock(variant)).toEqual({ store: 1, partners: 1 });
    expect(await items(back.transfer_id)).toEqual([
      expect.objectContaining({ quantity: 1, previous_code: "RA-7", price: null }),
    ]);
    const numbers = (await transfers()).map((t) => t.number);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });
});

describe("what a browser may do", () => {
  const may = async (sql: string) => (await one<{ ok: boolean }>(`SELECT ${sql} AS ok`)).ok;

  it("reads transfers but never writes them", async () => {
    expect(
      await may("has_table_privilege('authenticated', 'public.incubator_transfers', 'SELECT')"),
    ).toBe(true);
    expect(
      await may("has_table_privilege('authenticated', 'public.incubator_transfers', 'INSERT')"),
    ).toBe(false);
    expect(
      await may(
        "has_table_privilege('authenticated', 'public.incubator_transfer_items', 'UPDATE')",
      ),
    ).toBe(false);
  });

  it("calls the three steps when signed in, never the helpers, and a visitor calls nothing", async () => {
    const fn = (role: string, signature: string) =>
      may(`has_function_privilege('${role}', 'public.${signature}', 'EXECUTE')`);
    expect(await fn("authenticated", "incubator_transfer_open(uuid, text, uuid, uuid, text)")).toBe(
      false,
    );
    expect(
      await fn("authenticated", "move_stock_between_incubators(uuid, uuid, jsonb, text)"),
    ).toBe(true);
    expect(await fn("authenticated", "return_stock_to_store(uuid, jsonb, text)")).toBe(true);
    expect(await fn("anon", "move_stock_between_incubators(uuid, uuid, jsonb, text)")).toBe(false);
    expect(await fn("anon", "send_stock_to_incubator(uuid, jsonb, text)")).toBe(false);
  });
});
