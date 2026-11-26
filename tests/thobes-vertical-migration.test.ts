import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import refineVerticals from "../supabase/migrations/20260929180000_refine_store_verticals.sql?raw";
import migration from "../supabase/migrations/20261224100000_thobes_vertical.sql?raw";
import { STORE_VERTICALS } from "../src/lib/store-profile";
import { verticalLineage } from "../src/lib/verticals/registry";

// The thobes vertical in the database (migration 20261224100000, phase 1 of
// docs/thobes-vertical-plan.md), run in a real Postgres (PGlite): the store's vertical accepts
// every vertical the app knows and nothing else, and alterations are on by default for the whole
// fashion family the registry has, thobes among them.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;
let next = 0;
const brand = () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE public.business_settings (
      brand_id uuid PRIMARY KEY, store_vertical text, offers_alterations boolean NOT NULL
    );
    CREATE FUNCTION public.business_settings_alterations_default() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
    CREATE TRIGGER trg_business_settings_alterations_default
      BEFORE INSERT OR UPDATE OF offers_alterations ON public.business_settings
      FOR EACH ROW EXECUTE FUNCTION public.business_settings_alterations_default();
  `);
  await db.exec(refineVerticals);
  await db.exec(migration);
});

const insert = async (vertical: string) => {
  const id = brand();
  await db.query(
    "INSERT INTO public.business_settings (brand_id, store_vertical) VALUES ($1, $2)",
    [id, vertical],
  );
  const { rows } = await db.query<{ offers_alterations: boolean }>(
    "SELECT offers_alterations FROM public.business_settings WHERE brand_id = $1",
    [id],
  );
  return rows[0].offers_alterations;
};

describe("the thobes vertical's migration", () => {
  it("accepts every vertical the app knows, with alterations on for the fashion family only", async () => {
    expect(STORE_VERTICALS).toContain("thobes");
    for (const vertical of STORE_VERTICALS) {
      expect(await insert(vertical), vertical).toBe(verticalLineage(vertical).includes("fashion"));
    }
  });

  it("refuses a vertical the app does not know", async () => {
    await expect(insert("kandura")).rejects.toThrow(/business_settings_store_vertical_check/);
  });

  it("keeps a store's own choice of alterations", async () => {
    const id = brand();
    await db.query(
      "INSERT INTO public.business_settings (brand_id, store_vertical, offers_alterations) VALUES ($1, 'thobes', false)",
      [id],
    );
    const { rows } = await db.query<{ offers_alterations: boolean }>(
      "SELECT offers_alterations FROM public.business_settings WHERE brand_id = $1",
      [id],
    );
    expect(rows[0].offers_alterations).toBe(false);
  });

  it("writes no store's row and keeps the default out of the browser's reach", () => {
    expect(migration).not.toMatch(/UPDATE\s+public\.business_settings/i);
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.business_settings_alterations_default() FROM PUBLIC, anon, authenticated;",
    );
  });
});
