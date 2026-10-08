import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Which columns of the catalog a browser can read.
 *
 * Costs sit in staff-only tables; the old cost columns of `products` and `product_variants` stay
 * for writes but are not selectable by `authenticated` (migration 20261008100000) or `anon`
 * (20261007120000). Because a column-level grant replaced the table-level one, a column added to
 * either table later is unreadable for signed-in staff until a migration grants it (the admin would
 * fail with "permission denied for column"). This reads the live database and fails on:
 *   - a cost column a browser role can read again (the exposure reopened), or
 *   - a non-cost column `authenticated` cannot read (the admin would break).
 */

export const COST_COLUMNS = {
  products: ["cost_price", "direct_packaging_cost", "vendor_id"],
  product_variants: ["cost_price"],
};
/** Also kept from visitors (who entered a row, the barcode), as 20261007120000 did. */
const ANON_HIDDEN = {
  products: ["user_id"],
  product_variants: ["barcode", "user_id"],
};

export const LIVE_COLUMNS_QUERY = `
select c.table_name, c.column_name,
       has_column_privilege('authenticated', format('public.%I', c.table_name)::regclass, c.column_name, 'SELECT') as authenticated,
       has_column_privilege('anon', format('public.%I', c.table_name)::regclass, c.column_name, 'SELECT') as anon
from information_schema.columns c
where c.table_schema = 'public' and c.table_name in ('products', 'product_variants')
order by 1, c.ordinal_position`;

/** `rows`: [{ table_name, column_name, authenticated, anon }] -> the problems found. */
export function diffCatalogColumns(rows) {
  const problems = [];
  for (const row of rows) {
    const where = `${row.table_name}.${row.column_name}`;
    const cost = COST_COLUMNS[row.table_name]?.includes(row.column_name);
    if (cost) {
      if (row.authenticated) problems.push({ column: where, kind: "cost-readable-by-signed-in" });
      if (row.anon) problems.push({ column: where, kind: "cost-readable-by-visitors" });
      continue;
    }
    if (ANON_HIDDEN[row.table_name]?.includes(row.column_name) && row.anon) {
      problems.push({ column: where, kind: "readable-by-visitors" });
    }
    if (!row.authenticated) problems.push({ column: where, kind: "not-readable-by-signed-in" });
  }
  return problems;
}

function readLive() {
  let output;
  try {
    output = execSync(
      `npx supabase db query --linked -o json "${LIVE_COLUMNS_QUERY.replace(/\s+/g, " ").trim()}"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
  } catch (err) {
    const text = `${err.stderr ?? ""}${err.stdout ?? ""}`;
    if (/access token|not linked|login/i.test(text)) {
      console.warn(
        "Supabase credentials are not configured here; skipping the catalog columns check.",
      );
      return null;
    }
    console.error(
      "Could not read the catalog columns from the linked database:",
      text || err.message,
    );
    process.exit(1);
  }
  const start = output.indexOf("{");
  return JSON.parse(output.slice(start)).rows;
}

export function checkCatalogColumnGrants() {
  console.log("Checking which catalog columns a browser can read...");
  const rows = readLive();
  if (!rows) return;
  const problems = diffCatalogColumns(rows);
  if (problems.length) {
    console.error(`\n${problems.length} catalog column grant(s) are wrong:`);
    for (const p of problems) console.error(`  - ${p.column}: ${p.kind}`);
    console.error(
      "\nA new column needs GRANT SELECT (column) ON public.<table> TO authenticated; in its migration\n" +
        "(and to anon only if the storefront reads it). A cost column must stay out of both.",
    );
    process.exit(1);
  }
  console.log(`Verified ${rows.length} catalog columns.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  checkCatalogColumnGrants();
}
