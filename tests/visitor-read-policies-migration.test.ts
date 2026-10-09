import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fix from "../supabase/migrations/20261009130000_visitor_read_policies_without_staff_check.sql?raw";

// A visitor reads a store's public tables in a real Postgres: with the staff check taken
// away from `anon` (as on 7 October), the old policies refuse the read and the new ones do not.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const A = "00000000-0000-4000-8000-0000000000d1";
const B = "00000000-0000-4000-8000-0000000000d2";
let db: PGlite;

const asRole = async <T>(role: string, uid: string | null, sql: string) => {
  await db.exec(`SET ROLE ${role}; SET app.uid = '${uid ?? ""}'`);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("RESET ROLE");
  }
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE TABLE public.brands (id uuid PRIMARY KEY);
    CREATE TABLE public.products (id uuid PRIMARY KEY, brand_id uuid);
    CREATE FUNCTION public.can_access_brand(b uuid) RETURNS boolean LANGUAGE sql STABLE
      AS $$ SELECT current_setting('app.uid', true) = b::text $$;
    CREATE FUNCTION public.has_permission(p text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    INSERT INTO public.brands VALUES ('${A}'), ('${B}');
  `);
  await db.exec(`
    CREATE TABLE public.store_gallery_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE public.store_faq_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true);
    ALTER TABLE public.store_gallery_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.store_faq_items ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "public reads active gallery" ON public.store_gallery_items
      FOR SELECT TO anon, authenticated USING (is_active OR public.can_access_brand(brand_id));
    CREATE POLICY "public reads active faq" ON public.store_faq_items
      FOR SELECT TO anon, authenticated USING (is_active OR public.can_access_brand(brand_id));
  `);
  await db.exec(`
    CREATE TABLE public.advance_payment_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true);
    ALTER TABLE public.advance_payment_rules ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "public reads advance payment rules" ON public.advance_payment_rules
      FOR SELECT TO anon, authenticated USING (is_active OR public.can_access_brand(brand_id));
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    REVOKE EXECUTE ON FUNCTION public.can_access_brand(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.can_access_brand(uuid) TO authenticated;
    INSERT INTO public.advance_payment_rules (brand_id, is_active) VALUES ('${A}', true), ('${A}', false);
  `);
});

describe("before the fix", () => {
  it("refused a visitor the store's advance rules", async () => {
    await expect(
      asRole("anon", null, "SELECT id FROM public.advance_payment_rules"),
    ).rejects.toThrow(/permission denied for function can_access_brand/);
  });
});

describe("after the fix", () => {
  beforeAll(async () => {
    await db.exec(fix);
  });

  it("a visitor reads the active advance rules, and only those", async () => {
    const rows = await asRole("anon", null, "SELECT id FROM public.advance_payment_rules");
    expect(rows).toHaveLength(1);
  });

  it("staff of the store still see the switched-off rule; staff of another store do not", async () => {
    expect(
      await asRole("authenticated", A, "SELECT id FROM public.advance_payment_rules"),
    ).toHaveLength(2);
    expect(
      await asRole("authenticated", B, "SELECT id FROM public.advance_payment_rules"),
    ).toHaveLength(1);
  });

  it("a visitor reads the active FAQ and gallery", async () => {
    await db.exec(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated`);
    await db.exec(`
      INSERT INTO public.store_faq_items (brand_id, is_active) VALUES ('${A}', true), ('${A}', false);
    `);
    expect(await asRole("anon", null, "SELECT id FROM public.store_faq_items")).toHaveLength(1);
    expect(await asRole("authenticated", A, "SELECT id FROM public.store_faq_items")).toHaveLength(
      2,
    );
    expect(await asRole("anon", null, "SELECT id FROM public.store_gallery_items")).toHaveLength(0);
  });
});
