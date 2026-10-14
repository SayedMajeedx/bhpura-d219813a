import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import ledgerFunctions from "../supabase/migrations/20260926110000_inventory_ledger_functions.sql?raw";
import stateMachine from "../supabase/migrations/20260926120000_order_inventory_state_machine.sql?raw";
import engine from "../supabase/migrations/20260929100000_drop_stock_deducted_references.sql?raw";
import partnerStock from "../supabase/migrations/20261012160000_partner_stock_has_one_source.sql?raw";
import migration from "../supabase/migrations/20261014130000_partner_pickup_points.sql?raw";

// A shopper can collect an order at a partner's shop that holds its pieces (found 2026-10-14:
// all of Pura's 15 pieces were at its partner, and the checkout offered only the store's branch).
// Run in a real Postgres with the real order engine, ledger and partner transfers.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const STAFF = "00000000-0000-4000-8000-0000000000aa";

let db: PGlite;
let product: string;
let partnerA: string;
let partnerB: string;
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
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
  CREATE FUNCTION public.can_access_brand(b uuid) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT current_setting('app.brand', true) = b::text $$;
  CREATE FUNCTION public.has_permission(p text) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT current_setting('app.permission', true) = p $$;
  CREATE TABLE public.brands (id uuid PRIMARY KEY, is_active boolean NOT NULL DEFAULT true);
  INSERT INTO public.brands VALUES ('${BRAND}');
  CREATE TABLE public.products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL);
  CREATE TABLE public.product_variants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid REFERENCES public.products(id),
    brand_id uuid, stock_main integer DEFAULT 0, stock_incubator integer DEFAULT 0,
    stock integer DEFAULT 0, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  );
  CREATE TABLE public.inventory_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, variant_id uuid NOT NULL,
    location text NOT NULL, delta integer NOT NULL, balance_after integer NOT NULL CHECK (balance_after >= 0),
    reason text NOT NULL, reference_type text, reference_id uuid, idempotency_key text NOT NULL,
    actor_id uuid, note text, created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX uq_inventory_movements_brand_idempotency
    ON public.inventory_movements (brand_id, idempotency_key);
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
    reference_type text, reference_id uuid, notes text, created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, branch_id uuid,
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
const asStaff = () =>
  db.exec(
    `SET app.uid = '${STAFF}'; SET app.brand = '${BRAND}'; SET app.permission = 'manage_inventory'`,
  );
const asServer = () => db.exec("SET app.uid = ''; SET app.brand = ''; SET app.permission = ''");

/** A variant with `store` pieces in the store and the given pieces at partners A and B. */
async function variant(store: number, atA = 0, atB = 0) {
  await asStaff();
  const { id } = await one<{ id: string }>(
    "INSERT INTO public.product_variants (product_id, brand_id, stock_main) VALUES ($1, $2, $3) RETURNING id",
    [product, BRAND, store + atA + atB],
  );
  if (atA)
    await db.query("SELECT public.transfer_stock_to_incubator($1, $2, $3)", [partnerA, id, atA]);
  if (atB)
    await db.query("SELECT public.transfer_stock_to_incubator($1, $2, $3)", [partnerB, id, atB]);
  await asServer();
  return id;
}

/** An order placed by the checkout: its lines, then the engine (as the builder does). */
async function placeOrder(lines: { variant: string; quantity: number; location?: string }[]) {
  const { id } = await one<{ id: string }>(
    "INSERT INTO public.orders (brand_id) VALUES ($1) RETURNING id",
    [BRAND],
  );
  for (const line of lines) {
    await db.query(
      "INSERT INTO public.order_items (order_id, variant_id, quantity, location) VALUES ($1, $2, $3, $4)",
      [id, line.variant, line.quantity, line.location ?? "main"],
    );
  }
  return id;
}

const pickupPoints = async (items: unknown[]) =>
  (
    await one<{
      r: {
        partners: { id: string; name: string }[];
        from_partner: boolean;
        transfer_days: number | null;
      };
    }>("SELECT public.storefront_pickup_partners($1, $2::jsonb) AS r", [
      BRAND,
      JSON.stringify(items),
    ])
  ).r;
const held = async (partner: string, v: string) =>
  (
    await one<{ quantity: number } | undefined>(
      "SELECT quantity FROM public.incubator_inventory WHERE incubator_id = $1 AND variant_id = $2",
      [partner, v],
    )
  )?.quantity ?? 0;
const collectFrom = async (order: string) =>
  Object.fromEntries(
    (
      await db.query<{ incubator_id: string; quantity: number }>(
        "SELECT incubator_id, quantity FROM public.order_incubator_allocations WHERE order_id = $1",
        [order],
      )
    ).rows.map((r) => [
      r.incubator_id === partnerA ? "A" : r.incubator_id === partnerB ? "B" : "?",
      r.quantity,
    ]),
  );
const stock = async (v: string) =>
  one<{ stock_main: number; stock_incubator: number }>(
    "SELECT stock_main, stock_incubator FROM public.product_variants WHERE id = $1",
    [v],
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(functionOf(ledgerFunctions, "apply_inventory_movement"));
  await db.exec(functionOf(stateMachine, "order_inventory_desired_state"));
  await db.exec(functionOf(engine, "order_inventory_transition"));
  await db.exec(functionOf(stateMachine, "transfer_stock_to_incubator"));
  await db.exec(functionOf(stateMachine, "trg_order_items_inventory_proc"));
  await db.exec(`CREATE TRIGGER trg_order_items_inventory AFTER INSERT OR UPDATE OR DELETE ON public.order_items
    FOR EACH ROW EXECUTE FUNCTION public.trg_order_items_inventory_proc()`);
  // Partner stock with one source: the allocations table, the ledger that calls the partner sync,
  // and the trigger that records a new variant's opening stock.
  await db.exec(partnerStock);
  // The migration without the storefront builder (tests/partner-pickup-builder-migration.test.ts).
  await db.exec(migration.slice(0, migration.indexOf("-- 5. place_storefront_order")));

  product = (
    await one<{ id: string }>("INSERT INTO public.products (brand_id) VALUES ($1) RETURNING id", [
      BRAND,
    ])
  ).id;
  const partner = async (name: string, extra = "") =>
    (
      await one<{ id: string }>(
        `INSERT INTO public.incubators (brand_id, name, pickup_enabled, pickup_address_ar, transfer_days${extra ? ", is_active" : ""})
         VALUES ($1, $2, true, 'المحرق', 2${extra ? `, ${extra}` : ""}) RETURNING id`,
        [BRAND, name],
      )
    ).id;
  partnerA = await partner("Dar A");
  partnerB = await partner("Dar B");
  closed = await partner("Closed", "false");
});

describe("what a checkout can offer for a cart", () => {
  it("offers the partners that take pickups and hold every piece, and says a branch pickup waits for them", async () => {
    const v1 = await variant(0, 3, 1);
    const v2 = await variant(0, 2, 0);
    const result = await pickupPoints([
      { variant_id: v1, quantity: 2 },
      { variant_id: v2, quantity: 1 },
    ]);
    // B holds one of v1 and none of v2: only A can hand over the whole cart.
    expect(result.partners.map((p) => p.name)).toEqual(["Dar A"]);
    expect(result.partners[0]).toMatchObject({ address_ar: "المحرق" });
    expect(JSON.stringify(result)).not.toMatch(/quantity/);
    expect(result).toMatchObject({ from_partner: true, transfer_days: 2 });
  });

  it("offers no partner that does not take pickups, and none for a piece made to order", async () => {
    const v = await variant(1, 2, 2);
    await db.query("UPDATE public.incubators SET pickup_enabled = false WHERE id = $1", [partnerB]);
    expect(
      (await pickupPoints([{ variant_id: v, quantity: 1 }])).partners.map((p) => p.name),
    ).toEqual(["Dar A"]);
    await db.query("UPDATE public.incubators SET pickup_enabled = true WHERE id = $1", [partnerB]);
    const withMadeToOrder = await pickupPoints([
      { variant_id: v, quantity: 1 },
      { variant_id: v, quantity: 1, made_to_order: true },
    ]);
    expect(withMadeToOrder.partners).toEqual([]);
    // The store holds the piece: a branch pickup does not wait for a partner.
    expect(withMadeToOrder.from_partner).toBe(false);
  });

  it("answers nothing for another store's pieces or a cart it cannot read", async () => {
    expect((await pickupPoints([])).partners).toEqual([]);
    expect(
      (await pickupPoints([{ variant_id: "00000000-0000-4000-8000-000000000999", quantity: 1 }]))
        .partners,
    ).toEqual([]);
  });
});

describe("an order collected at a partner", () => {
  it("takes its pieces from that partner, even when the store has some and another partner has more", async () => {
    const v = await variant(1, 1, 4);
    const id = await placeOrder([{ variant: v, quantity: 1 }]);
    // The engine took the store's piece first.
    expect((await stock(v)).stock_main).toBe(0);

    await db.query("SELECT public.assign_order_pickup_partner($1, $2)", [id, partnerA]);
    expect(await collectFrom(id)).toEqual({ A: 1 });
    expect(await stock(v)).toEqual({ stock_main: 1, stock_incubator: 4 });
    expect(await held(partnerA, v)).toBe(0);
    expect(await held(partnerB, v)).toBe(4);
    const order = await one<{ pickup_incubator_id: string; branch_id: string | null }>(
      "SELECT pickup_incubator_id, branch_id FROM public.orders WHERE id = $1",
      [id],
    );
    expect(order).toEqual({ pickup_incubator_id: partnerA, branch_id: null });
  });

  it("moves a piece the engine took from another partner to the pickup partner", async () => {
    const v = await variant(0, 2, 5);
    const id = await placeOrder([{ variant: v, quantity: 2 }]);
    expect(await collectFrom(id)).toEqual({ B: 2 }); // the partner holding most
    await db.query("SELECT public.assign_order_pickup_partner($1, $2)", [id, partnerA]);
    expect(await collectFrom(id)).toEqual({ A: 2 });
    expect(await held(partnerA, v)).toBe(0);
    expect(await held(partnerB, v)).toBe(5);
    expect((await stock(v)).stock_incubator).toBe(5);
  });

  it("gives the piece back to that partner when the order is cancelled", async () => {
    const v = await variant(0, 1, 3);
    const id = await placeOrder([{ variant: v, quantity: 1 }]);
    await db.query("SELECT public.assign_order_pickup_partner($1, $2)", [id, partnerA]);
    await db.query("UPDATE public.orders SET status = 'cancelled' WHERE id = $1", [id]);
    await db.query("SELECT public.order_inventory_transition($1)", [id]);
    expect(await held(partnerA, v)).toBe(1);
    expect(await held(partnerB, v)).toBe(3);
  });

  it("is refused when the partner does not take pickups, is closed, lacks a piece, or a piece is made to order", async () => {
    const v = await variant(0, 1, 0);
    const refuse = async (
      lines: { variant: string; quantity: number; location?: string }[],
      partner: string,
    ) => {
      const id = await placeOrder(lines);
      await expect(
        db.query("SELECT public.assign_order_pickup_partner($1, $2)", [id, partner]),
      ).rejects.toThrow(/PICKUP_PARTNER_UNAVAILABLE/);
    };
    // Each case has its own piece: in the builder a refusal undoes the whole order.
    await refuse([{ variant: v, quantity: 1 }], closed);
    await refuse([{ variant: await variant(0, 1, 0), quantity: 1 }], partnerB);
    const w = await variant(0, 1, 0);
    await refuse(
      [
        { variant: w, quantity: 1 },
        { variant: w, quantity: 1, location: "custom" },
      ],
      partnerA,
    );
  });

  it("is reached by a visitor's checkout only through the builder, never directly", async () => {
    for (const role of ["anon", "authenticated"]) {
      const { rows } = await db.query<{ ok: boolean }>(
        `SELECT has_function_privilege('${role}', 'public.assign_order_pickup_partner(uuid, uuid)', 'execute') AS ok`,
      );
      expect(rows[0].ok, role).toBe(false);
    }
    const { rows } = await db.query<{ ok: boolean }>(
      `SELECT has_function_privilege('anon', 'public.storefront_pickup_partners(uuid, jsonb)', 'execute') AS ok`,
    );
    expect(rows[0].ok).toBe(true);
  });
});
