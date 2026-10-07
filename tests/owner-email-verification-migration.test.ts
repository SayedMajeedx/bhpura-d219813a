import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261007130000_owner_email_verification.sql?raw";

vi.setConfig({ testTimeout: 60_000 });

// Whether a team account has proved it owns its email address. Everyone who exists, and everyone
// made any other way, counts as verified; only the server (or a super admin) can change it.

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('test.role', true), '') $$;
    CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.super', true) = 'yes' $$;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, email text, name text);
    INSERT INTO public.profiles VALUES ('00000000-0000-4000-8000-000000000001', 'old@example.com', 'Old Owner');
  `);
  await db.exec(migration);
  return db;
}
const as = async (db: PGlite, role: string, superAdmin = false) => {
  await db.exec(
    `SELECT set_config('test.role', '${role}', false), set_config('test.super', '${superAdmin ? "yes" : "no"}', false)`,
  );
};
const ONE = "00000000-0000-4000-8000-000000000001";
const TWO = "00000000-0000-4000-8000-000000000002";
const verified = async (db: PGlite, id: string) =>
  (
    await db.query<{ v: string | null }>(
      `SELECT email_verified_at AS v FROM public.profiles WHERE id = '${id}'`,
    )
  ).rows[0].v;

describe("owner email verification", () => {
  it("counts an account that existed before as verified, and a new one too", async () => {
    const db = await database();
    expect(await verified(db, ONE)).not.toBeNull();
    await db.exec(
      `INSERT INTO public.profiles (id, email, name) VALUES ('${TWO}', 'new@example.com', 'New')`,
    );
    expect(await verified(db, TWO)).not.toBeNull();
  });

  it("lets the server mark an account unverified and verified again", async () => {
    const db = await database();
    await as(db, "service_role");
    await db.exec(`UPDATE public.profiles SET email_verified_at = NULL WHERE id = '${ONE}'`);
    expect(await verified(db, ONE)).toBeNull();
    await db.exec(`UPDATE public.profiles SET email_verified_at = now() WHERE id = '${ONE}'`);
    expect(await verified(db, ONE)).not.toBeNull();
  });

  it("does not let a signed-in user, or a visitor, verify themselves", async () => {
    const db = await database();
    await as(db, "service_role");
    await db.exec(`UPDATE public.profiles SET email_verified_at = NULL WHERE id = '${ONE}'`);
    for (const role of ["authenticated", "anon"]) {
      await as(db, role);
      await expect(
        db.exec(`UPDATE public.profiles SET email_verified_at = now() WHERE id = '${ONE}'`),
      ).rejects.toThrow(/server only/);
    }
    expect(await verified(db, ONE)).toBeNull();
  });

  it("lets a signed-in user change anything else about their row, and a super admin verify", async () => {
    const db = await database();
    await as(db, "service_role");
    await db.exec(`UPDATE public.profiles SET email_verified_at = NULL WHERE id = '${ONE}'`);
    await as(db, "authenticated");
    await db.exec(`UPDATE public.profiles SET name = 'Renamed' WHERE id = '${ONE}'`);
    expect(await verified(db, ONE)).toBeNull();
    await as(db, "authenticated", true);
    await db.exec(`UPDATE public.profiles SET email_verified_at = now() WHERE id = '${ONE}'`);
    expect(await verified(db, ONE)).not.toBeNull();
  });

  it("is safe to run twice", async () => {
    const db = await database();
    await expect(db.exec(migration)).resolves.toBeDefined();
  });
});
