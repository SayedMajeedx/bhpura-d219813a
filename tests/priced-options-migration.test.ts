import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import previous from "../supabase/migrations/20261005130000_ready_size_is_a_ready_line.sql?raw";
import migration from "../supabase/migrations/20261011100000_priced_options_charged.sql?raw";
import { fieldPriceDelta } from "../src/features/product-page/lib/variant-options";

// The priced options of an order line, worked out by the database from the store's own data
// (PGlite), and the browser's rule beside it: both must put the same price on the same choice,
// or the checkout shows one total and the order another.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000a2";
const ABAYA = "00000000-0000-4000-8000-0000000000b1";
const SCARF = "00000000-0000-4000-8000-0000000000b2";
const GIFT_BOX = "00000000-0000-4000-8000-0000000000c1";
const INNER_DRESS = "00000000-0000-4000-8000-0000000000c2";
const OTHER_STORE_ADDON = "00000000-0000-4000-8000-0000000000c3";
const FREE_ADDON = "00000000-0000-4000-8000-0000000000c4";

const LINING = {
  key: "lining",
  label_en: "Lining",
  label_ar: "البطانة",
  type: "select",
  options: ["No lining", "Silk lining (+ 5 BHD)", "Satin (+2.5)"],
};
const NOTE = { key: "note", label_en: "Note", label_ar: "ملاحظة", type: "text" };

let db: PGlite;

type Line = Array<{ name: string; price_delta: number }>;
const priced = async (fields: Array<{ key: string; value?: string }>, product = ABAYA) =>
  (
    await db.query<{ c: Line }>(
      "SELECT public.storefront_line_customizations($1, $2, $3::jsonb) AS c",
      [BRAND, product, JSON.stringify(fields)],
    )
  ).rows[0].c;
const total = (line: Line) => line.reduce((sum, c) => sum + Number(c.price_delta), 0);

const functionOf = (sql: string, name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const tag = /\$(\w*)\$/.exec(sql.slice(start))![0];
  const open = sql.indexOf(tag, start);
  const end = sql.indexOf(tag, open + tag.length);
  return sql.slice(start, end + tag.length);
};
const squash = (sql: string) => sql.replace(/\s+/g, " ").trim();

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE TABLE public.products (id uuid PRIMARY KEY, brand_id uuid NOT NULL, custom_fields jsonb);
    CREATE TABLE public.customization_options (
      id uuid PRIMARY KEY, brand_id uuid NOT NULL, name text NOT NULL,
      price_delta numeric NOT NULL DEFAULT 0, product_ids text[] DEFAULT '{}'
    );
    INSERT INTO public.products VALUES
      ('${ABAYA}', '${BRAND}', '${JSON.stringify([LINING, NOTE])}'::jsonb),
      ('${SCARF}', '${BRAND}', '[]'::jsonb);
    INSERT INTO public.customization_options (id, brand_id, name, price_delta, product_ids) VALUES
      ('${GIFT_BOX}', '${BRAND}', 'Gift box', 1.5, '{}'),
      ('${INNER_DRESS}', '${BRAND}', 'Inner dress', 7, ARRAY['${ABAYA}']),
      ('${OTHER_STORE_ADDON}', '${OTHER}', 'Other store', 99, '{}'),
      ('${FREE_ADDON}', '${BRAND}', 'Free card', 0, '{}');
  `);
  // The pricing function and its grants: everything before the order builder, which needs the
  // whole orders schema and is checked against its previous definition below.
  await db.exec(migration.slice(0, migration.indexOf("-- The order builder:")));
});

describe("what the database prices on a line", () => {
  it("charges an add-on the shopper ticked, at the store's price", async () => {
    expect(await priced([{ key: `addon_${GIFT_BOX}`, value: "+ BHD 1.500" }])).toEqual([
      { name: "Gift box", price_delta: 1.5 },
    ]);
  });

  it("ignores the price the browser sent with it", async () => {
    const line = await priced([{ key: `addon_${GIFT_BOX}`, value: "Free" }]);
    expect(total(line)).toBe(1.5);
  });

  it("charges an add-on only on the products it is for", async () => {
    expect(total(await priced([{ key: `addon_${INNER_DRESS}` }]))).toBe(7);
    expect(await priced([{ key: `addon_${INNER_DRESS}` }], SCARF)).toEqual([]);
  });

  it("never charges another store's add-on, or one that costs nothing", async () => {
    expect(await priced([{ key: `addon_${OTHER_STORE_ADDON}` }])).toEqual([]);
    expect(await priced([{ key: `addon_${FREE_ADDON}` }])).toEqual([]);
  });

  it("charges a priced choice of one of the product's own select fields", async () => {
    expect(await priced([{ key: "lining", value: "Silk lining (+ 5 BHD)" }])).toEqual([
      { name: "Lining: Silk lining (+ 5 BHD)", price_delta: 5 },
    ]);
    expect(total(await priced([{ key: "lining", value: "Satin (+2.5)" }]))).toBe(2.5);
    expect(await priced([{ key: "lining", value: "No lining" }])).toEqual([]);
  });

  it("does not price a choice the product does not offer, or text a shopper typed", async () => {
    expect(await priced([{ key: "lining", value: "Gold (+ 500 BHD)" }])).toEqual([]);
    expect(await priced([{ key: "note", value: "make it +2 cm longer" }])).toEqual([]);
    expect(await priced([{ key: "unknown", value: "(+ 9)" }])).toEqual([]);
  });

  it("adds everything chosen on one line", async () => {
    const line = await priced([
      { key: "lining", value: "Silk lining (+ 5 BHD)" },
      { key: `addon_${GIFT_BOX}` },
      { key: `addon_${INNER_DRESS}` },
      { key: "note", value: "+3" },
    ]);
    expect(total(line)).toBe(13.5);
    expect(line.map((c) => c.name)).toEqual([
      "Gift box",
      "Inner dress",
      "Lining: Silk lining (+ 5 BHD)",
    ]);
  });

  it("copes with a line that sent nothing, or something that is not a list", async () => {
    expect(await priced([])).toEqual([]);
    const { rows } = await db.query<{ c: Line }>(
      "SELECT public.storefront_line_customizations($1, $2, 'null'::jsonb) AS c",
      [BRAND, ABAYA],
    );
    expect(rows[0].c).toEqual([]);
  });

  it("is not callable by a browser", async () => {
    const { rows } = await db.query<{ anon: boolean; authenticated: boolean }>(`
      SELECT has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
      FROM pg_proc p WHERE p.proname = 'storefront_line_customizations'`);
    expect(rows[0]).toEqual({ anon: false, authenticated: false });
  });
});

describe("the browser and the database price a choice alike", () => {
  const answers: Array<[typeof LINING | typeof NOTE, string]> = [
    [LINING, "No lining"],
    [LINING, "Silk lining (+ 5 BHD)"],
    [LINING, "Satin (+2.5)"],
    [LINING, "Gold (+ 500 BHD)"],
    [LINING, " Silk lining (+ 5 BHD) "],
    [NOTE, "make it +2 cm longer"],
    [NOTE, "+ 7 BHD"],
  ];

  it("for every answer to a field", async () => {
    for (const [field, value] of answers) {
      const inBrowser = fieldPriceDelta(field, value);
      const inDatabase = total(await priced([{ key: field.key, value }]));
      expect(inBrowser, `${field.key}: ${value}`).toBe(inDatabase);
    }
  });

  it("free text never carries a price in the browser", () => {
    expect(fieldPriceDelta(NOTE, "+ 7 BHD")).toBe(0);
    expect(fieldPriceDelta({ type: "number" }, "+5")).toBe(0);
    expect(fieldPriceDelta(LINING, "")).toBe(0);
    expect(fieldPriceDelta(LINING, null)).toBe(0);
  });
});

describe("the order builder changes only what charging the options needs", () => {
  const body = (sql: string) => {
    const fn = functionOf(sql, "place_storefront_order_internal_20260710");
    return squash(fn.slice(fn.search(/\bDECLARE\b/)));
  };

  it("charges (price + options) x quantity and records the options on the line", () => {
    const after = body(migration);
    expect(after).toContain(
      "v_line_total := ((v_variant.selling_price + v_customization_total) * v_qty)::numeric(14,3);",
    );
    expect(after.match(/custom_field_values, customizations, customization_total/g)).toHaveLength(
      2,
    );
  });

  it("is otherwise the previous definition, word for word", () => {
    const restored = squash(
      body(migration)
        .replace("v_customizations jsonb; v_customization_total numeric(14,3); ", "")
        .replace(
          /-- The priced options the shopper chose, at the store's own prices\. .*?\)::numeric\(14,3\); (?=v_line_total)/,
          "",
        )
        .replace(
          "v_line_total := ((v_variant.selling_price + v_customization_total) * v_qty)::numeric(14,3);",
          "v_line_total := (v_variant.selling_price * v_qty)::numeric(14,3);",
        )
        .replaceAll(
          "custom_field_values, customizations, customization_total",
          "custom_field_values",
        )
        .replaceAll(", v_customizations, v_customization_total", ""),
    );
    expect(restored).toBe(body(previous));
  });
});
