import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261031100000_storefront_funnel.sql?raw";

// A store's visitors and how far they get (migration 20261031100000), run in a real Postgres
// (PGlite) as a visitor, as the store's staff and as someone else's: a visitor records only a
// step of a visit to an open store, never reads one, and staff read their own store's funnel.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text UNIQUE, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, channel text, status text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  -- The store's staff, as the test says (the live function asks the session's memberships).
  CREATE FUNCTION public.can_access_brand(p_brand uuid) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT p_brand::text = current_setting('test.staff_of', true) $$;
  GRANT EXECUTE ON FUNCTION public.can_access_brand(uuid) TO anon, authenticated;

  CREATE SCHEMA cron;
  CREATE TABLE cron.job (jobid serial PRIMARY KEY, jobname text UNIQUE, schedule text, command text);
  CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint
    LANGUAGE sql AS $$ INSERT INTO cron.job (jobname, schedule, command) VALUES ($1, $2, $3) RETURNING jobid::bigint $$;
  CREATE FUNCTION cron.unschedule(job_name text) RETURNS boolean
    LANGUAGE sql AS $$ DELETE FROM cron.job WHERE jobname = $1 RETURNING true $$;

  INSERT INTO public.brands (id, slug, is_active) VALUES
    ('00000000-0000-4000-8000-000000000001', 'pura', true),
    ('00000000-0000-4000-8000-000000000002', 'closed', false);
`;

const PURA = "00000000-0000-4000-8000-000000000001";
let db: PGlite;

async function as(
  role: "anon" | "authenticated" | "service_role",
  sql: string,
  params: unknown[] = [],
) {
  await db.exec(`SET ROLE ${role}`);
  try {
    return { rows: (await db.query<Record<string, unknown>>(sql, params)).rows, error: null };
  } catch (error) {
    return { rows: [], error: (error as Error).message };
  } finally {
    await db.exec("RESET ROLE");
  }
}

const step = (slug: string, session: string, n: number) =>
  as("anon", "SELECT public.record_storefront_step($1, $2::uuid, $3)", [slug, session, n]);
const visit = (i: number) => `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

const funnel = async (role: "anon" | "authenticated" = "authenticated") =>
  as(
    role,
    "SELECT * FROM public.storefront_funnel($1::uuid, now() - interval '1 day', now() + interval '1 minute')",
    [PURA],
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(migration);
});

describe("a visit's steps", () => {
  it("are recorded by a visitor, and a step only ever goes up", async () => {
    expect((await step("pura", visit(1), 1)).error).toBeNull();
    await step("pura", visit(1), 3);
    await step("pura", visit(1), 2);
    const rows = await db.query<{ reached: number }>(
      "SELECT reached FROM public.storefront_sessions WHERE session_id = $1",
      [visit(1)],
    );
    expect(rows.rows).toEqual([{ reached: 3 }]);
  });

  it("are left out for a closed store, an unknown step or no visit", async () => {
    await step("closed", visit(90), 1);
    await step("nowhere", visit(91), 1);
    await step("pura", visit(92), 9);
    await step("pura", visit(93), 0);
    await as("anon", "SELECT public.record_storefront_step('pura', NULL, 1)");
    const count = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.storefront_sessions WHERE session_id <> $1",
      [visit(1)],
    );
    expect(count.rows[0].n).toBe(0);
  });

  it("cannot be read or written directly from a browser", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      expect((await as(role, "SELECT * FROM public.storefront_sessions")).error).toMatch(
        /permission denied/,
      );
      expect(
        (
          await as(
            role,
            "INSERT INTO public.storefront_sessions (brand_id, session_id) VALUES ($1, gen_random_uuid())",
            [PURA],
          )
        ).error,
      ).toMatch(/permission denied/);
    }
  });
});

describe("the funnel", () => {
  it("counts the visits at each step and the storefront orders placed, for the store's staff", async () => {
    await step("pura", visit(2), 1);
    await step("pura", visit(3), 2);
    await step("pura", visit(4), 4);
    await db.exec(`
      INSERT INTO public.orders (brand_id, channel, status) VALUES
        ('${PURA}', 'storefront', 'pending'),
        ('${PURA}', 'storefront', 'draft'),
        ('${PURA}', 'admin', 'completed'),
        ('${PURA}', 'storefront', 'failed');
    `);
    await db.exec(`SET test.staff_of = '${PURA}'`);
    const reply = await funnel();
    await db.exec("RESET test.staff_of");
    expect(reply.error).toBeNull();
    expect(reply.rows[0]).toEqual({
      visits: 4,
      product_views: 3,
      carts: 2,
      checkouts: 1,
      orders: 1,
    });
  });

  it("is refused to someone else's staff and to a visitor", async () => {
    await db.exec("SET test.staff_of = '00000000-0000-4000-8000-000000000002'");
    expect((await funnel()).error).toMatch(/FORBIDDEN/);
    await db.exec("RESET test.staff_of");
    expect((await funnel("anon")).error).toMatch(/permission denied/);
  });
});

describe("old visits", () => {
  it("are removed after 400 days by the nightly job, and nobody else may run it", async () => {
    await db.exec(`
      INSERT INTO public.storefront_sessions (brand_id, session_id, first_seen)
      VALUES ('${PURA}', gen_random_uuid(), now() - interval '401 days');
    `);
    expect((await as("anon", "SELECT public.delete_old_storefront_sessions()")).error).toMatch(
      /permission denied/,
    );
    const removed = await as("service_role", "SELECT public.delete_old_storefront_sessions() AS n");
    expect(removed.rows[0].n).toBe(1);
    const job = await db.query(
      "SELECT schedule FROM cron.job WHERE jobname = 'storefront_sessions_cleanup_nightly'",
    );
    expect(job.rows).toHaveLength(1);
  });
});
