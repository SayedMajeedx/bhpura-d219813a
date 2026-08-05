import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260805193000_defer_card_stock_until_paid.sql"),
  "utf8",
);

describe("card order stock reservation policy", () => {
  it("does not release initiated or generically unpaid card reservations", () => {
    expect(migration).not.toContain("NOT v_should_deduct");
    expect(migration).not.toContain("payment_status, ''))) <> 'paid'");
    expect(migration).toContain("NOT IN ('failed', 'declined')");
  });

  it("releases a reserved snapshot only on a terminal payment transition", () => {
    expect(migration).toContain("OLD.stock_deducted AND OLD.stock_snapshot IS NOT NULL");
    expect(migration).toContain("jsonb_each_text(OLD.stock_snapshot)");
    expect(migration).toContain("NEW.stock_deducted := false");
    expect(migration).toContain("NEW.stock_snapshot := NULL");
    expect(migration).toContain("NEW.status := 'cancelled'");
  });

  it("makes failed and declined payment states valid", () => {
    expect(migration).toContain("'failed', 'declined'");
    expect(migration).toContain("'FAILED', 'DECLINED'");
  });
});
