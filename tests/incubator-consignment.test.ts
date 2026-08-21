import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve("supabase/migrations/20260821193000_incubator_consignment_management.sql"),
  "utf8",
);

describe("incubator consignment inventory", () => {
  it("moves units between main and incubator stock atomically", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.transfer_stock_to_incubator");
    expect(migration).toMatch(
      /stock_main = stock_main - p_quantity[\s\S]*stock_incubator = stock_incubator \+ p_quantity/,
    );
    expect(migration).toContain("INSUFFICIENT_MAIN_STOCK");
  });

  it("records a sale against the named incubator and reduces only incubator stock", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.record_incubator_sale");
    expect(migration).toMatch(/incubator_inventory SET quantity = quantity - p_quantity/);
    expect(migration).toMatch(
      /product_variants SET stock_incubator = stock_incubator - p_quantity/,
    );
    expect(migration).toContain("v_net := v_gross - v_commission");
  });

  it("allocates monthly payments without allowing an overpayment", () => {
    expect(migration).toContain("PAYMENT_EXCEEDS_AMOUNT_DUE");
    expect(migration).toContain("ORDER BY sold_at, created_at FOR UPDATE");
    expect(migration).toContain("incubator_payment_allocations");
  });

  it("preserves legacy incubator quantities during migration", () => {
    expect(migration).toContain("الحاضنة القديمة");
    expect(migration).toContain("WHERE p.brand_id = r.brand_id AND v.stock_incubator > 0");
  });

  it("enforces tenant isolation on every brand-owned table", () => {
    expect(migration).toContain("CROSS_BRAND_INCUBATOR_REFERENCE");
    expect(migration.match(/ENABLE ROW LEVEL SECURITY/g)?.length).toBe(6);
    expect(migration).toContain("public.can_access_brand(brand_id)");
    expect(migration).toContain("public.has_permission('manage_inventory')");
  });
});
