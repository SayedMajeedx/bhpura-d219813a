import { describe, expect, it } from "vitest";
import previous from "../supabase/migrations/20260930220000_loyalty_free_shipping.sql?raw";
import migration from "../supabase/migrations/20261005110000_record_order_destination.sql?raw";

// place_storefront_order is the checkout's entry point and has been redefined many times, so the
// migration that makes it keep the order's country must change nothing else: its body is the
// previous definition with one assignment added.

const functionOf = (sql: string) => {
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.place_storefront_order");
  const open = sql.indexOf("$function$", start);
  const end = sql.indexOf("$function$", open + 1);
  return sql.slice(start, end + "$function$".length);
};
const squash = (sql: string) => sql.replace(/\s+/g, " ").trim();

const ASSIGNMENT = `destination_country = CASE
        WHEN p_fulfillment = 'delivery' THEN NULLIF(upper(btrim(p_customer ->> 'country_code')), '')
        ELSE NULL
      END,`;

describe("the migration that records an order's destination", () => {
  it("redefines the same function (same arguments) as the one it replaces", () => {
    const signature = (sql: string) => functionOf(sql).split("RETURNS")[0];
    expect(squash(signature(migration))).toBe(squash(signature(previous)));
  });

  it("changes one thing: the order's totals statement also sets destination_country", () => {
    const before = squash(functionOf(previous));
    const after = squash(functionOf(migration));
    expect(after).not.toBe(before);
    // Take the one assignment out and what is left is the previous definition, word for word.
    expect(squash(after.replace(squash(ASSIGNMENT), ""))).toBe(before);
  });

  it("writes the country only for a delivery, from the same value the delivery fee is worked out from", () => {
    const body = functionOf(migration);
    expect(body.match(/destination_country/g)).toHaveLength(1);
    expect(body).toContain("p_fulfillment = 'delivery'");
    expect(body).toContain("NULLIF(upper(btrim(p_customer ->> 'country_code')), '')");
  });
});
