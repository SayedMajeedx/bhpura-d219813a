import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import migration from "../supabase/migrations/20261118100000_made_to_measure_lines.sql?raw";
import { isMeasurementKey, madeToMeasure } from "../src/lib/made-to-measure";

// A piece made to the customer's measurements has no size (migration 20261118100000), in a real
// Postgres: the storefront's tailored line priced by one of the product's sizes, the editor's
// save, a piece made to order in a size, a line put back to ready, the lines already written,
// and the rule's twin in the app.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;
const ORDER = "00000000-0000-4000-8000-0000000000f1";

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
  CREATE TABLE public.order_items (
    id serial PRIMARY KEY, order_id uuid, location text DEFAULT 'main',
    selected_variant jsonb, custom_field_values jsonb DEFAULT '[]'::jsonb
  );
`;

const PASSPORT = [
  { key: "f1793271900376-0-passport_abaya_length", label_en: "Length", value: "56" },
  { key: "f1793271900376-1-passport_abaya_bust", label_en: "Bust", value: "22" },
];
const variant56 = { size: "56", color: "Black", fabric: null, sku: "AB-56" };

const insert = async (location: string, fields: unknown[], variant: unknown = variant56) =>
  (
    await db.query<{ id: number; selected_variant: Record<string, unknown> }>(
      `INSERT INTO public.order_items (order_id, location, selected_variant, custom_field_values)
       VALUES ($1, $2, $3::jsonb, $4::jsonb) RETURNING id, selected_variant`,
      [ORDER, location, JSON.stringify(variant), JSON.stringify(fields)],
    )
  ).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  // Written before the rule: a storefront line tailored to measurements, read as "56".
  await db.query(
    `INSERT INTO public.order_items (order_id, location, selected_variant, custom_field_values)
     VALUES ($1, 'custom', $2::jsonb, $3::jsonb), ($1, 'custom', $2::jsonb, '[]'::jsonb),
            ($1, 'main', $2::jsonb, $3::jsonb)`,
    [ORDER, JSON.stringify(variant56), JSON.stringify(PASSPORT)],
  );
  await db.exec(migration);
});

describe("the lines already written", () => {
  it("lose the size they were never made in, and nothing else", async () => {
    const { rows } = await db.query<{
      location: string;
      selected_variant: Record<string, unknown>;
    }>("SELECT location, selected_variant FROM public.order_items ORDER BY id LIMIT 3");
    expect(rows[0].selected_variant).toEqual({
      color: "Black",
      fabric: null,
      sku: "AB-56",
      made_to_measure: true,
    });
    // Made to order in size 56, with no measurements: 56 is the size it is made in.
    expect(rows[1].selected_variant).toMatchObject({ size: "56" });
    // A ready piece keeps its size whatever answers it carries.
    expect(rows[2].selected_variant).toMatchObject({ size: "56" });
  });
});

describe("a line being written", () => {
  it("made to measure from the storefront: no size, marked", async () => {
    const line = await insert("custom", PASSPORT);
    expect(line.selected_variant).not.toHaveProperty("size");
    expect(line.selected_variant.made_to_measure).toBe(true);
  });

  it("made to measure by the storefront's own mark, or the admin's measurements", async () => {
    expect(
      (await insert("custom", [{ key: "made_to_measure", value: "true" }])).selected_variant,
    ).not.toHaveProperty("size");
    const admin = await insert("custom", [
      { key: "fit_passport_profile", value: "عباية / Abaya" },
      { key: "fit_passport_unit", value: "in" },
      { key: "fit_passport_abaya_length", value: "56 in" },
    ]);
    expect(admin.selected_variant.made_to_measure).toBe(true);
  });

  it("not by bookkeeping alone, an empty measurement or a note", async () => {
    for (const fields of [
      [
        { key: "fit_passport_unit", value: "in" },
        { key: "fit_passport_profile", value: "Abaya" },
      ],
      [{ key: "fit_passport_abaya_length", value: "  " }],
      [{ key: "tailoring_notes", value: "Full lining" }],
    ]) {
      expect((await insert("custom", fields)).selected_variant.size).toBe("56");
    }
  });

  it("put back to ready: the mark goes, and a line with no variant is left alone", async () => {
    const line = await insert("custom", PASSPORT);
    const { rows } = await db.query<{ selected_variant: Record<string, unknown> }>(
      "UPDATE public.order_items SET location = 'main' WHERE id = $1 RETURNING selected_variant",
      [line.id],
    );
    expect(rows[0].selected_variant).not.toHaveProperty("made_to_measure");
    expect((await insert("custom", PASSPORT, null)).selected_variant).toEqual({
      made_to_measure: true,
    });
  });
});

describe("the rule's twin in the app", () => {
  it("names the same answers measurements", async () => {
    const keys = [
      "made_to_measure",
      "fit_passport_abaya_length",
      "fit_passport_unit",
      "fit_passport_version",
      "fit_passport_profile",
      "custom_measurements",
      "chest_measurement",
      "sizing_waist",
      "f1-0-passport_abaya_bust",
      "tailoring_notes",
      "length",
      "monogram",
      "",
    ];
    for (const key of keys) {
      const { rows } = await db.query<{ v: boolean }>(
        "SELECT public.order_line_measurement_key($1) AS v",
        [key],
      );
      expect(rows[0].v, key).toBe(isMeasurementKey(key));
    }
  });

  it("calls the same lines made to measure", async () => {
    const cases: Array<[string, unknown[]]> = [
      ["custom", PASSPORT],
      ["custom", []],
      ["main", PASSPORT],
      ["custom", [{ key: "tailoring_notes", value: "x" }]],
      ["custom", [{ key: "fit_passport_bust", value: "" }]],
    ];
    for (const [location, fields] of cases) {
      const { rows } = await db.query<{ v: boolean }>(
        "SELECT public.order_line_made_to_measure($1, $2::jsonb) AS v",
        [location, JSON.stringify(fields)],
      );
      expect(rows[0].v).toBe(
        madeToMeasure({
          location,
          custom_field_values: fields as Array<{ key: string; value: string }>,
        }),
      );
    }
  });
});
