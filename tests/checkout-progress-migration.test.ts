import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import funnel from "../supabase/migrations/20261031100000_storefront_funnel.sql?raw";
import sources from "../supabase/migrations/20261122100000_storefront_visit_source.sql?raw";
import migration from "../supabase/migrations/20261207100000_checkout_progress_and_campaigns.sql?raw";
import { CHECKOUT_PROBLEMS } from "../src/lib/checkout-progress";

// Where checkout stops and which post a visit came from (migration 20261207100000), run in a real
// Postgres on the live funnel, as a visitor, as the store's staff and as someone else's.
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
const visit = (i: number) => `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
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

const step = (i: number, n: number, campaign: string | null = null) =>
  as("anon", "SELECT public.record_storefront_step('pura', $1::uuid, $2, 'instagram', $3)", [
    visit(i),
    n,
    campaign,
  ]);
const checkout = (i: number, n: number, problem: string | null) =>
  as("anon", "SELECT public.record_checkout_step('pura', $1::uuid, $2, $3)", [
    visit(i),
    n,
    problem,
  ]);
const read = (fn: string, role: "anon" | "authenticated" = "authenticated") =>
  as(
    role,
    `SELECT * FROM public.${fn}($1::uuid, now() - interval '1 day', now() + interval '1 minute')`,
    [PURA],
  );
const row = async (i: number) =>
  (
    await db.query<Record<string, unknown>>(
      "SELECT reached, checkout_step, checkout_problem, campaign FROM public.storefront_sessions WHERE session_id = $1",
      [visit(i)],
    )
  ).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(funnel);
  await db.exec(sources);
  // A page left open across the release still calls the four-argument function.
  await db.query("SELECT public.record_storefront_step('pura', $1::uuid, 1, 'direct')", [
    visit(900),
  ]);
  await db.exec(migration);
  await db.exec(`SET test.staff_of = '${PURA}'`);
});

describe("how far into checkout a visit went", () => {
  it("keeps the furthest part and the latest problem, and an order clears the problem", async () => {
    await step(1, 4);
    await checkout(1, 0, "name_phone");
    await checkout(1, 2, "terms");
    await checkout(1, 1, "receipt");
    expect(await row(1)).toMatchObject({ checkout_step: 2, checkout_problem: "receipt" });
    await step(1, 5);
    expect(await row(1)).toMatchObject({ reached: 5, checkout_problem: null });
    await checkout(1, 4, "terms");
    expect((await row(1)).checkout_problem).toBeNull();
  });

  it("records a visit whose checkout step arrived first, as having begun checkout", async () => {
    await checkout(2, 0, null);
    expect(await row(2)).toMatchObject({ reached: 4, checkout_step: 0 });
    await step(2, 4);
    expect((await row(2)).reached).toBe(4);
  });

  it("takes an unknown code, a wrong part or another store as nothing, never a failed page", async () => {
    await step(3, 4);
    expect((await checkout(3, 1, "DROP TABLE x; --")).error).toBeNull();
    expect((await row(3)).checkout_problem).toBeNull();
    expect((await checkout(3, 9, "terms")).error).toBeNull();
    expect(await row(3)).toMatchObject({ checkout_step: 1, checkout_problem: null });
    await as("anon", "SELECT public.record_checkout_step('nobody', $1::uuid, 1, 'terms')", [
      visit(4),
    ]);
    expect(await row(4)).toBeUndefined();
  });

  it("accepts every problem code the storefront sends", async () => {
    for (const [i, problem] of CHECKOUT_PROBLEMS.entries()) {
      await checkout(100 + i, 3, problem);
      expect((await row(100 + i)).checkout_problem).toBe(problem);
    }
  });

  it("gives the store's staff each part's count and what stopped the rest", async () => {
    await db.exec("DELETE FROM public.storefront_sessions");
    await step(10, 4);
    await checkout(10, 1, "address");
    await step(11, 4);
    await checkout(11, 3, "receipt");
    await step(12, 4);
    await checkout(12, 4, null);
    await step(12, 5);
    await step(13, 4); // a gift card's checkout: begun, never this checkout's page
    const { rows } = await read("storefront_checkout_progress");
    expect(rows[0]).toEqual({
      opened: 3,
      contact: 3,
      delivery: 2,
      ready: 2,
      pressed: 1,
      ordered: 1,
    });
    const problems = await read("storefront_checkout_problems");
    expect(problems.rows).toEqual([
      { problem: "address", visits: 1 },
      { problem: "receipt", visits: 1 },
    ]);
  });
});

describe("a visit's campaign", () => {
  it("cleans the store's word, keeps the first and counts its visits and orders", async () => {
    await step(20, 1, "  Final Call! ");
    await step(20, 5, "another");
    await step(21, 1, "final-call");
    await step(22, 1, "<script>");
    await step(23, 1, "x".repeat(80));
    expect((await row(20)).campaign).toBe("final-call");
    expect((await row(22)).campaign).toBe("script");
    expect(String((await row(23)).campaign).length).toBe(40);
    const { rows } = await read("storefront_funnel_campaigns");
    expect(rows[0]).toEqual({ campaign: "final-call", visits: 2, orders: 1 });
  });

  it("still takes the four-argument call of a page left open", async () => {
    const { error } = await as(
      "anon",
      "SELECT public.record_storefront_step('pura', $1::uuid, 2, 'direct')",
      [visit(900)],
    );
    expect(error).toBeNull();
    expect((await row(900)).reached).toBe(2);
  });
});

describe("who may read it", () => {
  it("is the store's own staff only", async () => {
    for (const fn of [
      "storefront_checkout_progress",
      "storefront_checkout_problems",
      "storefront_funnel_campaigns",
    ]) {
      expect((await read(fn, "anon")).error).toMatch(/permission denied/);
      await db.exec("SET test.staff_of = '00000000-0000-4000-8000-000000000099'");
      expect((await read(fn)).error).toMatch(/FORBIDDEN/);
      await db.exec(`SET test.staff_of = '${PURA}'`);
    }
  });
});
