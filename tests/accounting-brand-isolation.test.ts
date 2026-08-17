import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migrationPath = "supabase/migrations/20260817090000_fix_accounting_brand_isolation.sql";
const migration = readFileSync(migrationPath, "utf8");

describe("accounting brand isolation migration", () => {
  it("removes every permissive authenticated-user accounting policy", () => {
    const insecurePolicies = [
      "Tenant Packaging Materials Access",
      "Tenant BOM Items Access",
      "Tenant Vendors Access",
      "Tenant Cash Accounts Access",
      "Tenant Transactions Access",
      "Tenant PO Access",
      "Tenant PO Items Access",
      "Tenant Ledger Accounts Access",
      "Tenant Journal Entries Access",
      "Tenant Journal Entry Lines Access",
    ];

    for (const policy of insecurePolicies) {
      expect(migration).toContain(`DROP POLICY IF EXISTS "${policy}"`);
    }
    expect(migration).not.toContain("USING (auth.uid() IS NOT NULL)");
  });

  it("requires brand access and the appropriate permission", () => {
    expect(migration.match(/public\.can_access_brand\(/g)?.length).toBeGreaterThanOrEqual(10);
    expect(migration).toContain("public.has_permission('manage_inventory')");
    expect(migration).toContain("public.has_permission('view_financials')");
    expect(migration).toContain("FROM public.purchase_orders po");
    expect(migration).toContain("FROM public.journal_entries je");
  });

  it("rejects cross-brand references even for privileged database paths", () => {
    expect(migration).toContain("CROSS_BRAND_BOM_REFERENCE");
    expect(migration).toContain("CROSS_BRAND_SOURCE_ACCOUNT");
    expect(migration).toContain("CROSS_BRAND_TARGET_ACCOUNT");
    expect(migration).toContain("CROSS_BRAND_PURCHASE_ORDER_VENDOR");
    expect(migration).toContain("CROSS_BRAND_EXPENSE_VENDOR");
    expect(migration).toContain("CROSS_BRAND_JOURNAL_LINE");
  });
});
