import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261007110000_revoke_browser_access_to_server_functions.sql?raw";

vi.setConfig({ testTimeout: 60_000 });

// An audit found server-only functions (stored payment and email keys, marking a card order paid,
// plan quota) that any visitor or any signed-in shopper could call through the public API key.
// This runs the migration's grants against Postgres, with every function granted as Supabase
// grants a new one (to anon, authenticated and service_role), and checks who is left.

type Sig = { name: string; args: string };
const REVOKES = [
  ...migration.matchAll(/REVOKE EXECUTE ON FUNCTION public\.(\w+)\(([^)]*)\)\s+FROM ([^;]+);/g),
];
const sigs = (who: (list: string) => boolean): Sig[] =>
  REVOKES.filter((m) => who(m[3])).map((m) => ({ name: m[1], args: m[2] }));

// Revoked from signed-in callers too: only the server may call them.
const SERVER_ONLY = sigs((list) => list.includes("authenticated"));
// Revoked from anonymous callers only: signed-in staff still call them (and are checked inside).
const STAFF = sigs((list) => !list.includes("authenticated"));

// Called from a shopper's browser today, so they must keep their grant until they move to the
// server (removing it now would break checkout for stores that use loyalty).
const STILL_BROWSER_CALLED = [
  "rpc_award_order_loyalty_points(uuid, uuid, text)",
  "rpc_validate_and_redeem_loyalty_points(uuid, uuid, integer, numeric, text, uuid)",
  "rpc_generate_abandoned_cart_recovery_coupon(uuid, uuid, text, numeric, integer)",
  "rpc_evaluate_brand_entitlements(uuid)",
  "check_registered_customer_exists(uuid, text, text)",
];

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  `);
  const create = (sig: string) => {
    const [name, rest] = [sig.slice(0, sig.indexOf("(")), sig.slice(sig.indexOf("("))];
    return `CREATE FUNCTION public.${name}${rest} RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;`;
  };
  const all = [...SERVER_ONLY, ...STAFF].map((s) => `${s.name}(${s.args})`);
  for (const sig of [...all, ...STILL_BROWSER_CALLED]) await db.exec(create(sig));
  return db;
}

const can = async (db: PGlite, role: string, sig: string) => {
  const r = await db.query<{ ok: boolean }>(
    `SELECT has_function_privilege('${role}', 'public.${sig}'::regprocedure, 'EXECUTE') AS ok`,
  );
  return r.rows[0].ok;
};

describe("the migration that takes server-only functions away from the browser", () => {
  it("names the functions it is meant to (eleven revokes: seven server-only, four staff-only)", () => {
    expect(SERVER_ONLY.map((s) => s.name).sort()).toEqual([
      "apply_whatsapp_delivery_status",
      "courier_update_delivery",
      "get_integration_credential_secret",
      "reconcile_verified_tap_order",
      "reconcile_verified_tap_order",
      "rpc_check_entitlement",
      "rpc_consume_usage",
    ]);
    expect(STAFF.map((s) => s.name).sort()).toEqual([
      "apply_inventory_movement",
      "reconcile_inventory",
      "replace_order_items",
      "rpc_adjust_variant_stock",
    ]);
  });

  it("leaves only the server able to read keys, mark a card order paid or touch plan quota", async () => {
    const db = await database();
    await db.exec(migration);
    for (const s of SERVER_ONLY) {
      const sig = `${s.name}(${s.args})`;
      expect(await can(db, "anon", sig), `${sig} anon`).toBe(false);
      expect(await can(db, "authenticated", sig), `${sig} authenticated`).toBe(false);
      expect(await can(db, "service_role", sig), `${sig} service_role`).toBe(true);
    }
  });

  it("removes the anonymous grant from the stock and order-line functions, and keeps staff and the server", async () => {
    const db = await database();
    await db.exec(migration);
    for (const s of STAFF) {
      const sig = `${s.name}(${s.args})`;
      expect(await can(db, "anon", sig), `${sig} anon`).toBe(false);
      expect(await can(db, "authenticated", sig), `${sig} authenticated`).toBe(true);
      expect(await can(db, "service_role", sig), `${sig} service_role`).toBe(true);
    }
  });

  it("does not touch the functions the shopper's browser still calls", async () => {
    const db = await database();
    await db.exec(migration);
    for (const sig of STILL_BROWSER_CALLED) {
      expect(await can(db, "anon", sig), `${sig} anon`).toBe(true);
      expect(await can(db, "authenticated", sig), `${sig} authenticated`).toBe(true);
    }
    for (const { name } of [...SERVER_ONLY, ...STAFF]) {
      expect(STILL_BROWSER_CALLED.some((sig) => sig.startsWith(`${name}(`))).toBe(false);
    }
  });

  it("is safe to run twice", async () => {
    const db = await database();
    await db.exec(migration);
    await expect(db.exec(migration)).resolves.toBeDefined();
  });
});
