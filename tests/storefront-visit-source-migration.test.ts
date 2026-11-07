import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import funnel from "../supabase/migrations/20261031100000_storefront_funnel.sql?raw";
import migration from "../supabase/migrations/20261122100000_storefront_visit_source.sql?raw";
import { VISIT_SOURCES } from "../src/lib/funnel";

// Where a visit came from (migration 20261122100000), run in a real Postgres on the live funnel, as a
// visitor, as the store's staff and as someone else's.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text UNIQUE, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, channel text, status text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE FUNCTION public.can_access_brand(p_brand uuid) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT p_brand::text = current_setting('test.staff_of', true) $$;
  GRANT EXECUTE ON FUNCTION public.can_access_brand(uuid) TO anon, authenticated;
  INSERT INTO public.brands (id, slug, is_active) VALUES
    ('00000000-0000-4000-8000-000000000001', 'pura', true);
`;

const PURA = "00000000-0000-4000-8000-000000000001";
const visit = (i: number) => `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
let db: PGlite;

async function as(role: "anon" | "authenticated", sql: string, params: unknown[] = []) {
  await db.exec(`SET ROLE ${role}`);
  try {
    return { rows: (await db.query<Record<string, unknown>>(sql, params)).rows, error: null };
  } catch (error) {
    return { rows: [], error: (error as Error).message };
  } finally {
    await db.exec("RESET ROLE");
  }
}

const step = (i: number, n: number, source: string | null) =>
  as("anon", "SELECT public.record_storefront_step('pura', $1::uuid, $2, $3)", [
    visit(i),
    n,
    source,
  ]);
const sources = (role: "anon" | "authenticated" = "authenticated") =>
  as(
    role,
    "SELECT * FROM public.storefront_funnel_sources($1::uuid, now() - interval '1 day', now() + interval '1 minute')",
    [PURA],
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(funnel);
  // A visit from before this migration, through the function a page left open still calls.
  await db.query("SELECT public.record_storefront_step('pura', $1::uuid, 1)", [visit(900)]);
  await db.exec(migration);
});

describe("a visit's source", () => {
  it("counts each source's visits and the orders placed in them", async () => {
    await step(1, 1, "instagram");
    await step(1, 5, "instagram");
    await step(2, 1, "instagram");
    await step(3, 1, "direct");
    await db.exec(`SET test.staff_of = '${PURA}'`);
    const { rows } = await sources();
    expect(rows).toEqual([
      { source: "instagram", visits: 2, orders: 1 },
      { source: "direct", visits: 1, orders: 0 },
    ]);
  });

  it("leaves out a visit from before sources were counted, rather than calling it direct", async () => {
    const { rows } = await sources();
    const total = rows.reduce((sum, row) => sum + Number(row.visits), 0);
    const all = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.storefront_sessions",
    );
    expect(all.rows[0].n).toBe(total + 1);
  });

  it("keeps a visit's first source", async () => {
    await step(4, 1, "whatsapp");
    await step(4, 2, "google");
    const row = await db.query<{ source: string; reached: number }>(
      "SELECT source, reached FROM public.storefront_sessions WHERE session_id = $1",
      [visit(4)],
    );
    expect(row.rows[0]).toEqual({ source: "whatsapp", reached: 2 });
  });

  it("gives a source to a visit that had none, the old function's", async () => {
    await step(900, 2, "tiktok");
    const row = await db.query<{ source: string }>(
      "SELECT source FROM public.storefront_sessions WHERE session_id = $1",
      [visit(900)],
    );
    expect(row.rows[0].source).toBe("tiktok");
  });

  it("takes a word it does not know as no source, and never fails the page", async () => {
    const { error } = await step(5, 1, "https://example.com/?who=someone");
    expect(error).toBeNull();
    const row = await db.query<{ source: string | null }>(
      "SELECT source FROM public.storefront_sessions WHERE session_id = $1",
      [visit(5)],
    );
    expect(row.rows[0].source).toBeNull();
  });

  it("accepts exactly the sources the storefront sends", async () => {
    for (const [i, source] of VISIT_SOURCES.entries()) await step(100 + i, 1, source);
    const row = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.storefront_sessions WHERE session_id >= $1 AND session_id < $2 AND source IS NOT NULL",
      [visit(100), visit(100 + VISIT_SOURCES.length)],
    );
    expect(row.rows[0].n).toBe(VISIT_SOURCES.length);
  });

  it("ignores a step it does not know", async () => {
    await step(6, 6, "instagram");
    const row = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.storefront_sessions WHERE session_id = $1",
      [visit(6)],
    );
    expect(row.rows[0].n).toBe(0);
  });

  it("keeps the funnel's own counts working with the new step", async () => {
    const { rows } = await as(
      "authenticated",
      "SELECT * FROM public.storefront_funnel($1::uuid, now() - interval '1 day', now() + interval '1 minute')",
      [PURA],
    );
    expect(Number(rows[0].visits)).toBeGreaterThan(0);
    expect(Number(rows[0].checkouts)).toBeGreaterThanOrEqual(1);
  });
});

describe("who may read it", () => {
  it("is the store's own staff only", async () => {
    expect((await sources("anon")).error).toMatch(/permission denied/);
    await db.exec("SET test.staff_of = '00000000-0000-4000-8000-000000000999'");
    expect((await sources()).error).toMatch(/FORBIDDEN/);
    await db.exec(`SET test.staff_of = '${PURA}'`);
    expect((await sources()).error).toBeNull();
  });

  it("is never the table itself", async () => {
    const read = await as("anon", "SELECT * FROM public.storefront_sessions");
    expect(read.error).toMatch(/permission denied/);
  });
});
