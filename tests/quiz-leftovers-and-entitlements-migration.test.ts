import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261007160000_drop_quiz_leftovers_and_guard_entitlements.sql?raw";

vi.setConfig({ testTimeout: 60_000 });

// The audit's clean-up migration, run against Postgres with the objects it touches stubbed:
// the quiz game is gone, and a brand's plan can be read only by the server or that brand's staff.

const QUIZ_TABLES = [
  "user_answers",
  "answers",
  "game_results",
  "game_sessions",
  "players",
  "rooms",
  "daily_hosted_quiz_usage",
  "questions",
  "quizzes",
];
const DROPS = [...migration.matchAll(/DROP FUNCTION IF EXISTS public\.(\w+)\(([^)]*)\);/g)];
const BRAND_A = "00000000-0000-4000-8000-00000000000a";
const BRAND_B = "00000000-0000-4000-8000-00000000000b";

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    -- The request's role and user, as Supabase's auth schema reads them from the JWT settings.
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('test.role', true), '') $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
    GRANT EXECUTE ON FUNCTION auth.role(), auth.uid() TO anon, authenticated, service_role;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, brand_id uuid);
    CREATE FUNCTION public.can_access_brand(_brand_id uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.brand_id = _brand_id)
    $$;
    CREATE FUNCTION public.rpc_evaluate_brand_entitlements(_brand_id uuid) RETURNS jsonb
      LANGUAGE sql AS $$ SELECT jsonb_build_object('brand', _brand_id) $$;
    CREATE FUNCTION public.rpc_sync_legacy_brands_to_subscriptions() RETURNS integer
      LANGUAGE sql AS $$ SELECT 0 $$;
    -- The live database's public.submit_answer wraps this one, which takes the answers row type.
    CREATE SCHEMA private;
    CREATE SCHEMA storage;
    CREATE TABLE storage.objects (id int, bucket_id text);
    ${["public_read", "owner_insert", "owner_update", "owner_delete"]
      .map((n) => `CREATE POLICY question_images_${n} ON storage.objects USING (true);`)
      .join("\n")}
    CREATE POLICY other_bucket_read ON storage.objects USING (true);
    INSERT INTO public.profiles VALUES
      ('00000000-0000-4000-8000-0000000000a1', '${BRAND_A}');
  `);
  for (const t of QUIZ_TABLES) await db.exec(`CREATE TABLE public.${t} (id int);`);
  // Returning the table's row type makes the function depend on it, as it does live: without the
  // migration dropping it first, DROP TABLE answers fails.
  await db.exec(`
    CREATE FUNCTION private.submit_answer(p_player_id uuid, p_question_id uuid, p_choice integer, p_powerup text)
      RETURNS public.answers LANGUAGE sql AS $$ SELECT NULL::public.answers $$;
  `);
  for (const m of DROPS) {
    const args = m[2]
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean)
      .map((type, i) => `p${i} ${type}`)
      .join(", ");
    await db.exec(
      `CREATE FUNCTION public.${m[1]}(${args}) RETURNS void LANGUAGE sql AS $$ SELECT $$;`,
    );
  }
  await db.exec(migration);
  return db;
}

const tables = async (db: PGlite) =>
  (
    await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    )
  ).rows.map((r) => r.table_name);

const as = async (db: PGlite, role: string, uid: string | null, sql: string) => {
  await db.exec(`SET test.role = '${role}'; SET test.uid = '${uid ?? ""}'; SET ROLE ${role};`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec(`RESET ROLE;`);
  }
};
const STAFF_A = "00000000-0000-4000-8000-0000000000a1";
const call = `SELECT public.rpc_evaluate_brand_entitlements('${BRAND_A}'::uuid) AS r`;

describe("the quiz game leftovers", () => {
  it("lists every function it drops, and they are gone together with the tables and the policies", async () => {
    expect(DROPS.length).toBe(17);
    const db = await database();
    const left = await tables(db);
    for (const t of QUIZ_TABLES) expect(left).not.toContain(t);
    const fns = (
      await db.query<{ proname: string }>(
        `SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace`,
      )
    ).rows.map((r) => r.proname);
    for (const m of DROPS) expect(fns).not.toContain(m[1]);
    const hidden = await db.query(
      `SELECT 1 FROM pg_proc WHERE pronamespace = 'private'::regnamespace`,
    );
    expect(hidden.rows).toEqual([]);
    const policies = (
      await db.query<{ policyname: string }>(`SELECT policyname FROM pg_policies`)
    ).rows.map((r) => r.policyname);
    expect(policies).toEqual(["other_bucket_read"]);
    expect(left).toContain("profiles");
  });
});

describe("who can read a brand's plan", () => {
  it("lets the server and that brand's staff, and nobody else", async () => {
    const db = await database();
    expect((await as(db, "service_role", null, call)).rows).toEqual([{ r: { brand: BRAND_A } }]);
    expect((await as(db, "authenticated", STAFF_A, call)).rows).toEqual([
      { r: { brand: BRAND_A } },
    ]);
  });

  it("refuses a signed-in account of another brand, a visitor, and a signed-in call with no user", async () => {
    const db = await database();
    await db.exec(
      `INSERT INTO public.profiles VALUES ('00000000-0000-4000-8000-0000000000b1', '${BRAND_B}')`,
    );
    await expect(
      as(db, "authenticated", "00000000-0000-4000-8000-0000000000b1", call),
    ).rejects.toThrow(/Not authorized/);
    await expect(as(db, "authenticated", null, call)).rejects.toThrow(/Not authorized/);
    await expect(as(db, "anon", null, call)).rejects.toThrow(/permission denied/);
  });

  it("keeps the unchecked body and the seeding function away from the browser", async () => {
    const db = await database();
    for (const role of ["anon", "authenticated"]) {
      await expect(
        as(
          db,
          role,
          STAFF_A,
          `SELECT public.rpc_evaluate_brand_entitlements_unchecked('${BRAND_A}'::uuid)`,
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        as(db, role, STAFF_A, `SELECT public.rpc_sync_legacy_brands_to_subscriptions()`),
      ).rejects.toThrow(/permission denied/);
    }
    expect(
      (
        await as(
          db,
          "service_role",
          null,
          `SELECT public.rpc_sync_legacy_brands_to_subscriptions() AS n`,
        )
      ).rows,
    ).toEqual([{ n: 0 }]);
  });
});
