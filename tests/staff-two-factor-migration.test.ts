import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261027150000_staff_two_factor.sql?raw";

// Two-factor sign-in for staff (migration 20261027150000) in a real Postgres: a member who has an
// authenticator app gets nothing from the four permission functions until the session gave its
// code (aal2); a member without one notices nothing; the Team page's list names only the store's
// members with it on, for an admin.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const OWNER = "00000000-0000-4000-8000-00000000000a";
const CLERK = "00000000-0000-4000-8000-00000000000c";
const NEWBIE = "00000000-0000-4000-8000-00000000000d";
const STRANGER = "00000000-0000-4000-8000-00000000000e";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
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
      ('${NEWBIE}', '${BRAND}', 'staff', 'active', '{}'),
      ('${STRANGER}', '${OTHER}', 'staff', 'active', '{}');
    INSERT INTO auth.mfa_factors (user_id, status) VALUES
      ('${OWNER}', 'verified'), ('${NEWBIE}', 'unverified'), ('${STRANGER}', 'verified');
  `);
  await db.exec(migration);
});

const as = async (uid: string, aal: "aal1" | "aal2") => {
  await db.query("SELECT set_config('test.uid', $1, false), set_config('test.jwt', $2, false)", [
    uid,
    JSON.stringify({ aal }),
  ]);
};
const ask = async (sql: string) =>
  (await db.query<{ ok: boolean }>(`SELECT ${sql} AS ok`)).rows[0].ok;

describe("a member with two-factor on", () => {
  it("is granted nothing until the session gave its code", async () => {
    await as(OWNER, "aal1");
    expect(await ask(`public.can_access_brand('${BRAND}')`)).toBe(false);
    expect(await ask("public.is_admin()")).toBe(false);
    expect(await ask("public.has_permission('manage_settings')")).toBe(false);
    await as(OWNER, "aal2");
    expect(await ask(`public.can_access_brand('${BRAND}')`)).toBe(true);
    expect(await ask("public.is_admin()")).toBe(true);
    expect(await ask("public.has_permission('manage_settings')")).toBe(true);
    expect(await ask("public.is_super_admin()")).toBe(false);
  });
});

describe("a member without it", () => {
  it("notices nothing, and a factor never confirmed does not count", async () => {
    await as(CLERK, "aal1");
    expect(await ask(`public.can_access_brand('${BRAND}')`)).toBe(true);
    expect(await ask("public.has_permission('manage_orders')")).toBe(true);
    expect(await ask("public.has_permission('manage_settings')")).toBe(false);
    await as(NEWBIE, "aal1");
    expect(await ask(`public.can_access_brand('${BRAND}')`)).toBe(true);
  });
});

describe("who has it on", () => {
  const list = async () =>
    (
      await db.query<{ user_id: string }>(
        `SELECT user_id FROM public.brand_staff_two_factor('${BRAND}')`,
      )
    ).rows.map((r) => r.user_id);

  it("names the store's own members with a confirmed app, for an admin who gave the code", async () => {
    await as(OWNER, "aal2");
    expect(await list()).toEqual([OWNER]);
    await as(OWNER, "aal1");
    expect(await list()).toEqual([]);
    await as(CLERK, "aal1");
    expect(await list()).toEqual([]);
  });

  it("lets no browser ask the session check itself", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.staff_session_verified\(\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.brand_staff_two_factor\(uuid\) TO authenticated;/,
    );
  });
});
