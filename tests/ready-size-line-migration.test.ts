import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import previous from "../supabase/migrations/20261002150000_fix_storefront_checkout_and_held_bookings.sql?raw";
import migration from "../supabase/migrations/20261005130000_ready_size_is_a_ready_line.sql?raw";

vi.setConfig({ testTimeout: 60_000 });

// The order builder is the checkout's core, so the migration that lets a shopper's ready size make
// a ready line must change nothing but that one condition.

const builder = (sql: string) => {
  const start = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.place_storefront_order_internal_20260710",
  );
  const open = sql.indexOf("$function$", start);
  const end = sql.indexOf("$function$", open + 1);
  return sql.slice(start, end + "$function$".length);
};
const squash = (sql: string) => sql.replace(/\s+/g, " ").trim();

const OLD = "v_is_tailoring := COALESCE(v_product.is_made_to_order, false);";
const NEW = `-- A made-to-order product is made to order unless the shopper chose a ready size on it
    -- (the item says tailored: false). A ready line is checked against stock below, so the
    -- claim cannot be used to skip anything.
    v_is_tailoring := COALESCE(v_product.is_made_to_order, false)
      AND COALESCE(v_item->>'tailored', 'true') <> 'false';`;

describe("the migration that lets a ready size be a ready line", () => {
  it("redefines the same builder (same arguments)", () => {
    const signature = (sql: string) => builder(sql).split("RETURNS")[0];
    expect(squash(signature(migration))).toBe(squash(signature(previous)));
  });

  it("changes the one condition and nothing else", () => {
    const before = squash(builder(previous));
    const after = squash(builder(migration));
    expect(before).toContain(squash(OLD));
    expect(after).not.toBe(before);
    expect(squash(after.replace(squash(NEW), squash(OLD)))).toBe(before);
  });

  it("keeps a ready line behind the stock check", () => {
    const body = builder(migration);
    expect(body).toContain("IF v_is_tailoring THEN");
    expect(body).toContain("RAISE EXCEPTION 'INSUFFICIENT_STOCK:%'");
  });
});

describe("the condition, as the database evaluates it", () => {
  it("is made to order unless the item says tailored is false, and never for a product that is not", async () => {
    const db = new PGlite();
    const run = async (flag: string, item: string) =>
      (
        await db.query<{ r: boolean }>(
          `SELECT (COALESCE(${flag}::boolean, false)
                   AND COALESCE('${item}'::jsonb->>'tailored', 'true') <> 'false') AS r`,
        )
      ).rows[0].r;
    expect(await run("true", "{}")).toBe(true);
    expect(await run("true", '{"tailored": true}')).toBe(true);
    expect(await run("true", '{"tailored": false}')).toBe(false);
    expect(await run("true", '{"tailored": null}')).toBe(true);
    expect(await run("true", '{"tailored": "no"}')).toBe(true);
    expect(await run("false", '{"tailored": true}')).toBe(false);
    expect(await run("null", "{}")).toBe(false);
  });
});
