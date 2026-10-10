import { describe, expect, it } from "vitest";
import previous from "../supabase/migrations/20261005110000_record_order_destination.sql?raw";
import migration from "../supabase/migrations/20261009140000_advance_pay_in_full.sql?raw";

// place_storefront_order is the checkout's entry point and has been redefined many times, so the
// migration that lets a customer pay in full must change nothing else: its body is the previous
// (live) definition with one assignment added to the order's final update.

const functionOf = (sql: string) => {
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.place_storefront_order(");
  const open = sql.indexOf("$function$", start);
  const end = sql.indexOf("$function$", open + 1);
  return sql.slice(start, end + "$function$".length);
};
const squash = (sql: string) => sql.replace(/\s+/g, " ").trim();

const ASSIGNMENT = `advance_rules = CASE
        WHEN advance_rules IS NOT NULL
          AND lower(COALESCE(p_customer ->> 'pay_in_full', '')) = 'true'
          AND COALESCE(
            (SELECT s.advance_allow_full_payment FROM public.business_settings s WHERE s.brand_id = v_brand_id),
            true)
        THEN public.advance_full_payment_rules()
        ELSE advance_rules
      END,`;

describe("the migration that lets a customer pay the whole amount", () => {
  it("redefines the same function (same arguments) as the one it replaces", () => {
    const signature = (sql: string) => functionOf(sql).split("RETURNS")[0];
    expect(squash(signature(migration))).toBe(squash(signature(previous)));
  });

  it("changes one thing: the order's final update also sets advance_rules", () => {
    const before = squash(functionOf(previous));
    const after = squash(functionOf(migration));
    expect(after).not.toBe(before);
    expect(squash(after.replace(squash(ASSIGNMENT), ""))).toBe(before);
  });

  it("only replaces the snapshot of an order that has one, for a store that allows it", () => {
    const body = squash(functionOf(migration));
    expect(body).toContain("WHEN advance_rules IS NOT NULL");
    expect(body).toContain("s.advance_allow_full_payment");
    expect(body).toContain("ELSE advance_rules END");
  });

  it("adds the setting to the public view at its end and defaults it on", () => {
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS advance_allow_full_payment boolean NOT NULL DEFAULT true",
    );
    expect(migration).toMatch(
      /bs\.delivery_estimate_tailored_en,\s+bs\.advance_allow_full_payment\s+FROM business_settings bs/,
    );
  });
});
