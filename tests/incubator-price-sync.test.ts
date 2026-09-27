import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve("supabase/migrations/20260821210000_sync_incubator_prices.sql"),
  "utf8",
);
// The screen side (edit action, Refresh, realtime, RTL) is rendered in
// tests/incubator-page-management.test.tsx.

describe("incubator price refresh and direction", () => {
  it("synchronizes saved consignment prices from current inventory prices", () => {
    expect(migration).toContain("sync_incubator_inventory_prices");
    expect(migration).toContain("SET consignment_price = pv.selling_price");
    expect(migration).toContain("ii.consignment_price IS DISTINCT FROM pv.selling_price");
  });

  it("keeps the synchronization tenant-scoped and permission protected", () => {
    expect(migration).toContain("public.can_access_brand(ii.brand_id)");
    expect(migration).toContain("public.has_permission('manage_inventory')");
  });
});
