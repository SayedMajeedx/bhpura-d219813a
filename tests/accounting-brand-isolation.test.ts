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

describe("the cash ledger (bug #25)", () => {
  const ledger = readFileSync(
    "supabase/migrations/20260928190000_cash_accounts_ledger.sql",
    "utf8",
  );

  it("gives every brand exactly one cash box and one bank account", () => {
    expect(ledger).toContain("CREATE UNIQUE INDEX IF NOT EXISTS cash_flow_accounts_brand_type_key");
    expect(ledger).toContain("ON CONFLICT (brand_id, account_type) DO NOTHING");
    expect(ledger).toContain("SELECT public.ensure_cash_flow_accounts(b.id) FROM public.brands b;");
    expect(ledger).toMatch(/AFTER INSERT ON public\.brands[\s\S]*?create_brand_cash_flow_accounts/);
  });

  it("posts a reconciled paid order once, to the cash box or the bank, and reverses it", () => {
    expect(ledger).toContain("AFTER UPDATE OF reconciliation_status ON public.orders");
    expect(ledger).toMatch(
      /'cod', 'cash', 'cash_on_delivery', 'cash on delivery'\)\s+THEN 'cash_box'/,
    );
    expect(ledger).toContain("ELSE 'bank_account'");
    // Only paid orders carry money; a second reconciliation does not post again.
    expect(ledger).toContain("lower(COALESCE(NEW.payment_status, '')) = 'paid'");
    expect(ledger).toContain("IF v_amount > 0 AND v_posted = 0 THEN");
    expect(ledger).toContain("'order_payment_reversal'");
    expect(ledger).toMatch(/ORDER BY id FOR UPDATE/);
  });

  it("records manual entries for authorised staff only, without overdrawing", () => {
    expect(ledger).toContain("OR NOT public.has_permission('view_financials') THEN");
    expect(ledger).toContain("RAISE EXCEPTION 'INSUFFICIENT_BALANCE'");
    expect(ledger).toContain(
      "REVOKE EXECUTE ON FUNCTION public.record_cash_account_entry(uuid, text, text, numeric, text) FROM PUBLIC, anon;",
    );
    // The helpers are internal: no client may call them directly.
    expect(ledger).toContain(
      "REVOKE ALL ON FUNCTION public.ensure_cash_flow_accounts(uuid) FROM PUBLIC, anon, authenticated;",
    );
  });
});
