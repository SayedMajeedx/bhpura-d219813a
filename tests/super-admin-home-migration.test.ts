import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261220100000_super_admin_home.sql?raw";

// The super admin home (migration 20261220100000), in a real Postgres (PGlite): each store's own
// figures and subscription for a super admin only, and a record kept of every store deleted,
// soft or hard, that outlives the store.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;

const STORE = "00000000-0000-4000-8000-0000000000b1";
const QUIET = "00000000-0000-4000-8000-0000000000b2";
const ADMIN = "00000000-0000-4000-8000-0000000000c1";

const as = async <T>(run: () => Promise<T>) => {
  await db.exec("SET ROLE authenticated");
  try {
    return await run();
  } finally {
    await db.exec("RESET ROLE");
  }
};
const setSuperAdmin = (on: boolean) =>
  db.query("UPDATE public.test_session SET super_admin = $1", [on]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
    INSERT INTO auth.users VALUES ('${ADMIN}', 'owner@example.com');
    CREATE TABLE public.test_session (super_admin boolean NOT NULL DEFAULT true, uid uuid);
    INSERT INTO public.test_session VALUES (true, '${ADMIN}');
    GRANT SELECT ON public.test_session TO anon, authenticated;
    CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE
      AS 'SELECT super_admin FROM public.test_session';
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS 'SELECT uid FROM public.test_session';
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE FUNCTION public.order_counts_as_sold(p_status text) RETURNS boolean LANGUAGE sql IMMUTABLE
      AS $$ SELECT COALESCE(p_status, '') NOT IN ('', 'cancelled', 'draft', 'refunded') $$;

    CREATE TABLE public.brands (
      id uuid PRIMARY KEY, slug text NOT NULL, name_en text, name_ar text,
      is_active boolean DEFAULT true, plan_type text, created_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.business_settings (brand_id uuid, store_vertical text, currency text);
    CREATE TABLE public.orders (
      brand_id uuid, status text, total numeric, created_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.products (brand_id uuid, archived_at timestamptz);
    CREATE TABLE public.saas_plans (id uuid PRIMARY KEY, code text);
    CREATE TABLE public.saas_plan_versions (
      id uuid PRIMARY KEY, price_monthly numeric, price_annual numeric, currency text
    );
    CREATE TABLE public.brand_subscriptions (
      brand_id uuid, status text, billing_interval text, plan_id uuid, plan_version_id uuid,
      current_period_end timestamptz, updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.saas_audit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), action text, actor_id uuid, actor_email text,
      brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE, target_type text,
      target_id text, changes jsonb, created_at timestamptz DEFAULT now()
    );
    GRANT SELECT, UPDATE, DELETE ON public.brands TO authenticated;

    INSERT INTO public.brands (id, slug, name_en, name_ar, plan_type) VALUES
      ('${STORE}', 'pura', 'Pura Line', 'بيورا لاين', 'monthly'),
      ('${QUIET}', 'quiet', 'Quiet', 'هادئ', 'trial');
    INSERT INTO public.business_settings VALUES ('${STORE}', 'abayas', 'BHD');
    INSERT INTO public.orders VALUES
      ('${STORE}', 'completed', 20, now() - interval '2 days'),
      ('${STORE}', 'pending', 15, now() - interval '1 day'),
      ('${STORE}', 'cancelled', 99, now()),
      ('${STORE}', 'completed', 40, now() - interval '60 days');
    INSERT INTO public.products VALUES ('${STORE}', NULL), ('${STORE}', NULL), ('${STORE}', now());
    INSERT INTO public.saas_plans VALUES ('00000000-0000-4000-8000-0000000000d1', 'pro');
    INSERT INTO public.saas_plan_versions VALUES ('00000000-0000-4000-8000-0000000000e1', 3, 30, 'BHD');
    INSERT INTO public.brand_subscriptions (brand_id, status, billing_interval, plan_id, plan_version_id, current_period_end)
      VALUES ('${STORE}', 'active', 'monthly', '00000000-0000-4000-8000-0000000000d1',
              '00000000-0000-4000-8000-0000000000e1', '2026-12-10T00:00:00Z');
  `);
  await db.exec(migration);
});

type Stats = {
  brand_id: string;
  store_vertical: string | null;
  orders_30d: number;
  sales_30d: string;
  orders_total: number;
  products: number;
  sub_plan_code: string | null;
  sub_price_monthly: string | null;
};

describe("each store's figures", () => {
  it("gives a super admin each store's sold orders, sales, products and subscription", async () => {
    const { rows } = await as(() =>
      db.query<Stats>("SELECT * FROM public.platform_store_stats() ORDER BY brand_id"),
    );
    expect(rows[0]).toMatchObject({
      brand_id: STORE,
      store_vertical: "abayas",
      orders_30d: 2,
      orders_total: 3,
      products: 2,
      sub_plan_code: "pro",
    });
    expect(Number(rows[0].sales_30d)).toBe(35);
    expect(Number(rows[0].sub_price_monthly)).toBe(3);
    expect(rows[1]).toMatchObject({ brand_id: QUIET, orders_30d: 0, products: 0 });
    expect(rows[1].sub_plan_code).toBeNull();
  });

  it("refuses anyone else", async () => {
    await setSuperAdmin(false);
    await expect(as(() => db.query("SELECT * FROM public.platform_store_stats()"))).rejects.toThrow(
      /NOT_SUPER_ADMIN/,
    );
    await setSuperAdmin(true);
    await expect(
      (async () => {
        await db.exec("SET ROLE anon");
        try {
          await db.query("SELECT * FROM public.platform_store_stats()");
        } finally {
          await db.exec("RESET ROLE");
        }
      })(),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("a deleted store is remembered", () => {
  const records = async () =>
    (
      await db.query<{ target_id: string; actor_email: string; changes: Record<string, unknown> }>(
        "SELECT target_id, actor_email, changes FROM public.saas_audit_logs WHERE action = 'brand.deleted' ORDER BY created_at, changes->>'mode' DESC",
      )
    ).rows;

  it("writes nothing for any other change to a store", async () => {
    await as(() => db.query("UPDATE public.brands SET slug = 'pura-line' WHERE id = $1", [STORE]));
    await as(() => db.query("UPDATE public.brands SET name_en = 'Pura' WHERE id = $1", [STORE]));
    expect(await records()).toEqual([]);
  });

  it("keeps a soft delete and a hard delete, after the store is gone", async () => {
    await as(() =>
      db.query(
        "UPDATE public.brands SET is_active = false, slug = 'quiet-deleted-1' WHERE id = $1",
        [QUIET],
      ),
    );
    await as(() => db.query("DELETE FROM public.brands WHERE id = $1", [STORE]));
    const kept = await records();
    expect(kept).toEqual([
      {
        target_id: QUIET,
        actor_email: "owner@example.com",
        changes: expect.objectContaining({ mode: "soft", slug: "quiet", name_ar: "هادئ" }),
      },
      {
        target_id: STORE,
        actor_email: "owner@example.com",
        changes: expect.objectContaining({ mode: "hard", slug: "pura-line", name_en: "Pura" }),
      },
    ]);
  });
});
