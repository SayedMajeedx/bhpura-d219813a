import { PGlite } from "@electric-sql/pglite";
import ledgerFunctions from "../../supabase/migrations/20260926110000_inventory_ledger_functions.sql?raw";
import reconciliation from "../../supabase/migrations/20260926130000_inventory_reconciliation_job.sql?raw";
import partnerStock from "../../supabase/migrations/20261012160000_partner_stock_has_one_source.sql?raw";
import orderStateMachine from "../../supabase/migrations/20260926120000_order_inventory_state_machine.sql?raw";

/**
 * A real Postgres (PGlite) for supplier orders: the real stock ledger, its direct-write guard and
 * the nightly reconciliation, a small copy of the tables they touch, and the migrations given,
 * applied in order. A store with a supplier and a product in three sizes; helpers act as the
 * store's staff in a browser session (`authenticated`) or as the server.
 */

export const BRAND = "00000000-0000-4000-8000-0000000000b1";
export const OTHER = "00000000-0000-4000-8000-0000000000b2";
const STAFF = "00000000-0000-4000-8000-0000000000aa";

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
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
    status text DEFAULT 'confirmed', fulfillment_status text DEFAULT 'NEEDS_PACKING',
    payment_status text DEFAULT 'paid', payment_method text DEFAULT 'card',
    updated_at timestamptz DEFAULT now()
  );
  CREATE TABLE public.order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    brand_id uuid, product_id uuid, variant_id uuid, quantity integer NOT NULL DEFAULT 1,
    unit_cost numeric, description text, location text
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

// The browser's grants as Supabase gives them; what only the database writes is read-only.
const GRANTS = `
  GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
  DO $$
  DECLARE t text;
  BEGIN
    FOREACH t IN ARRAY ARRAY['purchase_order_receipts', 'purchase_order_payments'] LOOP
      IF to_regclass('public.' || t) IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
        EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
      END IF;
    END LOOP;
  END $$;
`;

export async function openSupplierOrdersDb(migrations: string[]) {
  const db = new PGlite();
  let supplier = "";
  const vendorId = () => supplier;
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
      [BRAND, vendorId(), status],
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

  await db.exec(SCHEMA);
  await db.exec(functionOf(partnerStock, "apply_inventory_movement"));
  await db.exec(functionOf(ledgerFunctions, "trg_guard_product_variants_stock_update"));
  await db.exec(`CREATE TRIGGER trg_guard_product_variants_stock_update
    BEFORE UPDATE OF stock_main, stock_incubator ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.trg_guard_product_variants_stock_update()`);
  await db.exec(functionOf(reconciliation, "reconcile_inventory"));
  // Whether an order is cancelled: the stock engine's own reading of it.
  await db.exec(functionOf(orderStateMachine, "order_inventory_desired_state"));
  for (const sql of migrations) await db.exec(sql);
  await db.exec(GRANTS);

  const tailor = (
    await one<{ id: string }>(
      "INSERT INTO public.vendors (brand_id, name) VALUES ($1, 'Umm Ali tailoring') RETURNING id",
      [BRAND],
    )
  ).id;
  const abaya = (
    await one<{ id: string }>("INSERT INTO public.products (brand_id) VALUES ($1) RETURNING id", [
      BRAND,
    ])
  ).id;
  const small = await newVariant(abaya);
  const medium = await newVariant(abaya);
  const large = await newVariant(abaya);
  supplier = tailor;

  return {
    db,
    one,
    asStaff,
    asServer,
    newVariant,
    newOrder,
    items,
    order,
    stock,
    cost,
    productCost,
    requestId,
    receive,
    tailor,
    abaya,
    small,
    medium,
    large,
  };
}
