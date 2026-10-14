import { describe, expect, it } from "vitest";
import previous from "../supabase/migrations/20261009140000_advance_pay_in_full.sql?raw";
import migration from "../supabase/migrations/20261014130000_partner_pickup_points.sql?raw";

// place_storefront_order is the checkout's entry point and has been redefined many times, so the
// migration that lets a shopper collect at a partner's shop must change nothing else in it: its
// body is the live definition (20261009140000, read from production on 2026-10-14) with one
// statement added. What that statement calls is run in a real Postgres by
// tests/partner-pickup-migration.test.ts.

const functionOf = (sql: string) => {
  const start = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.place_storefront_order(p_brand_slug text, p_customer jsonb, p_items jsonb, p_payment_method text, p_notes text DEFAULT NULL::text, p_fulfillment",
  );
  const open = sql.indexOf("$function$", start);
  const end = sql.indexOf("$function$", open + 1);
  return sql.slice(start, end + "$function$".length);
};
const squash = (sql: string) => sql.replace(/\s+/g, " ").trim();

const ADDED = `  -- ADDED (20261014130000): collected at a partner's shop. The order names the partner and its
  -- ready pieces come from it; refused (PICKUP_PARTNER_UNAVAILABLE) when the partner does not take
  -- pickups or does not hold every piece.
  IF p_fulfillment = 'pickup' AND NULLIF(btrim(COALESCE(p_customer ->> 'pickup_partner_id', '')), '') IS NOT NULL THEN
    PERFORM public.assign_order_pickup_partner(v_order_id, (p_customer ->> 'pickup_partner_id')::uuid);
  END IF;
`;

describe("the migration that lets a shopper collect at a partner's shop", () => {
  it("redefines the same function (same arguments) as the live one", () => {
    const signature = (sql: string) => functionOf(sql).split("RETURNS")[0];
    expect(functionOf(migration)).not.toBe("");
    expect(squash(signature(migration))).toBe(squash(signature(previous)));
  });

  it("changes one thing: after the order's totals, a pickup at a partner is assigned", () => {
    const before = squash(functionOf(previous));
    const after = squash(functionOf(migration));
    expect(after).not.toBe(before);
    expect(after).toContain(squash(ADDED));
    // Take the one statement out and what is left is the live definition, word for word.
    expect(squash(after.replace(squash(ADDED), ""))).toBe(before);
  });

  it("assigns only a pickup, after the order and its lines exist, and before the claim is linked", () => {
    const body = functionOf(migration);
    const added = body.indexOf("assign_order_pickup_partner");
    expect(body.match(/assign_order_pickup_partner/g)).toHaveLength(1);
    expect(body).toContain("IF p_fulfillment = 'pickup'");
    expect(added).toBeGreaterThan(body.indexOf("v_order_id := (v_result->>'order_id')::uuid;"));
    expect(added).toBeLessThan(body.indexOf("-- 3. Link the successfully completed order"));
  });
});
