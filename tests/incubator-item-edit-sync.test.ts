import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve("supabase/migrations/20260821223000_edit_incubator_inventory_items.sql"),
  "utf8",
);
// The screen side (edit action, Refresh, realtime, RTL) is rendered in
// tests/incubator-page-management.test.tsx.

describe("incubator item code editing and synchronization", () => {
  it("updates the authoritative inventory row through a protected RPC", () => {
    expect(migration).toContain("update_incubator_inventory_item");
    expect(migration).toContain("external_code = nullif(trim(p_external_code), '')");
    expect(migration).toContain("public.can_access_brand(v_item.brand_id)");
    expect(migration).toContain("public.has_permission('manage_inventory')");
  });

  it("publishes incubator tables for cross-screen realtime updates", () => {
    expect(migration).toContain("supabase_realtime");
    expect(migration).toContain("'incubator_inventory'");
  });
});
