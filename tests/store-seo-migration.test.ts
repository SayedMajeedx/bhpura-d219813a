import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261028140000_store_seo.sql?raw";
import previous from "../supabase/migrations/20261027120000_take_off_sale.sql?raw";

// A store's listing in each language, and a product's and a category's own words (migration
// 20261028140000): plain text, bounded, cleaned on every write, in a real Postgres; and the
// page-data function is the live one with the new keys added and nothing else changed.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
let db: PGlite;

/** The migration up to the page-data function (which needs the whole schema to be created). */
const tablesPart = migration.slice(
  0,
  migration.indexOf("CREATE OR REPLACE FUNCTION public.get_storefront_page_data"),
);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE public.brands (id uuid PRIMARY KEY, meta_title text, meta_description text);
    CREATE TABLE public.products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, name text);
    CREATE TABLE public.categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, name_en text);
    INSERT INTO public.brands (id) VALUES ('${BRAND}');
  `);
  await db.exec(tablesPart);
});

const brand = async (set: string) => {
  await db.query(`UPDATE public.brands SET ${set} WHERE id = $1`, [BRAND]);
  const { rows } = await db.query<Record<string, string | null>>(
    "SELECT meta_title_en, meta_description_en, google_site_verification FROM public.brands WHERE id = $1",
    [BRAND],
  );
  return rows[0];
};

describe("the English home page", () => {
  it("is plain text, bounded and empty when blank", async () => {
    const row = await brand(
      `meta_title_en = ' <b>Pura</b>  line ', meta_description_en = '   ', google_site_verification = ' abcDEF123_-xyz '`,
    );
    expect(row.meta_title_en).toBe("Pura line");
    expect(row.meta_description_en).toBeNull();
    expect(row.google_site_verification).toBe("abcDEF123_-xyz");
  });

  it("refuses a verification code that is not a code", async () => {
    await expect(brand(`google_site_verification = 'short'`)).rejects.toThrow();
    await expect(
      brand(`google_site_verification = '"><script>alert(1)</script>'`),
    ).rejects.toThrow();
  });

  it("takes a title of 70 characters and a description of 160, no more", async () => {
    const row = await db.query<{ t: number; d: number }>(
      `WITH u AS (UPDATE public.brands SET meta_title_en = repeat('a', 70), meta_description_en = repeat('b', 160) WHERE id = $1 RETURNING meta_title_en, meta_description_en)
       SELECT char_length(meta_title_en) AS t, char_length(meta_description_en) AS d FROM u`,
      [BRAND],
    );
    expect(row.rows[0]).toEqual({ t: 70, d: 160 });
    await expect(brand(`meta_title_en = repeat('a', 71)`)).rejects.toThrow();
  });
});

describe.each(["products", "categories"])("a row of %s", (table) => {
  it("keeps its own words clean, in each language", async () => {
    const { rows } = await db.query<Record<string, string | null>>(
      `INSERT INTO public.${table} (brand_id, seo_title_ar, seo_title_en, seo_description_ar, seo_description_en)
       VALUES ($1, ' <i>عباية</i> حريرية ', 'Silk <script>x</script> abaya', '', E'Soft\\tsilk')
       RETURNING seo_title_ar, seo_title_en, seo_description_ar, seo_description_en`,
      [BRAND],
    );
    expect(rows[0].seo_title_ar).toBe("عباية حريرية");
    expect(rows[0].seo_title_en).toBe("Silk x abaya");
    expect(rows[0].seo_description_ar).toBeNull();
    expect(rows[0].seo_description_en).toBe("Soft silk");
  });

  it("refuses a title or a description longer than the page can show", async () => {
    await expect(
      db.query(
        `INSERT INTO public.${table} (brand_id, seo_title_en) VALUES ($1, repeat('x', 200))`,
        [BRAND],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        `INSERT INTO public.${table} (brand_id, seo_description_en) VALUES ($1, repeat('y', 500))`,
        [BRAND],
      ),
    ).rejects.toThrow();
  });
});

describe("the page-data function", () => {
  /** A function's body, its whitespace folded. */
  const body = (sql: string) => {
    const start = sql.indexOf("FUNCTION public.get_storefront_page_data(");
    const open = sql.indexOf("$function$", start);
    const close = sql.indexOf("$function$", open + 1);
    return sql
      .slice(open, close)
      .replace(/--[^\n]*\n/g, "\n")
      .replace(/\s+/g, " ")
      .trim();
  };

  it("carries the brand's English words and token, and each category's own words", () => {
    expect(migration).toMatch(/'meta_title_en', b\.meta_title_en,/);
    expect(migration).toMatch(/'google_site_verification', b\.google_site_verification/);
    expect(migration).toMatch(/'seo_title_ar', c\.seo_title_ar,/);
    expect(migration).toMatch(/'seo_description_en', c\.seo_description_en/);
  });

  it("is otherwise built exactly as before", () => {
    const withoutNew = body(migration)
      .replace(
        " 'meta_title_en', b.meta_title_en, 'meta_description_en', b.meta_description_en, 'google_site_verification', b.google_site_verification",
        "",
      )
      .replace(
        " 'seo_title_ar', c.seo_title_ar, 'seo_title_en', c.seo_title_en, 'seo_description_ar', c.seo_description_ar, 'seo_description_en', c.seo_description_en",
        "",
      )
      // the keys before the added ones end with a comma that the old text did not have
      .replace("b.meta_description, )", "b.meta_description )")
      .replace("c.size_guide_id, )", "c.size_guide_id )");
    expect(withoutNew).toBe(body(previous));
  });

  it("keeps the caller's view and grants", () => {
    expect(migration).toMatch(/STABLE SECURITY DEFINER/);
    expect(migration).not.toMatch(/DROP FUNCTION/);
  });
});
