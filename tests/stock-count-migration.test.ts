import { beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import ledgerFunctions from "../supabase/migrations/20260926110000_inventory_ledger_functions.sql?raw";
import reconciliation from "../supabase/migrations/20260926130000_inventory_reconciliation_job.sql?raw";
import partnerStock from "../supabase/migrations/20261012160000_partner_stock_has_one_source.sql?raw";
import migration from "../supabase/migrations/20261231100000_stock_counts.sql?raw";

// A full stock count (migration 20261231100000), in a real Postgres (PGlite) with the real stock
// ledger, its guard on direct writes and the nightly reconciliation: a count of the store or a
// category, several staff counting at once, a sale during the count never read as a loss, every
// difference applied in one step through the ledger, and the reconciliation agreeing after.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
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
    AS $$ SELECT COALESCE(current_setting('app.brand', true), '') = b::text $$;
  CREATE FUNCTION public.has_permission(p text) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT p = ANY (string_to_array(COALESCE(current_setting('app.permission', true), ''), ',')) $$;
  CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.staff_brand_id() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.brand', true), '')::uuid $$;
  CREATE TABLE public.brands (id uuid PRIMARY KEY);
  INSERT INTO public.brands VALUES ('${BRAND}'), ('${OTHER}');
  CREATE TABLE public.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, category text,
    item_kind text DEFAULT 'product', is_package boolean DEFAULT false,
    is_made_to_order boolean DEFAULT false, archived_at timestamptz
  );
  CREATE TABLE public.product_variants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid REFERENCES public.products(id),
    brand_id uuid, stock_main integer DEFAULT 0, stock_incubator integer DEFAULT 0,
    stock integer DEFAULT 0, archived_at timestamptz,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  );
  CREATE TABLE public.inventory_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, variant_id uuid NOT NULL,
    location text NOT NULL, delta integer NOT NULL, balance_after integer NOT NULL CHECK (balance_after >= 0),
    reason text NOT NULL, reference_type text, reference_id uuid, idempotency_key text NOT NULL,
    actor_id uuid, note text, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
  CREATE UNIQUE INDEX uq_inventory_movements_brand_idempotency
    ON public.inventory_movements (brand_id, idempotency_key);
  CREATE TABLE public.inventory_reconciliation_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, started_at timestamptz,
    finished_at timestamptz, variants_checked integer, drift_count integer, details jsonb
  );
  CREATE TABLE public.orders (id uuid PRIMARY KEY, brand_id uuid, status text);
`;

let db: PGlite;
const one = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];
const asStaff = (permissions = "manage_inventory", brand = BRAND) =>
  db.exec(
    `RESET ROLE; SET app.uid = '${STAFF}'; SET app.brand = '${brand}';
     SET app.permission = '${permissions}'; SET ROLE authenticated`,
  );
const asServer = () =>
  db.exec("RESET ROLE; SET app.uid = ''; SET app.brand = ''; SET app.permission = ''");

/** A product with sizes holding these pieces, its opening stock through the ledger. */
async function product(stocks: number[], over: Record<string, unknown> = {}) {
  await asServer();
  const cols = Object.keys(over);
  const p = (
    await one<{ id: string }>(
      `INSERT INTO public.products (brand_id${cols.map((c) => `, ${c}`).join("")})
       VALUES ($1${cols.map((_, i) => `, $${i + 2}`).join("")}) RETURNING id`,
      [BRAND, ...cols.map((c) => over[c])],
    )
  ).id;
  const sizes: string[] = [];
  for (const stock of stocks) {
    const v = (
      await one<{ id: string }>(
        "INSERT INTO public.product_variants (product_id, brand_id) VALUES ($1, $2) RETURNING id",
        [p, BRAND],
      )
    ).id;
    if (stock > 0) await move(v, stock, "manual_adjust", "manual_adjust");
    sizes.push(v);
  }
  return { id: p, sizes };
}

/** A move on the shelf through the ledger, as an order or a delivery makes it. */
async function move(variant: string, delta: number, reason = "order_commit", ref = "order") {
  await asServer();
  await db.query(`SELECT public.apply_inventory_movement($1, $2, 'main', $3, $4, $5, NULL, $6)`, [
    BRAND,
    variant,
    delta,
    reason,
    ref,
    `t:${Math.random()}`,
  ]);
}
const stock = async (variant: string) =>
  (
    await one<{ s: number }>("SELECT stock_main AS s FROM public.product_variants WHERE id = $1", [
      variant,
    ])
  ).s;

const start = async (category: string | null = null) => {
  await asStaff();
  return (
    await one<{ r: { id: string; number: number; sizes: number } }>(
      "SELECT public.start_stock_count($1, $2, 'Year end') AS r",
      [BRAND, category],
    )
  ).r;
};
const record = async (
  count: string,
  variant: string,
  mode: string,
  value: number | null = null,
) => {
  await asStaff();
  return db.query("SELECT public.record_stock_count($1, $2, $3, $4)", [
    count,
    variant,
    mode,
    value,
  ]);
};
const review = async (count: string) => {
  await asStaff();
  return (
    await db.query<{
      variant_id: string;
      counted: number | null;
      moved_during: number;
      difference: number | null;
    }>("SELECT variant_id, counted, moved_during, difference FROM public.stock_count_review($1)", [
      count,
    ])
  ).rows;
};
const apply = async (count: string) => {
  await asStaff();
  return (
    await one<{ r: { changed: number; pieces: number } }>(
      "SELECT public.apply_stock_count($1) AS r",
      [count],
    )
  ).r;
};

beforeEach(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(functionOf(partnerStock, "apply_inventory_movement"));
  await db.exec(functionOf(ledgerFunctions, "trg_guard_product_variants_stock_update"));
  await db.exec(`CREATE TRIGGER trg_guard_product_variants_stock_update
    BEFORE UPDATE OF stock_main, stock_incubator ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.trg_guard_product_variants_stock_update()`);
  await db.exec(functionOf(reconciliation, "reconcile_inventory"));
  await db.exec(migration);
  await db.exec("GRANT SELECT ON public.products, public.product_variants TO authenticated");
});

describe("starting a count", () => {
  it("takes every size on the shelf with its stock, numbered for the store", async () => {
    const abaya = await product([3, 0]);
    await product([5], { item_kind: "service" });
    await product([2], { is_package: true });
    const tailored = await product([0], { is_made_to_order: true });
    const archived = await product([1], { archived_at: new Date().toISOString() });
    const started = await start();
    expect(started).toMatchObject({ number: 1, sizes: 2 });
    await asServer();
    const lines = (
      await db.query<{ variant_id: string; expected: number }>(
        "SELECT variant_id, expected FROM public.stock_count_lines ORDER BY expected DESC",
      )
    ).rows;
    expect(lines).toEqual([
      { variant_id: abaya.sizes[0], expected: 3 },
      { variant_id: abaya.sizes[1], expected: 0 },
    ]);
    expect(lines.map((l) => l.variant_id)).not.toContain(tailored.sizes[0]);
    expect(lines.map((l) => l.variant_id)).not.toContain(archived.sizes[0]);
  });

  it("counts one category when asked, and one count at a time", async () => {
    await product([3], { category: "abayas" });
    await product([4], { category: "scarves" });
    const started = await start("scarves");
    expect(started.sizes).toBe(1);
    await expect(start()).rejects.toThrow(/STOCK_COUNT_OPEN/);
    await asStaff();
    await db.query("SELECT public.cancel_stock_count($1)", [started.id]);
    const second = await start();
    expect(second.number).toBe(2);
    await asStaff();
    await db.query("SELECT public.cancel_stock_count($1)", [second.id]);
    await expect(start("nothing-here")).rejects.toThrow(/STOCK_COUNT_EMPTY/);
  });

  it("is only for the store's staff who manage inventory", async () => {
    await product([3]);
    await asStaff("manage_orders");
    await expect(db.query("SELECT public.start_stock_count($1)", [BRAND])).rejects.toThrow(
      /NOT_AUTHORIZED/,
    );
    await asStaff("manage_inventory", OTHER);
    await expect(db.query("SELECT public.start_stock_count($1)", [BRAND])).rejects.toThrow(
      /NOT_AUTHORIZED/,
    );
  });
});

describe("counting", () => {
  it("adds a scan, sets a typed number, and clears it, for several staff at once", async () => {
    const abaya = await product([3]);
    const { id } = await start();
    const v = abaya.sizes[0];
    await record(id, v, "add", 1);
    await record(id, v, "add", 1);
    await asServer();
    expect(
      (await one<{ counted: number }>("SELECT counted FROM public.stock_count_lines")).counted,
    ).toBe(2);
    await record(id, v, "set", 7);
    await asServer();
    expect(
      (await one<{ counted: number }>("SELECT counted FROM public.stock_count_lines")).counted,
    ).toBe(7);
    await record(id, v, "clear");
    await asServer();
    expect(
      (await one<{ counted: number | null }>("SELECT counted FROM public.stock_count_lines"))
        .counted,
    ).toBeNull();
  });

  it("refuses a size not in the count, a negative count, and a closed count", async () => {
    const abaya = await product([3], { category: "abayas" });
    const scarf = await product([1], { category: "scarves" });
    const { id } = await start("abayas");
    await expect(record(id, scarf.sizes[0], "add", 1)).rejects.toThrow(/NOT_IN_COUNT/);
    await expect(record(id, abaya.sizes[0], "add", -1)).rejects.toThrow(/INVALID_COUNT/);
    await expect(record(id, abaya.sizes[0], "set", -2)).rejects.toThrow(/INVALID_COUNT/);
    await asStaff();
    await db.query("SELECT public.cancel_stock_count($1)", [id]);
    await expect(record(id, abaya.sizes[0], "set", 1)).rejects.toThrow(/STOCK_COUNT_CLOSED/);
  });
});

describe("what the count found, and applying it", () => {
  it("applies every difference through the ledger, and the reconciliation agrees", async () => {
    const abaya = await product([5, 2, 4]);
    const [a, b, c] = abaya.sizes;
    const { id } = await start();
    await record(id, a, "set", 3); // two lost
    await record(id, b, "set", 4); // two found
    // c is not counted: it keeps its stock.
    expect((await review(id)).find((r) => r.variant_id === a)).toMatchObject({ difference: -2 });
    expect(await apply(id)).toEqual({ changed: 2, pieces: 0 });
    expect([await stock(a), await stock(b), await stock(c)]).toEqual([3, 4, 4]);
    await asServer();
    const ledger = (
      await db.query<{ delta: number; reason: string; reference_type: string; note: string }>(
        "SELECT delta, reason, reference_type, note FROM public.inventory_movements WHERE reference_type = 'stock_count' ORDER BY delta",
      )
    ).rows;
    expect(ledger).toEqual([
      { delta: -2, reason: "correction", reference_type: "stock_count", note: "SC-0001" },
      { delta: 2, reason: "correction", reference_type: "stock_count", note: "SC-0001" },
    ]);
    await db.query("SELECT public.reconcile_inventory($1)", [BRAND]);
    expect([await stock(a), await stock(b), await stock(c)]).toEqual([3, 4, 4]);
    await expect(apply(id)).rejects.toThrow(/STOCK_COUNT_CLOSED/);
  });

  it("never reads a sale made during the count as a loss, before or after the size was counted", async () => {
    const abaya = await product([5, 5]);
    const [before, after] = abaya.sizes;
    const { id } = await start();
    await move(before, -1); // sold before it was counted: 4 on the shelf
    await record(id, before, "set", 4);
    await record(id, after, "set", 5);
    await move(after, -2); // sold after it was counted
    const found = await review(id);
    expect(found.find((r) => r.variant_id === before)).toMatchObject({
      moved_during: -1,
      difference: 0,
    });
    expect(found.find((r) => r.variant_id === after)).toMatchObject({ difference: 0 });
    expect(await apply(id)).toEqual({ changed: 0, pieces: 0 });
    expect([await stock(before), await stock(after)]).toEqual([4, 3]);
  });

  it("keeps a real loss found after a sale, and never takes the shelf below nothing", async () => {
    const abaya = await product([5]);
    const [v] = abaya.sizes;
    const { id } = await start();
    await record(id, v, "set", 2); // three missing
    await move(v, -1); // then one sold: 4 in the system
    expect(await apply(id)).toEqual({ changed: 1, pieces: -3 });
    expect(await stock(v)).toBe(1);
  });

  it("remembers what each size moved, for the count's report", async () => {
    const abaya = await product([5]);
    const [v] = abaya.sizes;
    const { id } = await start();
    await move(v, -1);
    await record(id, v, "set", 3);
    await apply(id);
    await asServer();
    expect(
      await one(
        "SELECT expected, counted, moved_during, applied_delta FROM public.stock_count_lines",
      ),
    ).toEqual({ expected: 5, counted: 3, moved_during: -1, applied_delta: -1 });
    expect((await review(id))[0]).toMatchObject({ counted: 3, moved_during: -1, difference: -1 });
  });
});

describe("who may see and write it", () => {
  it("is read by the store's staff and written only by its functions", async () => {
    await product([3]);
    const { id } = await start();
    await asStaff("manage_orders");
    expect((await db.query("SELECT 1 FROM public.stock_counts")).rows).toHaveLength(1);
    await expect(db.query("UPDATE public.stock_count_lines SET counted = 9")).rejects.toThrow(
      /permission denied/,
    );
    await asStaff("manage_inventory", OTHER);
    expect((await db.query("SELECT 1 FROM public.stock_counts")).rows).toHaveLength(0);
    await asStaff("manage_orders");
    await expect(db.query("SELECT public.apply_stock_count($1)", [id])).rejects.toThrow(
      /NOT_AUTHORIZED/,
    );
  });
});
