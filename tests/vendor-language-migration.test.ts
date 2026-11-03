import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261115100000_vendor_language.sql?raw";

// A supplier's language (migration 20261115100000), run in a real Postgres (PGlite) on the
// vendors table as it stands live: the column takes Arabic, English, both or nothing, and running
// the migration twice changes nothing.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE public.vendors (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, name text NOT NULL,
      contact_person text, phone text, email text, tax_number text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO public.vendors (brand_id, name) VALUES ('${BRAND}', 'Umm Ali');
  `);
  await db.exec(migration);
});

const insert = (lang: string | null) =>
  db.query("insert into vendors (brand_id, name, preferred_language) values ($1, 'x', $2)", [
    BRAND,
    lang,
  ]);

describe("a supplier's language", () => {
  it("leaves the suppliers already there on the screen's language", async () => {
    const { rows } = await db.query<{ preferred_language: string | null }>(
      "select preferred_language from vendors where name = 'Umm Ali'",
    );
    expect(rows).toEqual([{ preferred_language: null }]);
  });

  it("takes Arabic, English, both or nothing", async () => {
    for (const lang of ["ar", "en", "both", null]) await insert(lang);
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from vendors where name = 'x'",
    );
    expect(rows[0].n).toBe(4);
  });

  it("refuses any other language", async () => {
    await expect(insert("ur")).rejects.toThrow(/vendors_preferred_language_check/);
    await expect(insert("")).rejects.toThrow(/vendors_preferred_language_check/);
  });

  it("can run twice", async () => {
    await expect(db.exec(migration)).resolves.toBeDefined();
  });
});
