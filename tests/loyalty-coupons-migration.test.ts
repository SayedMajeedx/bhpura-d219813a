import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261007140000_loyalty_and_coupons_server_side.sql?raw";

vi.setConfig({ testTimeout: 60_000 });

// Loyalty points and cart-recovery coupons are decided by the server. This runs the migration in
// Postgres: who may still call what, and what the coupon function now checks.

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const CART = "00000000-0000-4000-8000-0000000000c1";

const SERVER_ONLY = [
  "rpc_award_order_loyalty_points(uuid, uuid, text)",
  "rpc_validate_and_redeem_loyalty_points(uuid, uuid, integer, numeric, text, uuid)",
  "rpc_process_return_loyalty_adjustment(uuid, uuid, uuid, integer, integer, text)",
  "rpc_calculate_order_loyalty_points(uuid, uuid, numeric, numeric, numeric, numeric, boolean)",
  "rpc_evaluate_customer_loyalty_tier(uuid, uuid)",
];
const SIGNED_IN_ONLY = [
  "rpc_evaluate_brand_entitlements(uuid)",
  "rpc_sync_legacy_brands_to_subscriptions()",
  "rpc_generate_abandoned_cart_recovery_coupon(uuid, uuid, text, numeric, integer)",
];

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('test.role', true), '') $$;
    CREATE FUNCTION public.can_access_brand(uuid) RETURNS boolean LANGUAGE sql
      AS $$ SELECT $1 IS NOT NULL AND $1::text = nullif(current_setting('test.brand', true), '') $$;
    CREATE TABLE public.abandoned_carts (
      id uuid PRIMARY KEY, brand_id uuid NOT NULL, recovery_discount_code text, updated_at timestamptz
    );
    CREATE TABLE public.promo_codes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, code text NOT NULL,
      discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
      discount_value numeric NOT NULL CHECK (discount_value > 0),
      max_redemptions integer, usage_limit_per_customer integer, end_date timestamptz,
      is_active boolean NOT NULL DEFAULT true
    );
    INSERT INTO public.abandoned_carts (id, brand_id) VALUES ('${CART}', '${BRAND}');
  `);
  // Stand-ins for the functions that are only granted or revoked, never run here.
  for (const sig of [...SERVER_ONLY, ...SIGNED_IN_ONLY.slice(0, 2)]) {
    const name = sig.slice(0, sig.indexOf("("));
    const args = sig.slice(sig.indexOf("("));
    await db.exec(
      `CREATE FUNCTION public.${name}${args} RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;`,
    );
  }
  // The coupon function's previous form, as it was before the migration.
  await db.exec(`
    CREATE FUNCTION public.rpc_generate_abandoned_cart_recovery_coupon(p_brand_id uuid, p_cart_id uuid, p_discount_type text DEFAULT 'percentage', p_discount_value numeric DEFAULT 10.0, p_expiry_hours integer DEFAULT 48)
    RETURNS text LANGUAGE sql AS $$ SELECT 'old'::text $$;
  `);
  await db.exec(migration);
  return db;
}
const as = (db: PGlite, role: string, brand = "") =>
  db.exec(
    `SELECT set_config('test.role', '${role}', false), set_config('test.brand', '${brand}', false)`,
  );
const coupon = (db: PGlite, brand: string, type = "percentage", value = 100) =>
  db.query<{ c: string | null }>(
    `SELECT public.rpc_generate_abandoned_cart_recovery_coupon('${brand}', '${CART}', '${type}', ${value}, 48) AS c`,
  );
const can = async (db: PGlite, role: string, sig: string) =>
  (
    await db.query<{ ok: boolean }>(
      `SELECT has_function_privilege('${role}', 'public.${sig}'::regprocedure, 'EXECUTE') AS ok`,
    )
  ).rows[0].ok;

describe("loyalty and coupons on the server", () => {
  it("takes the loyalty functions away from visitors and shoppers", async () => {
    const db = await database();
    for (const sig of SERVER_ONLY) {
      expect(await can(db, "anon", sig), `${sig} anon`).toBe(false);
      expect(await can(db, "authenticated", sig), `${sig} authenticated`).toBe(false);
      expect(await can(db, "service_role", sig), `${sig} service_role`).toBe(true);
    }
  });

  it("keeps the admin screens' functions for signed-in staff, and takes them from visitors", async () => {
    const db = await database();
    for (const sig of SIGNED_IN_ONLY) {
      expect(await can(db, "anon", sig), `${sig} anon`).toBe(false);
      expect(await can(db, "authenticated", sig), `${sig} authenticated`).toBe(true);
      expect(await can(db, "service_role", sig), `${sig} service_role`).toBe(true);
    }
  });

  it("makes a coupon for staff of the brand and for the server, and for nobody else", async () => {
    const db = await database();
    await as(db, "authenticated", OTHER);
    await expect(coupon(db, BRAND)).rejects.toThrow(/NOT_AUTHORIZED/);
    await as(db, "anon");
    await expect(coupon(db, BRAND)).rejects.toThrow(/NOT_AUTHORIZED/);
    await expect(coupon(db, "00000000-0000-4000-8000-0000000000ff")).rejects.toThrow(
      /NOT_AUTHORIZED/,
    );
    await as(db, "");
    await expect(coupon(db, BRAND)).rejects.toThrow(/NOT_AUTHORIZED/);
    expect((await db.query(`SELECT 1 FROM public.promo_codes`)).rows).toHaveLength(0);

    await as(db, "authenticated", BRAND);
    const first = (await coupon(db, BRAND, "percentage", 15)).rows[0].c;
    expect(first).toMatch(/^CART-[0-9A-F]{8}$/);
    // Asked again for the same cart it gives the same code and makes no second one.
    await as(db, "service_role");
    expect((await coupon(db, BRAND, "percentage", 15)).rows[0].c).toBe(first);
    expect((await db.query(`SELECT 1 FROM public.promo_codes`)).rows).toHaveLength(1);
  });

  it("refuses a discount that is not a percentage up to 100 or a positive amount", async () => {
    const db = await database();
    await as(db, "service_role");
    await expect(coupon(db, BRAND, "percentage", 101)).rejects.toThrow(/INVALID_DISCOUNT/);
    await expect(coupon(db, BRAND, "percentage", 0)).rejects.toThrow(/INVALID_DISCOUNT/);
    await expect(coupon(db, BRAND, "fixed", -5)).rejects.toThrow(/INVALID_DISCOUNT/);
    await expect(coupon(db, BRAND, "free", 10)).rejects.toThrow(/INVALID_DISCOUNT/);
    expect((await coupon(db, BRAND, "fixed", 5)).rows[0].c).toMatch(/^CART-/);
  });

  it("is safe to run twice", async () => {
    const db = await database();
    await expect(db.exec(migration)).resolves.toBeDefined();
  });
});
