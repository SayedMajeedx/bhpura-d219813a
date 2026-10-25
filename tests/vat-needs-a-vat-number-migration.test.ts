import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261025110000_vat_needs_a_vat_number.sql?raw";
import { chargedTaxRate, hasVatNumber, vatNumberPatch } from "../src/lib/vat-registration";

// A store charges VAT only when it has a VAT number (migration 20261025110000), run in a real
// Postgres (PGlite) on the settings row every order builder reads its rate from.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const UNREGISTERED = "00000000-0000-4000-8000-00000000000a";
const REGISTERED = "00000000-0000-4000-8000-00000000000b";
const BLANK = "00000000-0000-4000-8000-00000000000c";

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
  CREATE TABLE public.business_settings (
    brand_id uuid PRIMARY KEY, default_tax_rate numeric(5,2) DEFAULT 10,
    vat_inclusive boolean NOT NULL DEFAULT false, vat_number text
  );
  -- As live before the migration: two stores charging 10% with no VAT number, one registered.
  INSERT INTO public.business_settings VALUES
    ('${UNREGISTERED}', 10, false, NULL),
    ('${REGISTERED}', 10, true, '220000000000003'),
    ('${BLANK}', 10, false, '   ');
`;

let db: PGlite;
const settingsOf = async (brand: string) =>
  (
    await db.query<{ default_tax_rate: string; vat_inclusive: boolean }>(
      "select default_tax_rate, vat_inclusive from business_settings where brand_id = $1",
      [brand],
    )
  ).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(migration);
});

describe("VAT with a VAT number only", () => {
  it("stops the stores that charged VAT with no VAT number, and keeps the registered one", async () => {
    expect(Number((await settingsOf(UNREGISTERED)).default_tax_rate)).toBe(0);
    expect(Number((await settingsOf(BLANK)).default_tax_rate)).toBe(0);
    const registered = await settingsOf(REGISTERED);
    expect(Number(registered.default_tax_rate)).toBe(10);
    expect(registered.vat_inclusive).toBe(true);
  });

  it("starts a new store at no VAT, whatever rate it is created with", async () => {
    await db.query("insert into business_settings (brand_id) values (gen_random_uuid())");
    await db.query(
      "insert into business_settings (brand_id, default_tax_rate) values ('00000000-0000-4000-8000-0000000000d1', 10)",
    );
    const rates = await db.query<{ default_tax_rate: string }>(
      "select default_tax_rate from business_settings where vat_number is null",
    );
    expect(rates.rows.map((row) => Number(row.default_tax_rate))).toEqual([0, 0, 0]);
  });

  it("charges the store's rate once it saves a VAT number, and none once it clears it", async () => {
    await db.query(
      "update business_settings set vat_number = '220000000000099', default_tax_rate = 10 where brand_id = $1",
      [UNREGISTERED],
    );
    expect(Number((await settingsOf(UNREGISTERED)).default_tax_rate)).toBe(10);
    await db.query("update business_settings set vat_number = null where brand_id = $1", [
      UNREGISTERED,
    ]);
    expect(Number((await settingsOf(UNREGISTERED)).default_tax_rate)).toBe(0);
    // A rate sent with no number (an old form, a tenant function) is not kept.
    await db.query("update business_settings set default_tax_rate = 15 where brand_id = $1", [
      UNREGISTERED,
    ]);
    expect(Number((await settingsOf(UNREGISTERED)).default_tax_rate)).toBe(0);
  });
});

describe("the settings form's twin", () => {
  it("reads a blank number as none", () => {
    expect(hasVatNumber(null)).toBe(false);
    expect(hasVatNumber("  ")).toBe(false);
    expect(hasVatNumber("220000000000003")).toBe(true);
  });

  it("charges the rate only with a number", () => {
    expect(chargedTaxRate({ vat_number: null, default_tax_rate: 10 })).toBe(0);
    expect(chargedTaxRate({ vat_number: "220000000000003", default_tax_rate: "10.00" })).toBe(10);
    expect(chargedTaxRate({ vat_number: "220000000000003", default_tax_rate: null })).toBe(0);
  });

  it("clears the rate with the number, so the form shows what is saved", () => {
    expect(vatNumberPatch("")).toEqual({ vat_number: null, default_tax_rate: 0 });
    expect(vatNumberPatch("   ")).toEqual({ vat_number: null, default_tax_rate: 0 });
    expect(vatNumberPatch("2200")).toEqual({ vat_number: "2200" });
  });
});
