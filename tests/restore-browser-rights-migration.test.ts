import { describe, expect, it } from "vitest";
import migration from "../supabase/migrations/20261216100000_restore_browser_rights_lost_in_the_move.sql?raw";
import columnFix from "../supabase/migrations/20261216110000_restore_column_rights.sql?raw";
import functionGrants from "../supabase/function-grants.json";
import { missingCredentials } from "../scripts/database/credentials.mjs";
import { queryRows } from "../scripts/database/supabase-cli.mjs";
import { migrationEntries } from "../scripts/database/check-migration-drift.mjs";

/** The migrations made after the move, before this one (each sets its own objects' rights). */
const laterMigrations = import.meta.glob("../supabase/migrations/2026120[89]*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const laterStill = import.meta.glob("../supabase/migrations/202612(1[0-5])*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// The rights the move to Mumbai gave back (2026-11-21): the restore left every function and table
// open to visitors and signed-in accounts, and this migration takes away exactly what Mumbai granted
// that Tokyo, before the move, did not. It is generated from both databases, so these tests guard
// its shape: it only takes away, never from the server, closes what was found open, and agrees
// with supabase/function-grants.json (the list of functions a browser may call).

const statements = migration
  .split("\n")
  .filter((line) => line.trim() && !line.trim().startsWith("--"));

const functionRevokes = statements.flatMap((line) => {
  const m = line.match(
    /^REVOKE EXECUTE ON FUNCTION public\.([a-z0-9_]+)\((.*)\) FROM ([a-z, ]+);$/,
  );
  return m ? [{ name: m[1], args: m[2], from: m[3].split(", ") }] : [];
});
const tableRevokes = statements.flatMap((line) => {
  const m = line.match(/^REVOKE ([A-Z, ]+) ON TABLE public\.([a-z0-9_]+) FROM ([a-z, ]+);$/);
  return m ? [{ rights: m[1].split(", "), table: m[2], from: m[3].split(", ") }] : [];
});

describe("restoring the rights lost in the move", () => {
  it("only takes rights away, from visitors and signed-in accounts, never from the server", () => {
    expect(statements.length).toBe(functionRevokes.length + tableRevokes.length);
    expect(statements.every((line) => line.startsWith("REVOKE "))).toBe(true);
    for (const r of [...functionRevokes, ...tableRevokes]) {
      expect(r.from.every((role) => role === "anon" || role === "authenticated")).toBe(true);
    }
  });

  it("closes the stored keys, the stock ledger and the catalog's costs", () => {
    const closed = (name: string) =>
      functionRevokes.find((r) => r.name === name)?.from.sort() ?? [];
    expect(closed("get_integration_credential_secret")).toEqual(["anon", "authenticated"]);
    expect(closed("get_decrypted_instagram_token")).toEqual(["anon", "authenticated"]);
    expect(closed("apply_inventory_movement")).toEqual(["anon", "authenticated"]);
    // A column grant means nothing beside a table-level SELECT: it goes, the column grants stay.
    for (const table of ["products", "product_variants"]) {
      const select = tableRevokes.find((r) => r.table === table && r.rights.includes("SELECT"));
      expect(select?.from.sort()).toEqual(["anon", "authenticated"]);
    }
  });

  it("never takes from a role what the allowlist lets a browser call", () => {
    const allowlist = functionGrants.functions as Record<
      string,
      { anon: boolean; authenticated: boolean }
    >;
    // The allowlist names a function with its arguments' names and types, the migration with
    // their types alone (schema-qualified): both are read as a list of types.
    const listedTypes = (args: string) =>
      args
        ? args.split(", ").map((arg) =>
            arg
              .replace(/^(IN|OUT|INOUT|VARIADIC)\s+/, "")
              .replace(/^\S+\s+/, "")
              .trim(),
          )
        : [];
    const migrationTypes = (args: string) =>
      args ? args.split(",").map((type) => type.replace(/^public\./, "").trim()) : [];
    const allowed = new Map<string, { anon: boolean; authenticated: boolean }>();
    for (const [signature, rights] of Object.entries(allowlist)) {
      const name = signature.slice(0, signature.indexOf("("));
      const types = listedTypes(signature.slice(signature.indexOf("(") + 1, -1).trim());
      allowed.set(`${name}(${types.join(",")})`, rights);
    }
    const conflicts = functionRevokes.flatMap((r) => {
      const rights = allowed.get(`${r.name}(${migrationTypes(r.args).join(",")})`);
      if (!rights) return [];
      return r.from
        .filter((role) => rights[role as "anon" | "authenticated"])
        .map((role) => `${r.name}: ${role}`);
    });
    expect(conflicts).toEqual([]);
    // The matching reads every function the migration names that the allowlist lists at all.
    const matched = functionRevokes.filter((r) =>
      allowed.has(`${r.name}(${migrationTypes(r.args).join(",")})`),
    );
    expect(matched.length).toBeGreaterThan(100);
  });

  it("leaves the functions and tables made after the move to their own migrations", () => {
    const files = { ...laterMigrations, ...laterStill };
    expect(Object.keys(files).length).toBe(8); // 20261208100000 to 20261215100000
    const later = Object.values(files).join("\n");
    const made = new Set(
      [
        ...later.matchAll(
          /CREATE (?:OR REPLACE )?(?:FUNCTION|TABLE)(?: IF NOT EXISTS)? public\.([a-z0-9_]+)/gi,
        ),
      ]
        .map((m) => m[1])
        // Redefined here, but older than the move (Tokyo had them).
        .filter(
          (name) =>
            !/^(set_gift_card_designs|storefront_gift_card_designs|store_offers_|apply_store_offers|storefront_offers_preview|storefront_active_offers|transfer_stock_to_incubator_batch|record_incubator_sale)/.test(
              name,
            ),
        ),
    );
    const touched = [
      ...functionRevokes.map((r) => r.name),
      ...tableRevokes.map((r) => r.table),
    ].filter((name) => made.has(name));
    expect(touched).toEqual([]);
  });
});

describe("the column rights the table revokes took with them", () => {
  // REVOKE on a table also revokes that right on each of its columns, so 20261216100000 left
  // visitors and staff reading no column of the catalog or of brands until 20261216110000.
  const grants = columnFix
    .split("\n")
    .filter((line) => line.startsWith("GRANT "))
    .map((line) => {
      const m = line.match(/^GRANT ([A-Z]+) \((.+)\) ON TABLE public\.([a-z_]+) TO ([a-z]+);$/);
      if (!m) throw new Error(`unexpected line: ${line}`);
      return { right: m[1], columns: m[2].split(", "), table: m[3], role: m[4] };
    });
  const columnsOf = (table: string, role: string, right = "SELECT") =>
    grants.find((g) => g.table === table && g.role === role && g.right === right)?.columns ?? [];

  it("gives back every table whose column rights the revokes took", () => {
    const tablesHit = new Set(
      tableRevokes
        .filter((r) =>
          [
            "products",
            "product_variants",
            "brands",
            "gift_card_purchases",
            "shared_carts",
          ].includes(r.table),
        )
        .map((r) => r.table),
    );
    expect([...tablesHit].sort()).toEqual([...new Set(grants.map((g) => g.table))].sort());
    expect(columnsOf("products", "anon")).toContain("name_ar");
    expect(columnsOf("products", "authenticated")).toContain("archived_at");
    expect(columnsOf("product_variants", "anon")).toContain("selling_price");
    expect(columnsOf("brands", "anon")).toContain("slug");
    expect(columnsOf("shared_carts", "anon", "INSERT")).toEqual([
      "brand_id",
      "brand_slug",
      "code",
      "items",
    ]);
  });

  it("never gives a browser a cost, nor a visitor who entered a row or a barcode", () => {
    for (const g of grants) {
      expect(g.columns).not.toContain("cost_price");
      expect(g.columns).not.toContain("direct_packaging_cost");
      expect(g.columns).not.toContain("vendor_id");
      if (g.role === "anon" && (g.table === "products" || g.table === "product_variants")) {
        expect(g.columns).not.toContain("user_id");
        expect(g.columns).not.toContain("barcode");
      }
    }
  });
});

describe("a database check with no credentials", () => {
  it("skips on a contributor's machine and fails in CI, unless told to skip", () => {
    expect(missingCredentials({})).toBe("skip");
    expect(missingCredentials({ GITHUB_ACTIONS: "true" })).toBe("fail");
    expect(missingCredentials({ CI: "true" })).toBe("fail");
    expect(missingCredentials({ GITHUB_ACTIONS: "true", ALLOW_SKIP_DB_CHECKS: "1" })).toBe("skip");
  });
});

describe("what the Supabase CLI prints for a query", () => {
  const rows = [
    { a: 1, b: "x" },
    { a: 2, b: "y]}" },
  ];

  it("reads the bare array CI gets", () => {
    expect(queryRows(JSON.stringify(rows, null, 2))).toEqual(rows);
    expect(queryRows("[]\n")).toEqual([]);
  });

  it("reads the rows an AI agent gets, wrapped in a boundary, after the CLI's own lines", () => {
    const wrapped = JSON.stringify({ boundary: "17ac", rows, warning: "untrusted data" }, null, 2);
    expect(queryRows(`Initialising login role...\n${wrapped}\n`)).toEqual(rows);
  });

  it("fails on output with no rows rather than passing", () => {
    expect(() => queryRows("Connecting to remote database...")).toThrow(/no JSON/);
    expect(() => queryRows('{ "error": "denied" }')).toThrow(/no rows/);
  });
});

describe("what the Supabase CLI prints for the migration list", () => {
  // The CLI's own table, as CI prints it: a version on one side only leaves the other cell empty.
  const table = [
    "",
    "  ",
    "   Local            | Remote           | Time (UTC)            ",
    "  ------------------|------------------|-----------------------",
    "   `20261216110000` | `20261216110000` | `2026-12-16 11:00:00` ",
    "   `20261216120000` |                  | `2026-12-16 12:00:00` ",
    "                    | `20261216130000` | `2026-12-16 13:00:00` ",
    "",
  ].join("\n");

  it("reads each version as the repository and the database have it", () => {
    expect(migrationEntries(table)).toEqual([
      { local: "20261216110000", remote: "20261216110000" },
      { local: "20261216120000", remote: null },
      { local: null, remote: "20261216130000" },
    ]);
  });

  it("reads the JSON an AI agent gets", () => {
    const json = JSON.stringify({
      migrations: [
        { local: "20261216110000", remote: "20261216110000", time: "2026-12-16 11:00:00" },
        { local: "20261216120000", remote: "", time: "2026-12-16 12:00:00" },
      ],
    });
    expect(migrationEntries(`Initialising login role...\n${json}\n`)).toEqual([
      { local: "20261216110000", remote: "20261216110000" },
      { local: "20261216120000", remote: null },
    ]);
  });

  it("reads nothing from output that is not the table, so the check fails", () => {
    expect(migrationEntries("Connecting to remote database...\n")).toEqual([]);
    expect(migrationEntries("   Local | Remote | Time (UTC)\n  ---|---|---\n")).toEqual([]);
  });
});
