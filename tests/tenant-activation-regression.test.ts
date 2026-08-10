import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve("supabase/migrations/20260810205000_fix_tenant_activation_business_settings.sql"),
  "utf8",
);

describe("tenant activation provisioning", () => {
  it("binds business settings to the owner and safely upserts the trigger-created row", () => {
    expect(migration).toMatch(/INSERT INTO public\.business_settings \(\s*user_id, brand_id/);
    expect(migration).toContain("p_owner_id, v_brand_id");
    expect(migration).toContain("ON CONFLICT (brand_id) DO UPDATE SET");
    expect(migration).toContain("user_id = EXCLUDED.user_id");
  });

  it("fails closed for non-super-admin authenticated callers", () => {
    expect(migration).toContain("IF NOT public.is_super_admin()");
    expect(migration).toContain("SUPER_ADMIN_REQUIRED");
    expect(migration).toContain("VALID_OWNER_REQUIRED");
  });
});
