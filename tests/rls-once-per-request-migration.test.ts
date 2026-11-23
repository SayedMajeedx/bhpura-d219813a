import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import twoFactor from "../supabase/migrations/20261027150000_staff_two_factor.sql?raw";
import migration from "../supabase/migrations/20261221100000_rls_once_per_request.sql?raw";

// Row rules ask who the caller is once per request (migration 20261221100000), in a real
// Postgres with the live permission functions (two-factor included): every kind of person sees
// and may write exactly the rows they could before, and no rule calls a permission function
// for each row any more.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const OWNER = "00000000-0000-4000-8000-00000000000a";
const CLERK = "00000000-0000-4000-8000-00000000000c";
const FINANCE = "00000000-0000-4000-8000-00000000000f";
const COURIER = "00000000-0000-4000-8000-000000000001";
const SUPER = "00000000-0000-4000-8000-000000000002";
const LOCKED = "00000000-0000-4000-8000-000000000003";
const GONE = "00000000-0000-4000-8000-000000000004";

type Who = { uid: string; aal: "aal1" | "aal2" };
const PEOPLE: Record<string, Who> = {
  owner: { uid: OWNER, aal: "aal1" },
  clerk: { uid: CLERK, aal: "aal1" },
  finance: { uid: FINANCE, aal: "aal1" },
  courier: { uid: COURIER, aal: "aal1" },
  superAdmin: { uid: SUPER, aal: "aal1" },
  superAdminWithCode: { uid: SUPER, aal: "aal2" },
  twoFactorNoCode: { uid: LOCKED, aal: "aal1" },
  twoFactorWithCode: { uid: LOCKED, aal: "aal2" },
  deactivated: { uid: GONE, aal: "aal1" },
};

// The shapes the live rules take (pg_policies of 2026-11-22).
const RULES = `
  CREATE POLICY "brand access" ON public.products TO authenticated
    USING (can_access_brand(brand_id)) WITH CHECK (can_access_brand(brand_id));
  CREATE POLICY "staff who see finances" ON public.variant_costs TO authenticated
    USING (can_view_brand_costs(brand_id)) WITH CHECK (can_view_brand_costs(brand_id));
  CREATE POLICY "order managers" ON public.orders TO authenticated
    USING (can_access_brand(brand_id) AND has_permission('manage_orders'::text))
    WITH CHECK (can_access_brand(brand_id) AND has_permission('manage_orders'::text));
  CREATE POLICY "order lines" ON public.order_items TO authenticated
    USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND can_access_brand(o.brand_id)));
  CREATE POLICY "super admins" ON public.system_health_events TO authenticated
    USING (is_super_admin());
  CREATE POLICY "admins insert" ON public.notes FOR INSERT TO authenticated
    WITH CHECK (is_admin() AND can_access_brand(brand_id));
  CREATE POLICY "own notes" ON public.notes FOR SELECT TO authenticated
    USING ((( SELECT auth.uid() AS uid) IS NOT NULL) AND ((brand_id IS NULL) OR can_access_brand(brand_id)));
  CREATE POLICY "my store" ON public.brands TO authenticated
    USING (can_access_brand(id) OR id = current_brand_id());
`;

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql
      AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql
      AS $$ SELECT COALESCE(NULLIF(current_setting('test.jwt', true), ''), '{}')::jsonb $$;
    CREATE TABLE auth.mfa_factors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
      status text);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, brand_id uuid, role text, status text,
      permissions jsonb DEFAULT '{}');
    INSERT INTO public.profiles VALUES
      ('${OWNER}', '${BRAND}', 'admin', 'active', '{}'),
      ('${CLERK}', '${BRAND}', 'staff', 'active', '{"manage_orders": true}'),
      ('${FINANCE}', '${BRAND}', 'staff', 'active', '{"view_financials": true}'),
      ('${COURIER}', '${BRAND}', 'courier', 'active', '{"manage_orders": true}'),
      ('${SUPER}', NULL, 'super_admin', 'active', '{}'),
      ('${LOCKED}', '${OTHER}', 'brand_admin', 'active', '{}'),
      ('${GONE}', '${BRAND}', 'admin', 'inactive', '{}');
    INSERT INTO auth.mfa_factors (user_id, status) VALUES ('${LOCKED}', 'verified');
  `);
  await db.exec(twoFactor);
  await db.exec(`
    CREATE FUNCTION public.can_view_brand_costs(_brand_id uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
      AS $$ SELECT public.can_access_brand(_brand_id) AND public.has_permission('view_financials') $$;
    CREATE FUNCTION public.current_brand_id() RETURNS uuid
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
      AS $$ SELECT brand_id FROM public.profiles WHERE id = auth.uid() $$;
    CREATE TABLE public.brands (id uuid PRIMARY KEY);
    CREATE TABLE public.products (id serial PRIMARY KEY, brand_id uuid);
    CREATE TABLE public.variant_costs (id serial PRIMARY KEY, brand_id uuid);
    CREATE TABLE public.orders (id serial PRIMARY KEY, brand_id uuid);
    CREATE TABLE public.order_items (id serial PRIMARY KEY, order_id int);
    CREATE TABLE public.system_health_events (id serial PRIMARY KEY, created_at timestamptz DEFAULT now());
    CREATE TABLE public.notes (id serial PRIMARY KEY, brand_id uuid);
    INSERT INTO public.brands VALUES ('${BRAND}'), ('${OTHER}');
    INSERT INTO public.products (brand_id) VALUES ('${BRAND}'), ('${BRAND}'), ('${OTHER}'), (NULL);
    INSERT INTO public.variant_costs (brand_id) VALUES ('${BRAND}'), ('${OTHER}');
    INSERT INTO public.orders (brand_id) VALUES ('${BRAND}'), ('${OTHER}');
    INSERT INTO public.order_items (order_id) VALUES (1), (1), (2);
    INSERT INTO public.system_health_events DEFAULT VALUES;
    INSERT INTO public.notes (brand_id) VALUES ('${BRAND}'), ('${OTHER}'), (NULL);
    DO $$ DECLARE t text; BEGIN
      FOREACH t IN ARRAY ARRAY['brands','products','variant_costs','orders','order_items',
        'system_health_events','notes'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated', t);
      END LOOP;
    END $$;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
    ${RULES}
  `);
});

const TABLES = [
  "brands",
  "products",
  "variant_costs",
  "orders",
  "order_items",
  "system_health_events",
  "notes",
];

/** What a person sees of every table, and which stores' rows they may add. */
async function whatTheyGet(who: Who) {
  const seen: Record<string, string> = {};
  await db.exec("BEGIN");
  await db.query("SELECT set_config('test.uid', $1, true), set_config('test.jwt', $2, true)", [
    who.uid,
    JSON.stringify({ aal: who.aal }),
  ]);
  await db.exec("SET LOCAL ROLE authenticated");
  for (const table of TABLES) {
    const rows = await db.query<{ id: unknown }>(`SELECT id FROM public.${table} ORDER BY id`);
    seen[table] = rows.rows.map((row) => String(row.id)).join(",");
  }
  for (const [table, brand] of [
    ["products", BRAND],
    ["products", OTHER],
    ["orders", BRAND],
    ["notes", BRAND],
  ] as const) {
    let allowed = true;
    try {
      await db.exec("SAVEPOINT w");
      await db.query(`INSERT INTO public.${table} (brand_id) VALUES ($1)`, [brand]);
    } catch {
      allowed = false;
    }
    await db.exec("ROLLBACK TO SAVEPOINT w");
    seen[`write ${table} ${brand === BRAND ? "own" : "other"}`] = String(allowed);
  }
  await db.exec("ROLLBACK");
  return seen;
}

async function everyone() {
  const all: Record<string, Record<string, string>> = {};
  for (const [name, who] of Object.entries(PEOPLE)) all[name] = await whatTheyGet(who);
  return all;
}

describe("the row rules, asked once per request", () => {
  let before: Record<string, Record<string, string>>;

  beforeAll(async () => {
    before = await everyone();
    await db.exec(migration);
  });

  it("give every kind of person exactly what they had", async () => {
    expect(before.owner.products).toBe("1,2");
    expect(before.superAdmin.products).toBe("1,2,3,4");
    expect(before.courier.products).toBe("");
    expect(before.twoFactorNoCode.products).toBe("");
    expect(before.twoFactorWithCode.products).toBe("3");
    expect(before.finance.variant_costs).toBe("1");
    expect(await everyone()).toEqual(before);
  });

  it("call no permission function for each row", async () => {
    const rules = await db.query<{ expr: string }>(
      `SELECT coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
         FROM pg_policies WHERE schemaname = 'public'`,
    );
    const perRow =
      /(?<!SELECT )\b(can_access_brand|can_view_brand_costs|has_permission|is_super_admin|is_admin|current_brand_id|auth\.uid)\(/;
    for (const { expr } of rules.rows) expect(expr).not.toMatch(perRow);
  });

  it("can be run twice and changes nothing the second time", async () => {
    const read = async () =>
      (
        await db.query<{ q: string }>(
          "SELECT string_agg(policyname || coalesce(qual, '') || coalesce(with_check, ''), '|' ORDER BY policyname) AS q FROM pg_policies",
        )
      ).rows[0].q;
    const once = await read();
    await db.exec(migration);
    expect(await read()).toBe(once);
  });

  it("rewrites the live rules' shapes as meant", async () => {
    const rewrite = async (expr: string) =>
      (
        await db.query<{ out: string }>(
          "SELECT public.rls_expression_once_per_request($1) AS out",
          [expr],
        )
      ).rows[0].out;
    expect(await rewrite("can_access_brand(brand_id)")).toBe(
      "((SELECT is_super_admin()) OR brand_id = (SELECT staff_brand_id()))",
    );
    expect(await rewrite("can_access_brand(po.brand_id)")).toBe(
      "((SELECT is_super_admin()) OR po.brand_id = (SELECT staff_brand_id()))",
    );
    expect(await rewrite("has_permission('manage_orders'::text)")).toBe(
      "(SELECT has_permission('manage_orders'::text))",
    );
    expect(await rewrite("( SELECT auth.uid() AS uid)")).toBe("( SELECT auth.uid() AS uid)");
    expect(await rewrite("post_kit_may_write(brand_id)")).toBe("post_kit_may_write(brand_id)");
  });

  it("keeps the rewriting function from the browser", async () => {
    const grants = await db.query<{ anon: boolean; auth: boolean; staff: boolean }>(
      `SELECT has_function_privilege('anon', 'public.rls_expression_once_per_request(text)', 'execute') AS anon,
              has_function_privilege('authenticated', 'public.rls_expression_once_per_request(text)', 'execute') AS auth,
              has_function_privilege('anon', 'public.staff_brand_id()', 'execute') AS staff`,
    );
    expect(grants.rows[0]).toEqual({ anon: false, auth: false, staff: false });
  });
});

// A rule written later keeps the form: a permission call in a rule sits in a sub-select, and a
// store check is `(SELECT is_super_admin()) OR brand_id = (SELECT staff_brand_id())`.
const LATER = import.meta.glob("../supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("a row rule written after 20261221100000", () => {
  it("asks who the caller is once per request", () => {
    const perRow =
      /(?<!SELECT )\b(can_access_brand|can_view_brand_costs|has_permission|is_super_admin|is_admin|current_brand_id|auth\.uid)\(/i;
    for (const [file, sql] of Object.entries(LATER)) {
      const version = file.split("/").pop()!.slice(0, 14);
      if (version <= "20261221100000") continue;
      for (const policy of sql.match(/(CREATE|ALTER) POLICY[\s\S]*?;/gi) ?? []) {
        expect(policy, file).not.toMatch(perRow);
      }
    }
  });
});
