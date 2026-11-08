import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import original from "../supabase/migrations/20260714080000_brand_tracking_analytics.sql?raw";
import previous from "../supabase/migrations/20261111100000_archive_variants_with_history.sql?raw";
import migration from "../supabase/migrations/20261123100000_tiktok_snapchat_pixels.sql?raw";

// A store's TikTok and Snapchat pixel ids (migration 20261123100000): two columns each on
// brand_tracking_settings with the shape each platform gives, and the storefront's page data
// carries them beside the Meta pixel's, the function otherwise exactly the live one.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

/** The page-data function's body, comments dropped and whitespace folded. */
const pageData = (sql: string) => {
  const start = sql.indexOf("FUNCTION public.get_storefront_page_data(");
  const open = sql.indexOf("$function$", start);
  const close = sql.indexOf("$function$", open + 1);
  return sql
    .slice(open, close)
    .replace(/--[^\n]*\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
};

const ADDED =
  " 'tiktok_pixel_enabled', ts.tiktok_pixel_enabled, 'tiktok_pixel_id', ts.tiktok_pixel_id," +
  " 'snap_pixel_enabled', ts.snap_pixel_enabled, 'snap_pixel_id', ts.snap_pixel_id,";

describe("the storefront's page data", () => {
  it("carries the TikTok and Snapchat ids in its tracking object", () => {
    expect(pageData(migration)).toContain(`'meta_pixel_id', ts.meta_pixel_id,${ADDED}`);
  });

  it("is otherwise the live function, unchanged", () => {
    expect(pageData(migration).replace(ADDED, "")).toBe(pageData(previous));
  });

  it("keeps its signature, caller's view and grants", () => {
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_storefront_page_data\(p_brand_slug text\)/,
    );
    expect(migration).toMatch(/STABLE SECURITY DEFINER/);
    expect(migration).not.toMatch(/REVOKE|DROP FUNCTION|DROP TABLE|DROP COLUMN/);
  });
});

const BRAND = "00000000-0000-4000-8000-000000000001";
let db: PGlite;

/** The migration's table part (the page-data function needs the whole catalogue's tables). */
const tablePart = migration.slice(
  0,
  migration.indexOf("CREATE OR REPLACE FUNCTION public.get_storefront_page_data"),
);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE TABLE public.brands (id uuid PRIMARY KEY, is_active boolean NOT NULL DEFAULT true);
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.can_access_brand(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    INSERT INTO public.brands (id) VALUES ('${BRAND}');
  `);
  await db.exec(original);
  await db.exec(tablePart);
});

async function save(values: Record<string, string | boolean | null>) {
  const columns = Object.keys(values);
  await db.query(
    `INSERT INTO public.brand_tracking_settings (brand_id, ${columns.join(", ")})
     VALUES ($1, ${columns.map((_, i) => `$${i + 2}`).join(", ")})
     ON CONFLICT (brand_id) DO UPDATE SET ${columns.map((c) => `${c} = EXCLUDED.${c}`).join(", ")}`,
    [BRAND, ...Object.values(values)],
  );
  const { rows } = await db.query<Record<string, unknown>>(
    "SELECT * FROM public.brand_tracking_settings WHERE brand_id = $1",
    [BRAND],
  );
  return rows[0];
}

describe("the store's TikTok and Snapchat pixel ids", () => {
  it("start off, with no id", async () => {
    const row = await save({ meta_pixel_id: "123456789012345" });
    expect(row).toMatchObject({
      tiktok_pixel_enabled: false,
      tiktok_pixel_id: null,
      snap_pixel_enabled: false,
      snap_pixel_id: null,
    });
  });

  it("are kept as the platforms show them, whatever was pasted", async () => {
    const row = await save({
      tiktok_pixel_enabled: true,
      tiktok_pixel_id: "  c4abcd1234567890abcd ",
      snap_pixel_enabled: true,
      snap_pixel_id: " 5C1A2B3D-0000-4000-8000-ABCDEF012345 ",
    });
    expect(row.tiktok_pixel_id).toBe("C4ABCD1234567890ABCD");
    expect(row.snap_pixel_id).toBe("5c1a2b3d-0000-4000-8000-abcdef012345");
  });

  it("refuse anything that is not an id of that shape", async () => {
    await expect(save({ tiktok_pixel_id: "<script>" })).rejects.toThrow(/tiktok_format/);
    await expect(save({ snap_pixel_id: "not-a-uuid" })).rejects.toThrow(/snap_format/);
  });

  it("empty to nothing, and leave the Meta and Google ids' rules as they were", async () => {
    const row = await save({
      tiktok_pixel_id: "  ",
      snap_pixel_id: "",
      google_analytics_id: " g-abc123 ",
    });
    expect(row.tiktok_pixel_id).toBeNull();
    expect(row.snap_pixel_id).toBeNull();
    expect(row.google_analytics_id).toBe("G-ABC123");
    expect(row.meta_pixel_id).toBe("123456789012345");
  });
});
