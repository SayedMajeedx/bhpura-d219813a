import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import original from "../supabase/migrations/20260714050000_brand_and_page_seo.sql?raw";
import fix from "../supabase/migrations/20261009100000_cms_pages_keep_footer_titles.sql?raw";

// `business_settings.pages` as the database stores it (PGlite): the old trigger turned
// the { items, footer_titles } the Pages screen saves into an empty list; the fix keeps it.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
let db: PGlite;

const save = async (pages: unknown) => {
  await db.query("UPDATE public.business_settings SET pages = $1::jsonb WHERE brand_id = $2", [
    JSON.stringify(pages),
    BRAND,
  ]);
  const { rows } = await db.query<{ pages: any }>(
    "SELECT pages FROM public.business_settings WHERE brand_id = $1",
    [BRAND],
  );
  return rows[0].pages;
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE public.brands (id uuid PRIMARY KEY, meta_title text, meta_description text);
    CREATE TABLE public.business_settings (
      brand_id uuid PRIMARY KEY, pages jsonb NOT NULL DEFAULT '[]'::jsonb
    );
    INSERT INTO public.business_settings (brand_id) VALUES ('${BRAND}');
  `);
  await db.exec(original);
});

const payload = {
  items: [
    { slug: "about-us", title_en: "About us", group: "company", meta_title: "<b>About</b>" },
    { slug: "returns", title_en: "Returns", group: "bogus" },
  ],
  footer_titles: {
    company_en: " The House ",
    help_ar: "الدعم",
    help_en: "<i>Support</i>",
    extra: "x",
  },
};

describe("before the fix", () => {
  it("emptied the pages the Pages screen saved", async () => {
    expect(await save(payload)).toEqual([]);
  });
});

describe("after the fix", () => {
  beforeAll(async () => {
    await db.exec(fix);
  });

  it("keeps the pages and footer headings, cleaned", async () => {
    const stored = await save(payload);
    expect(stored.items.map((p: any) => [p.slug, p.group])).toEqual([
      ["about-us", "company"],
      ["returns", "help"],
    ]);
    expect(stored.items[0].meta_title).toBe("About");
    expect(stored.footer_titles).toEqual({
      company_en: "The House",
      help_ar: "الدعم",
      help_en: "Support",
    });
  });

  it("still cleans a plain list like before", async () => {
    const stored = await save([{ slug: "a", meta_title: "<i>T</i>" }, "junk"]);
    expect(stored).toEqual([{ slug: "a", meta_title: "T", meta_description: null }]);
  });

  it("empties a value that is neither shape", async () => {
    expect(await save({ nothing: true })).toEqual([]);
    expect(await save("text")).toEqual([]);
  });
});
