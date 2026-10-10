import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261007120000_hide_cost_columns_from_visitors.sql?raw";
import madeToOrderLimit from "../supabase/migrations/20261010110000_made_to_order_limit.sql?raw";
import madeToOrderPause from "../supabase/migrations/20261010120000_made_to_order_pause.sql?raw";
import {
  PRODUCT_CARD_SELECT,
  PRODUCT_DETAIL_BASE_SELECT,
  PRODUCT_DETAIL_SELECT,
  QUICK_SEARCH_SELECT,
  RECOMMENDATION_SELECT,
} from "../src/lib/data/storefront/selects";

vi.setConfig({ testTimeout: 60_000 });

// A visitor holds the public API key (it is in every page), so what the `anon` role may read is
// public. Costs, suppliers, who entered a row and barcodes must not be in it, and every column the
// storefront asks for must be.

const HIDDEN = {
  products: ["cost_price", "direct_packaging_cost", "vendor_id", "user_id"],
  product_variants: ["cost_price", "barcode", "user_id"],
};

/** The columns the migration grants to anon, by table. */
function granted(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  // The first migration grants the list; a later one adds a column to it.
  for (const sql of [migration, madeToOrderLimit, madeToOrderPause]) {
    for (const m of sql.matchAll(/GRANT SELECT \(([^)]*)\) ON public\.(\w+) TO anon;/g)) {
      out[m[2]] = [
        ...(out[m[2]] ?? []),
        ...m[1]
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
      ];
    }
  }
  return out;
}

/** A select list as the storefront writes it: its own columns, and the variants it embeds. */
function columnsOf(select: string) {
  const embedded = /product_variants\(([^)]*)\)/.exec(select);
  const own = select
    .replace(/product_variants\([^)]*\)/, "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const variants = (embedded?.[1] ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  return { own, variants };
}

describe("what a visitor can read of the catalog", () => {
  it("leaves out costs, suppliers, who entered the row, and barcodes", () => {
    const g = granted();
    for (const [table, hidden] of Object.entries(HIDDEN)) {
      expect(g[table], table).toBeDefined();
      for (const column of hidden) expect(g[table], `${table}.${column}`).not.toContain(column);
    }
  });

  it("keeps every column the storefront selects", () => {
    const g = granted();
    for (const select of [
      PRODUCT_CARD_SELECT,
      PRODUCT_DETAIL_BASE_SELECT,
      PRODUCT_DETAIL_SELECT,
      RECOMMENDATION_SELECT,
      QUICK_SEARCH_SELECT,
    ]) {
      const { own, variants } = columnsOf(select);
      for (const column of own) expect(g.products, `products.${column}`).toContain(column);
      for (const column of variants) {
        expect(g.product_variants, `product_variants.${column}`).toContain(column);
      }
    }
  });

  it("is what Postgres does: anon reads the granted columns only, signed-in and server keep all", async () => {
    const g = granted();
    const db = new PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      ${Object.entries({ products: HIDDEN.products, product_variants: HIDDEN.product_variants })
        .map(
          ([table, hidden]) => `CREATE TABLE public.${table} (${[...g[table], ...hidden]
            .map((c) => `${c} text`)
            .join(", ")});
          GRANT SELECT ON public.${table} TO anon, authenticated, service_role;`,
        )
        .join("\n")}
    `);
    await db.exec(migration);
    // A later migration's own grants to anon (a column added since).
    for (const grant of `${madeToOrderLimit}
${madeToOrderPause}`.match(/GRANT SELECT \([^)]*\) ON public\.\w+ TO anon;/g) ?? []) {
      await db.exec(grant);
    }
    const can = async (role: string, table: string, column: string) =>
      (
        await db.query<{ ok: boolean }>(
          `SELECT has_column_privilege('${role}', 'public.${table}', '${column}', 'SELECT') AS ok`,
        )
      ).rows[0].ok;
    for (const table of ["products", "product_variants"] as const) {
      for (const column of g[table])
        expect(await can("anon", table, column), `anon ${table}.${column}`).toBe(true);
      for (const column of HIDDEN[table]) {
        expect(await can("anon", table, column), `anon ${table}.${column}`).toBe(false);
        expect(await can("authenticated", table, column), `authenticated ${table}.${column}`).toBe(
          true,
        );
        expect(await can("service_role", table, column), `service_role ${table}.${column}`).toBe(
          true,
        );
      }
    }
    await expect(db.exec(migration)).resolves.toBeDefined();
  });
});
