import { existsSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261009110000_zh_size_guide_brand_chart.sql?raw";
import { formatCell, normalizeSizeGuide } from "../src/addons/size-guides/lib/size-guide";

// ZH's own chart as the database stores it (PGlite): applied to the untouched default
// guide of the store 'zh' only, and read back through the same normaliser the storefront uses.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ZH = "00000000-0000-4000-8000-0000000000c1";
const PURA = "00000000-0000-4000-8000-0000000000c2";
let db: PGlite;

const row = (n: number) => `{"label":"${n}","values":{"length":${n},"bust":${n - 30}}}`;
const sixRows = `[${[50, 52, 54, 56, 58, 60].map(row).join(",")}]`;

const guideOf = async (brand: string) => {
  const { rows } = await db.query<Record<string, unknown>>(
    "SELECT * FROM public.size_guides WHERE brand_id = $1",
    [brand],
  );
  return rows[0];
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text);
    CREATE TABLE public.size_guides (
      brand_id uuid PRIMARY KEY, name_ar text, name_en text, template_key text,
      base_unit text, columns jsonb, rows jsonb, how_to_measure jsonb, diagram_url text
    );
    INSERT INTO public.brands VALUES ('${ZH}', 'zh'), ('${PURA}', 'pura');
    INSERT INTO public.size_guides VALUES
      ('${ZH}', 'دليل', 'Guide', 'abaya_gulf', 'in', '[]', '${sixRows}', '[]', NULL),
      ('${PURA}', 'دليل', 'Guide', 'abaya_gulf', 'in', '[]', '${sixRows}', '[]', NULL);
  `);
  await db.exec(migration);
});

describe("ZH's size chart", () => {
  it("is the brand's chart: sizes 50 to 60, length, width and sleeve in inches", async () => {
    const stored = await guideOf(ZH);
    const guide = normalizeSizeGuide({
      id: "g",
      brand_id: ZH,
      ...stored,
      placement: "modal",
      recommender_enabled: true,
    });
    expect(guide.name_ar).toBe("جدول المقاسات");
    expect(guide.base_unit).toBe("in");
    expect(guide.rows.map((r) => r.label)).toEqual([
      "50",
      "51",
      "52",
      "53",
      "54",
      "55",
      "56",
      "57",
      "58",
      "59",
      "60",
    ]);
    expect(guide.columns.map((c) => [c.key, c.label_ar])).toEqual([
      ["length", "الطول"],
      ["width", "العرض"],
      ["sleeve", "طول الكم"],
    ]);
    const at = (label: string, key: string) =>
      guide.rows.find((r) => r.label === label)!.values[key];
    expect([at("50", "width"), at("50", "sleeve")]).toEqual([21, 28]);
    expect([at("55", "width"), at("55", "sleeve")]).toEqual([23.5, 30]);
    expect([at("60", "length"), at("60", "width"), at("60", "sleeve")]).toEqual([60, 26, 33]);
    // The toggle still converts: 26 in is 66.04 cm.
    const width = guide.columns.find((c) => c.key === "width")!;
    expect(formatCell(26, width, "in", "cm")).toMatch(/66/);
  });

  it("points at a diagram that ships with the app", async () => {
    const stored = await guideOf(ZH);
    expect(stored.diagram_url).toBe("/size-guides/zh-abaya-diagram.png");
    expect(existsSync("public/size-guides/zh-abaya-diagram.png")).toBe(true);
  });

  it("leaves other stores alone", async () => {
    const pura = await guideOf(PURA);
    expect(pura.name_en).toBe("Guide");
    expect(pura.diagram_url).toBeNull();
  });

  it("does not overwrite a guide the store has edited, and is safe to run twice", async () => {
    await db.exec(migration);
    const once = await guideOf(ZH);
    await db.exec(`UPDATE public.size_guides SET name_en = 'Edited' WHERE brand_id = '${ZH}'`);
    await db.exec(migration);
    expect((await guideOf(ZH)).name_en).toBe("Edited");
    expect(once.name_en).toBe("Size Chart");
  });
});
