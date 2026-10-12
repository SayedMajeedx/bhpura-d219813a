import { beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import costTables from "../supabase/migrations/20261007170000_cost_tables_staff_only.sql?raw";
import migration from "../supabase/migrations/20261013150000_costs_need_the_financial_permission.sql?raw";

// What a store pays for its products is for staff who may see its finances (migration
// 20261013150000). Run in a real Postgres (PGlite) on top of the migration that made the cost
// tables, with the two permission functions as they are live, then read and written as an owner,
// as a stock clerk (manages the stock, does not see finances), as another store's owner and as
// the server.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-00000000000a";
const OTHER_BRAND = "00000000-0000-4000-8000-00000000000b";
const OWNER = "00000000-0000-4000-8000-0000000000a1";
const CLERK = "00000000-0000-4000-8000-0000000000a2";
const ACCOUNTANT = "00000000-0000-4000-8000-0000000000a3";
const OTHER_OWNER = "00000000-0000-4000-8000-0000000000b1";
const VENDOR = "00000000-0000-4000-8000-0000000000f1";
const P1 = "00000000-0000-4000-8000-000000000101";
const V1 = "00000000-0000-4000-8000-000000000201";
const P2 = "00000000-0000-4000-8000-000000000102";
const V2 = "00000000-0000-4000-8000-000000000202";

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

  CREATE TABLE public.brands (id uuid PRIMARY KEY);
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY, brand_id uuid, role text NOT NULL, status text NOT NULL DEFAULT 'active',
    permissions jsonb NOT NULL DEFAULT '[]'
  );
  -- The two permission functions as they are live.
  CREATE FUNCTION public.can_access_brand(_brand_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.status = 'active' AND p.role IS DISTINCT FROM 'courier'
        AND (p.role = 'super_admin' OR p.brand_id = _brand_id)
    );
  $$;
  CREATE FUNCTION public.has_permission(p_permission text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
  BEGIN
    RETURN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND status = 'active'
        AND (role IN ('admin', 'super_admin', 'brand_admin') OR jsonb_exists(permissions, p_permission))
    );
  END;
  $$;

  CREATE TABLE public.products (
    id uuid PRIMARY KEY, brand_id uuid NOT NULL, name text, base_price numeric DEFAULT 0,
    cost_price numeric NOT NULL DEFAULT 0, direct_packaging_cost numeric DEFAULT 0.000, vendor_id uuid
  );
  CREATE TABLE public.product_variants (
    id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
    brand_id uuid NOT NULL, size text, cost_price numeric NOT NULL DEFAULT 0
  );
  -- A new variant takes its product's cost, as live (inherit_product_variant_pricing).
  CREATE FUNCTION public.inherit_product_variant_pricing() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
  BEGIN
    SELECT COALESCE(p.cost_price, 0) INTO NEW.cost_price FROM public.products p WHERE p.id = NEW.product_id;
    RETURN NEW;
  END;
  $$;
  CREATE TRIGGER inherit_product_variant_pricing_trigger BEFORE INSERT ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.inherit_product_variant_pricing();

  ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "brand access" ON public.products FOR ALL TO authenticated
    USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));
  CREATE POLICY "brand access" ON public.product_variants FOR ALL TO authenticated
    USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));
  GRANT ALL ON public.products, public.product_variants TO authenticated, service_role;

  -- A function of the database's own that sets a cost (as the packaging functions do).
  CREATE FUNCTION public.set_packaging_cost(p_product uuid, p_cost numeric) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
    UPDATE public.products SET direct_packaging_cost = p_cost WHERE id = p_product;
  $$;

  INSERT INTO public.brands VALUES ('${BRAND}'), ('${OTHER_BRAND}');
  INSERT INTO public.profiles (id, brand_id, role, permissions) VALUES
    ('${OWNER}', '${BRAND}', 'brand_admin', '[]'),
    ('${CLERK}', '${BRAND}', 'staff', '["manage_inventory", "manage_orders"]'),
    ('${ACCOUNTANT}', '${BRAND}', 'staff', '["view_financials"]'),
    ('${OTHER_OWNER}', '${OTHER_BRAND}', 'brand_admin', '[]');
`;

let db: PGlite;

type Row = Record<string, unknown>;

/** Runs one statement as a signed-in person (or the server) and says how the database answered. */
async function as(uid: string | null, sql: string): Promise<{ rows: Row[]; error: string | null }> {
  await db.exec(
    `SET test.uid = '${uid ?? ""}'; SET ROLE ${uid ? "authenticated" : "service_role"};`,
  );
  try {
    return { rows: (await db.query<Row>(sql)).rows, error: null };
  } catch (error) {
    return { rows: [], error: (error as Error).message };
  } finally {
    await db.exec("RESET ROLE; RESET test.uid;");
  }
}

/** The costs as the database holds them, on both sides. */
async function stored(productId = P1, variantId = V1) {
  const product = await db.query<Row>(
    `SELECT p.cost_price::float AS column_cost, p.direct_packaging_cost::float AS column_packaging,
            p.vendor_id AS column_vendor, c.cost_price::float AS table_cost,
            c.direct_packaging_cost::float AS table_packaging
     FROM public.products p LEFT JOIN public.product_costs c ON c.product_id = p.id WHERE p.id = $1`,
    [productId],
  );
  const variant = await db.query<Row>(
    `SELECT v.cost_price::float AS column_cost, c.cost_price::float AS table_cost
     FROM public.product_variants v LEFT JOIN public.variant_costs c ON c.variant_id = v.id WHERE v.id = $1`,
    [variantId],
  );
  return { product: product.rows[0], variant: variant.rows[0] };
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(costTables);
  await db.exec(migration);
  await db.exec(`
    INSERT INTO public.products (id, brand_id, name, cost_price, direct_packaging_cost, vendor_id)
      VALUES ('${P1}', '${BRAND}', 'Abaya', 12.5, 0.75, '${VENDOR}');
    INSERT INTO public.product_variants (id, product_id, brand_id, size) VALUES ('${V1}', '${P1}', '${BRAND}', 'M');
  `);
});

describe("reading what a product costs", () => {
  it("is for the store's owner and for staff given the financial permission", async () => {
    for (const person of [OWNER, ACCOUNTANT]) {
      const product = await as(
        person,
        "SELECT cost_price::float AS cost FROM public.product_costs",
      );
      const variant = await as(
        person,
        "SELECT cost_price::float AS cost FROM public.variant_costs",
      );
      expect(product.rows).toEqual([{ cost: 12.5 }]);
      expect(variant.rows).toEqual([{ cost: 12.5 }]);
    }
  });

  it("is not for a stock clerk, nor for another store's owner", async () => {
    for (const person of [CLERK, OTHER_OWNER]) {
      expect((await as(person, "SELECT * FROM public.product_costs")).rows).toEqual([]);
      expect((await as(person, "SELECT * FROM public.variant_costs")).rows).toEqual([]);
    }
  });

  it("says who may, through one function a visitor cannot call", async () => {
    const may = async (person: string) =>
      (await as(person, `SELECT public.can_view_brand_costs('${BRAND}') AS may`)).rows[0]?.may;
    expect(await may(OWNER)).toBe(true);
    expect(await may(ACCOUNTANT)).toBe(true);
    expect(await may(CLERK)).toBe(false);
    expect(await may(OTHER_OWNER)).toBe(false);
    await db.exec("SET ROLE anon");
    await expect(db.query(`SELECT public.can_view_brand_costs('${BRAND}')`)).rejects.toThrow(
      /permission denied/,
    );
    await db.exec("RESET ROLE");
  });
});

describe("a stock clerk saving a product", () => {
  it("changes the product and leaves its costs as they are, whatever the form sent", async () => {
    // The clerk's form could not read the costs, so it sends zeros and no supplier.
    const saved = await as(
      CLERK,
      `UPDATE public.products SET name = 'Abaya, black', cost_price = 0, direct_packaging_cost = 0, vendor_id = NULL
       WHERE id = '${P1}' RETURNING name`,
    );
    expect(saved.rows).toEqual([{ name: "Abaya, black" }]);
    expect((await stored()).product).toEqual({
      column_cost: 12.5,
      column_packaging: 0.75,
      column_vendor: VENDOR,
      table_cost: 12.5,
      table_packaging: 0.75,
    });
  });

  it("cannot raise a cost either, nor write the cost tables directly", async () => {
    await as(CLERK, `UPDATE public.products SET cost_price = 99 WHERE id = '${P1}'`);
    await as(
      CLERK,
      `UPDATE public.product_variants SET cost_price = 99, size = 'L' WHERE id = '${V1}'`,
    );
    await as(CLERK, `UPDATE public.product_costs SET cost_price = 99 WHERE product_id = '${P1}'`);
    await as(CLERK, `UPDATE public.variant_costs SET cost_price = 99 WHERE variant_id = '${V1}'`);
    const inserted = await as(
      CLERK,
      `INSERT INTO public.product_costs (product_id, brand_id, cost_price) VALUES ('${P2}', '${BRAND}', 5)`,
    );
    expect(inserted.error).toMatch(/row-level security/);

    const now = await stored();
    expect(now.product).toMatchObject({ column_cost: 12.5, table_cost: 12.5 });
    expect(now.variant).toEqual({ column_cost: 12.5, table_cost: 12.5 });
    // The rest of the variant's save went through.
    expect(
      (await db.query<Row>(`SELECT size FROM public.product_variants WHERE id = '${V1}'`)).rows,
    ).toEqual([{ size: "L" }]);
  });

  it("makes a new product with no cost, and a new variant with its product's cost", async () => {
    const made = await as(
      CLERK,
      `INSERT INTO public.products (id, brand_id, name, cost_price, direct_packaging_cost, vendor_id)
       VALUES ('${P2}', '${BRAND}', 'Scarf', 40, 3, '${VENDOR}')`,
    );
    expect(made.error).toBeNull();
    expect((await stored(P2)).product).toEqual({
      column_cost: 0,
      column_packaging: 0,
      column_vendor: null,
      table_cost: 0,
      table_packaging: 0,
    });

    const variant = await as(
      CLERK,
      `INSERT INTO public.product_variants (id, product_id, brand_id, size, cost_price)
       VALUES ('${V2}', '${P1}', '${BRAND}', 'S', 1)`,
    );
    expect(variant.error).toBeNull();
    expect((await stored(P1, V2)).variant).toEqual({ column_cost: 12.5, table_cost: 12.5 });
  });
});

describe("everyone who could change a cost before", () => {
  it("still can: the owner and staff with the permission, through the form's columns or the tables", async () => {
    await as(
      OWNER,
      `UPDATE public.products SET cost_price = 14, vendor_id = NULL WHERE id = '${P1}'`,
    );
    await as(OWNER, `UPDATE public.product_variants SET cost_price = 13 WHERE id = '${V1}'`);
    let now = await stored();
    expect(now.product).toMatchObject({ column_cost: 14, table_cost: 14, column_vendor: null });
    expect(now.variant).toEqual({ column_cost: 13, table_cost: 13 });

    await as(
      ACCOUNTANT,
      `UPDATE public.product_costs SET cost_price = 15 WHERE product_id = '${P1}'`,
    );
    await as(ACCOUNTANT, `UPDATE public.products SET direct_packaging_cost = 1 WHERE id = '${P1}'`);
    now = await stored();
    expect(now.product).toMatchObject({
      column_cost: 15,
      table_cost: 15,
      column_packaging: 1,
      table_packaging: 1,
    });

    const made = await as(
      OWNER,
      `INSERT INTO public.products (id, brand_id, name, cost_price) VALUES ('${P2}', '${BRAND}', 'Scarf', 40)`,
    );
    expect(made.error).toBeNull();
    expect((await stored(P2)).product).toMatchObject({ column_cost: 40, table_cost: 40 });
  });

  it("still can: the server, and a function of the database's own, even when a clerk calls it", async () => {
    await as(null, `UPDATE public.products SET cost_price = 20 WHERE id = '${P1}'`);
    expect((await stored()).product).toMatchObject({ column_cost: 20, table_cost: 20 });

    const called = await as(CLERK, `SELECT public.set_packaging_cost('${P1}', 2)`);
    expect(called.error).toBeNull();
    expect((await stored()).product).toMatchObject({ column_packaging: 2, table_packaging: 2 });
  });

  it("another store's owner changes nothing here", async () => {
    await as(OTHER_OWNER, `UPDATE public.products SET cost_price = 1 WHERE id = '${P1}'`);
    await as(
      OTHER_OWNER,
      `UPDATE public.product_costs SET cost_price = 1 WHERE product_id = '${P1}'`,
    );
    expect((await stored()).product).toMatchObject({ column_cost: 12.5, table_cost: 12.5 });
  });
});

describe("the migration itself", () => {
  it("can be applied twice", async () => {
    await db.exec(migration);
    expect((await as(OWNER, "SELECT 1 AS ok FROM public.product_costs")).rows).toEqual([{ ok: 1 }]);
    const policies = await db.query<Row>(
      "SELECT tablename, policyname FROM pg_policies WHERE tablename IN ('product_costs', 'variant_costs') ORDER BY 1",
    );
    expect(policies.rows).toEqual([
      { tablename: "product_costs", policyname: "staff who see finances" },
      { tablename: "variant_costs", policyname: "staff who see finances" },
    ]);
  });
});
