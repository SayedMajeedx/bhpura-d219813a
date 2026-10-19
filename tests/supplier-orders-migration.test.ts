import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import ledgerFunctions from "../supabase/migrations/20260926110000_inventory_ledger_functions.sql?raw";
import reconciliation from "../supabase/migrations/20260926130000_inventory_reconciliation_job.sql?raw";
import partnerStock from "../supabase/migrations/20261012160000_partner_stock_has_one_source.sql?raw";
import migration from "../supabase/migrations/20261019100000_supplier_orders_receive_into_stock.sql?raw";
import { averageCost, landedUnitCosts } from "../src/features/supplier-orders/lib/landed-cost";

// A tailor's order linked to products and sizes; receiving adds the pieces to the stock through
// the ledger and sets each size's cost (migration 20261019100000). Run in a real Postgres
// (PGlite) with the real ledger, its direct-write guard and the nightly reconciliation, as the
// store's staff in a browser session (`authenticated`) and as the server.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const STAFF = "00000000-0000-4000-8000-0000000000aa";

let db: PGlite;
let tailor: string;
let abaya: string;
let small: string;
let medium: string;
let large: string;

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
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  CREATE FUNCTION public.can_access_brand(b uuid) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT current_setting('app.brand', true) = b::text $$;
  CREATE FUNCTION public.has_permission(p text) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT p = ANY (string_to_array(current_setting('app.permission', true), ',')) $$;
  CREATE FUNCTION public.can_view_brand_costs(b uuid) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT public.can_access_brand(b) AND public.has_permission('view_financials') $$;
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
  CREATE TABLE public.product_costs (
    product_id uuid PRIMARY KEY, brand_id uuid NOT NULL, cost_price numeric NOT NULL DEFAULT 0,
    direct_packaging_cost numeric NOT NULL DEFAULT 0, vendor_id uuid, updated_at timestamptz DEFAULT now()
  );
  CREATE TABLE public.variant_costs (
    variant_id uuid PRIMARY KEY, brand_id uuid NOT NULL, cost_price numeric NOT NULL DEFAULT 0,
    updated_at timestamptz DEFAULT now()
  );
  CREATE TABLE public.vendors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.purchase_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    po_number text NOT NULL, vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'ordered', total_amount numeric(12,3) NOT NULL DEFAULT 0.000,
    paid_amount numeric(12,3) NOT NULL DEFAULT 0.000, due_date date,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.purchase_order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    description text NOT NULL, quantity integer NOT NULL DEFAULT 1,
    unit_cost numeric(10,3) NOT NULL DEFAULT 0.000, line_total numeric(12,3) NOT NULL DEFAULT 0.000
  );
`;

const GRANTS = `
  GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
  REVOKE ALL ON public.purchase_order_receipts FROM authenticated;
  GRANT SELECT ON public.purchase_order_receipts TO authenticated;
`;

const one = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];

/** A member of staff in a browser session, with these permissions. */
const asStaff = (permissions = "manage_inventory,view_financials", brand = BRAND) =>
  db.exec(
    `RESET ROLE; SET app.uid = '${STAFF}'; SET app.brand = '${brand}';
     SET app.permission = '${permissions}'; SET ROLE authenticated`,
  );
/** The server, or the database's own work: no session. */
const asServer = () =>
  db.exec("RESET ROLE; SET app.uid = ''; SET app.brand = ''; SET app.permission = ''");

const newVariant = async (product: string, main = 0, brand = BRAND) =>
  (
    await one<{ id: string }>(
      "INSERT INTO public.product_variants (product_id, brand_id, stock_main) VALUES ($1, $2, $3) RETURNING id",
      [product, brand, main],
    )
  ).id;

type Line = { variant?: string; description?: string; quantity: number; unit_cost: number };

/** A tailor's order with these lines, written as the screen writes it. */
async function newOrder(lines: Line[], status = "ordered") {
  const po = await one<{ id: string; po_number: string }>(
    "INSERT INTO public.purchase_orders (brand_id, vendor_id, po_number, status) VALUES ($1, $2, '', $3) RETURNING id, po_number",
    [BRAND, tailor, status],
  );
  for (const [i, line] of lines.entries()) {
    await db.query(
      `INSERT INTO public.purchase_order_items (po_id, variant_id, description, quantity, unit_cost, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [po.id, line.variant ?? null, line.description ?? "", line.quantity, line.unit_cost, i],
    );
  }
  return po;
}

const items = async (po: string) =>
  (
    await db.query<{
      id: string;
      variant_id: string | null;
      product_id: string | null;
      quantity: number;
      received_quantity: number;
      line_total: string;
    }>(
      "SELECT id, variant_id, product_id, quantity, received_quantity, line_total FROM public.purchase_order_items WHERE po_id = $1 ORDER BY sort_order",
      [po],
    )
  ).rows;
const order = (po: string) =>
  one<{ status: string; total_amount: string; received_at: string | null; po_number: string }>(
    "SELECT status, total_amount, received_at, po_number FROM public.purchase_orders WHERE id = $1",
    [po],
  );
const stock = async (variant: string) =>
  (
    await one<{ stock_main: number }>(
      "SELECT stock_main FROM public.product_variants WHERE id = $1",
      [variant],
    )
  ).stock_main;
const cost = async (variant: string) =>
  Number(
    (
      await one<{ cost_price: string } | undefined>(
        "SELECT cost_price FROM public.variant_costs WHERE variant_id = $1",
        [variant],
      )
    )?.cost_price ?? 0,
  );
const productCost = async (product: string) =>
  Number(
    (
      await one<{ cost_price: string } | undefined>(
        "SELECT cost_price FROM public.product_costs WHERE product_id = $1",
        [product],
      )
    )?.cost_price ?? 0,
  );

let requests = 0;
const requestId = () => `00000000-0000-4000-9000-${String(++requests).padStart(12, "0")}`;
const receive = (po: string, lines: Array<[string, number]>, request = requestId()) =>
  db.query<{ receive_purchase_order: { status: string; repeated: boolean } }>(
    "SELECT public.receive_purchase_order($1, $2::jsonb, $3)",
    [po, JSON.stringify(lines.map(([item_id, quantity]) => ({ item_id, quantity }))), request],
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(functionOf(partnerStock, "apply_inventory_movement"));
  await db.exec(functionOf(ledgerFunctions, "trg_guard_product_variants_stock_update"));
  await db.exec(`CREATE TRIGGER trg_guard_product_variants_stock_update
    BEFORE UPDATE OF stock_main, stock_incubator ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.trg_guard_product_variants_stock_update()`);
  await db.exec(functionOf(reconciliation, "reconcile_inventory"));
  await db.exec(migration);
  await db.exec(GRANTS);

  tailor = (
    await one<{ id: string }>(
      "INSERT INTO public.vendors (brand_id, name) VALUES ($1, 'Umm Ali tailoring') RETURNING id",
      [BRAND],
    )
  ).id;
  abaya = (
    await one<{ id: string }>("INSERT INTO public.products (brand_id) VALUES ($1) RETURNING id", [
      BRAND,
    ])
  ).id;
  small = await newVariant(abaya);
  medium = await newVariant(abaya);
  large = await newVariant(abaya);
});

describe("a tailor's order", () => {
  it("names its sizes, numbers itself and adds up its lines", async () => {
    await asStaff();
    const po = await newOrder([
      { variant: small, quantity: 4, unit_cost: 18 },
      { variant: medium, quantity: 6, unit_cost: 18 },
      { description: "Crepe fabric", quantity: 1, unit_cost: 30 },
    ]);
    await asServer();
    const lines = await items(po.id);
    expect(po.po_number).toBe("PO-0001");
    expect(lines.map((l) => l.product_id)).toEqual([abaya, abaya, null]);
    expect(lines.map((l) => Number(l.line_total))).toEqual([72, 108, 30]);
    expect(await order(po.id)).toMatchObject({ status: "ordered", total_amount: "210.000" });
    const next = await newOrder([{ variant: large, quantity: 1, unit_cost: 1 }]);
    expect(next.po_number).toBe("PO-0002");
  });

  it("refuses a size of another store", async () => {
    await asServer();
    const theirs = (
      await one<{ id: string }>("INSERT INTO public.products (brand_id) VALUES ($1) RETURNING id", [
        OTHER,
      ])
    ).id;
    const variant = await newVariant(theirs, 0, OTHER);
    await asStaff();
    await expect(newOrder([{ variant, quantity: 1, unit_cost: 5 }])).rejects.toThrow(
      "CROSS_BRAND_PURCHASE_ORDER_VARIANT",
    );
    await asServer();
  });
});

describe("receiving", () => {
  it("adds what arrived to the store's stock through the ledger and sets each size's cost", async () => {
    await asStaff();
    const po = await newOrder([
      { variant: small, quantity: 4, unit_cost: 18 },
      { variant: medium, quantity: 6, unit_cost: 18 },
      { description: "Crepe fabric", quantity: 1, unit_cost: 30 },
    ]);
    const [s, m] = await items(po.id);
    const before = { small: await stock(small), medium: await stock(medium) };

    const { rows } = await receive(po.id, [
      [s.id, 4],
      [m.id, 2],
    ]);
    expect(rows[0].receive_purchase_order).toEqual({
      status: "partially_received",
      repeated: false,
    });
    await asServer();

    expect(await stock(small)).toBe(before.small + 4);
    expect(await stock(medium)).toBe(before.medium + 2);
    // 18 a piece plus its share of the fabric: 30 over 180 of pieces = 3 a piece.
    expect(await cost(small)).toBe(21);
    expect(await cost(medium)).toBe(21);
    expect(await productCost(abaya)).toBe(21);
    const ledger = await db.query<{ reason: string; reference_type: string; note: string }>(
      "SELECT reason, reference_type, note FROM public.inventory_movements WHERE reference_id = $1",
      [po.id],
    );
    expect(ledger.rows).toHaveLength(2);
    expect(ledger.rows[0]).toMatchObject({
      reason: "manual_adjust",
      reference_type: "purchase_order",
    });
    expect(ledger.rows[0].note).toContain("Umm Ali tailoring");
    expect((await items(po.id)).map((l) => l.received_quantity)).toEqual([4, 2, 0]);

    // The nightly reconciliation reads the ledger as the truth: what arrived stays.
    await db.query("SELECT public.reconcile_inventory()");
    expect(await stock(small)).toBe(before.small + 4);

    // The rest arrives: the order is received.
    await asStaff();
    await receive(po.id, [[m.id, 4]]);
    await asServer();
    const done = await order(po.id);
    expect(done.status).toBe("received");
    expect(done.received_at).not.toBeNull();
    expect(await stock(medium)).toBe(before.medium + 6);

    await asStaff();
    await expect(receive(po.id, [[m.id, 1]])).rejects.toThrow("PURCHASE_ORDER_NOT_OPEN");
    await asServer();
  });

  it("averages the new cost with what is already on the shelf", async () => {
    await asServer();
    const variant = await newVariant(abaya, 10);
    await db.query(
      "INSERT INTO public.variant_costs (variant_id, brand_id, cost_price) VALUES ($1, $2, 15)",
      [variant, BRAND],
    );
    await asStaff();
    const po = await newOrder([{ variant, quantity: 5, unit_cost: 24 }]);
    const [line] = await items(po.id);
    await receive(po.id, [[line.id, 5]]);
    await asServer();
    // (10 x 15 + 5 x 24) / 15 = 18
    expect(await cost(variant)).toBe(18);
    expect(await stock(variant)).toBe(15);
    expect(averageCost({ onHand: 10, costBefore: 15, received: 5, unitCost: 24 })).toBe(18);
  });

  it("spreads the order's other costs by count when the pieces carry none", async () => {
    await asStaff();
    const po = await newOrder([
      { variant: small, quantity: 2, unit_cost: 0 },
      { variant: large, quantity: 3, unit_cost: 0 },
      { description: "Tailoring, whole batch", quantity: 1, unit_cost: 100 },
    ]);
    const [s, l] = await items(po.id);
    await asServer();
    const landed = await db.query<{ cost: string }>(
      "SELECT public.purchase_order_landed_unit_cost(id) AS cost FROM public.purchase_order_items WHERE po_id = $1 ORDER BY sort_order",
      [po.id],
    );
    expect(landed.rows.slice(0, 2).map((r) => Number(r.cost))).toEqual([20, 20]);
    expect(
      landedUnitCosts([
        { id: s.id, isPiece: true, quantity: 2, unitCost: 0 },
        { id: l.id, isPiece: true, quantity: 3, unitCost: 0 },
        { id: "fabric", isPiece: false, quantity: 1, unitCost: 100 },
      ]),
    ).toEqual(
      new Map([
        [s.id, 20],
        [l.id, 20],
      ]),
    );
  });

  it("happens once for one press, and never past what was ordered", async () => {
    await asStaff();
    const po = await newOrder([{ variant: large, quantity: 3, unit_cost: 10 }]);
    const [line] = await items(po.id);
    const before = await stock(large);
    const press = requestId();
    await receive(po.id, [[line.id, 2]], press);
    const again = await receive(po.id, [[line.id, 2]], press);
    expect(again.rows[0].receive_purchase_order.repeated).toBe(true);
    expect(await stock(large)).toBe(before + 2);

    await expect(receive(po.id, [[line.id, 2]])).rejects.toThrow("RECEIVE_MORE_THAN_ORDERED");
    await expect(receive(po.id, [[line.id, 0]])).rejects.toThrow("INVALID_QUANTITY");
    await expect(receive(po.id, [[line.id, 0.5]])).rejects.toThrow("INVALID_QUANTITY");
    await expect(
      receive(po.id, [
        [line.id, 1],
        [line.id, 1],
      ]),
    ).rejects.toThrow("PURCHASE_ORDER_LINE_TWICE");
    expect(await stock(large)).toBe(before + 2);
    await asServer();
  });

  it("does not take a cost line, a draft or a cancelled order", async () => {
    await asStaff();
    const po = await newOrder([
      { variant: small, quantity: 1, unit_cost: 10 },
      { description: "Delivery", quantity: 1, unit_cost: 2 },
    ]);
    const [, delivery] = await items(po.id);
    await expect(receive(po.id, [[delivery.id, 1]])).rejects.toThrow(
      "PURCHASE_ORDER_LINE_HAS_NO_PIECE",
    );
    const draft = await newOrder([{ variant: small, quantity: 1, unit_cost: 10 }], "draft");
    const [draftLine] = await items(draft.id);
    await expect(receive(draft.id, [[draftLine.id, 1]])).rejects.toThrow("PURCHASE_ORDER_NOT_OPEN");
    await db.query("UPDATE public.purchase_orders SET status = 'cancelled' WHERE id = $1", [po.id]);
    const [piece] = await items(po.id);
    await expect(receive(po.id, [[piece.id, 1]])).rejects.toThrow("PURCHASE_ORDER_NOT_OPEN");
    await asServer();
  });

  it("is for staff who manage the stock and see the costs, of that store", async () => {
    await asStaff();
    const po = await newOrder([{ variant: small, quantity: 2, unit_cost: 10 }]);
    const [line] = await items(po.id);
    for (const permissions of ["manage_inventory", "view_financials"]) {
      await asStaff(permissions);
      await expect(receive(po.id, [[line.id, 1]])).rejects.toThrow("NOT_AUTHORIZED");
    }
    await asStaff(undefined, OTHER);
    await expect(receive(po.id, [[line.id, 1]])).rejects.toThrow("NOT_AUTHORIZED");
    await asServer();
    await expect(receive(po.id, [[line.id, 1]])).rejects.toThrow("NOT_AUTHORIZED");
    await db.exec("SET ROLE anon");
    await expect(receive(po.id, [[line.id, 1]])).rejects.toThrow(/permission denied/);
    await asServer();
  });
});

describe("what arrived cannot be undone from a screen", () => {
  it("keeps a received line's size, cost and pieces, and the order's state and total", async () => {
    await asStaff();
    const po = await newOrder([
      { variant: small, quantity: 5, unit_cost: 12 },
      { variant: medium, quantity: 5, unit_cost: 12 },
    ]);
    const [s, m] = await items(po.id);
    await receive(po.id, [[s.id, 3]]);

    await expect(
      db.query("UPDATE public.purchase_order_items SET unit_cost = 1 WHERE id = $1", [s.id]),
    ).rejects.toThrow("PURCHASE_ORDER_LINE_ALREADY_RECEIVED");
    await expect(
      db.query("UPDATE public.purchase_order_items SET variant_id = $2 WHERE id = $1", [
        s.id,
        large,
      ]),
    ).rejects.toThrow("PURCHASE_ORDER_LINE_ALREADY_RECEIVED");
    await expect(
      db.query("UPDATE public.purchase_order_items SET quantity = 2 WHERE id = $1", [s.id]),
    ).rejects.toThrow("PURCHASE_ORDER_LINE_BELOW_RECEIVED");
    await expect(
      db.query("DELETE FROM public.purchase_order_items WHERE id = $1", [s.id]),
    ).rejects.toThrow("PURCHASE_ORDER_LINE_ALREADY_RECEIVED");
    await expect(
      db.query("DELETE FROM public.purchase_orders WHERE id = $1", [po.id]),
    ).rejects.toThrow("PURCHASE_ORDER_ALREADY_RECEIVED");
    await expect(
      db.query("UPDATE public.purchase_orders SET status = 'cancelled' WHERE id = $1", [po.id]),
    ).rejects.toThrow("PURCHASE_ORDER_ALREADY_RECEIVED");
    await expect(
      db.query("UPDATE public.purchase_orders SET status = 'received' WHERE id = $1", [po.id]),
    ).rejects.toThrow("PURCHASE_ORDER_STATE_IS_THE_DATABASES");

    // Writing the pieces that arrived, or the total, by hand changes nothing.
    await db.query("UPDATE public.purchase_order_items SET received_quantity = 5 WHERE id = $1", [
      s.id,
    ]);
    await db.query(
      "UPDATE public.purchase_orders SET total_amount = 1, paid_amount = 50 WHERE id = $1",
      [po.id],
    );
    expect((await items(po.id)).map((l) => l.received_quantity)).toEqual([3, 0]);
    expect(await order(po.id)).toMatchObject({
      status: "partially_received",
      total_amount: "120.000",
    });

    // The tailor made two fewer: the order is lowered to what came, and is received.
    await db.query("UPDATE public.purchase_order_items SET quantity = 3 WHERE id = $1", [s.id]);
    await db.query("DELETE FROM public.purchase_order_items WHERE id = $1", [m.id]);
    expect(await order(po.id)).toMatchObject({ status: "received", total_amount: "36.000" });
    await asServer();
  });

  it("lets an order with nothing received be changed, cancelled or deleted", async () => {
    await asStaff();
    const po = await newOrder([{ variant: small, quantity: 2, unit_cost: 10 }], "draft");
    const [line] = await items(po.id);
    await db.query(
      "UPDATE public.purchase_order_items SET quantity = 4, unit_cost = 11 WHERE id = $1",
      [line.id],
    );
    expect(await order(po.id)).toMatchObject({ status: "draft", total_amount: "44.000" });
    await db.query("UPDATE public.purchase_orders SET status = 'ordered' WHERE id = $1", [po.id]);
    expect((await order(po.id)).status).toBe("ordered");
    await db.query("UPDATE public.purchase_orders SET status = 'cancelled' WHERE id = $1", [po.id]);
    expect((await order(po.id)).status).toBe("cancelled");
    await db.query("DELETE FROM public.purchase_orders WHERE id = $1", [po.id]);
    expect(await order(po.id)).toBeUndefined();
    await asServer();
  });

  it("lets no browser write a receipt", async () => {
    await asStaff();
    await expect(db.query("DELETE FROM public.purchase_order_receipts")).rejects.toThrow(
      /permission denied/,
    );
    await asServer();
  });
});
