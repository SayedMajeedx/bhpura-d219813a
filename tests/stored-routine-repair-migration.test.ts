import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260808211000_repair_broken_stored_routines.sql"),
  "utf8",
);
const overloadCleanup = readFileSync(
  resolve("supabase/migrations/20260808214500_drop_broken_legacy_function_overloads.sql"),
  "utf8",
);

describe("stored routine repair migration", () => {
  test("drops only the demonstrated orphan vendor routines without cascade", () => {
    expect(migration).toContain("process_rent_auto_deduction");
    expect(migration).toContain("create_vendor_contract");
    expect(migration).not.toMatch(/DROP FUNCTION[^;]*CASCADE/i);
  });

  test("uses typed date boundaries and filters the aggregate before rounding", () => {
    expect(migration).toContain("(p_start_date AT TIME ZONE p_tz)::date");
    expect(migration).toMatch(/round\(\(sum\(oi\.line_total\) FILTER[\s\S]*?\)::numeric, 3\)/i);
  });

  test("orders report rows inside json aggregation and removes obsolete brand_pages", () => {
    expect(migration).toContain("jsonb_agg(row_payload ORDER BY created_at DESC)");
    expect(migration).not.toContain("INSERT INTO public.brand_pages");
  });

  test("does not cache permission-sensitive reporting authorization", () => {
    expect(migration).toContain("ALTER FUNCTION public.reporting_brand_id(text) VOLATILE");
  });

  test("removes only non-canonical legacy overloads without cascade", () => {
    expect(overloadCleanup).toContain("oidvectortypes(p.proargtypes)");
    expect(overloadCleanup).toContain("create_tenant_with_defaults");
    expect(overloadCleanup).not.toMatch(/DROP FUNCTION[^;]*CASCADE/i);
  });
});
