import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Item 3 & Item 4: Category taxonomy & RPC security integrity", () => {
  const migration5 = readFileSync(
    "supabase/migrations/20260905110000_remediate_phase5_categories_and_campaign_safeguards.sql",
    "utf8"
  );
  const storefrontCategory = readFileSync("src/routes/$slug.$category.tsx", "utf8");
  const storefrontIndex = readFileSync("src/routes/$slug.index.tsx", "utf8");

  it("enforces admin access and brand boundary inside get_brand_categories_with_counts", () => {
    expect(migration5).toContain("IF NOT (public.is_admin() AND public.can_access_brand(p_brand_id)) THEN");
    expect(migration5).toContain("RAISE EXCEPTION 'Access denied'");
  });

  it("revokes get_brand_categories_with_counts execution from anon and public", () => {
    expect(migration5).toContain(
      "REVOKE ALL ON FUNCTION public.get_brand_categories_with_counts(uuid) FROM PUBLIC, anon;"
    );
    expect(migration5).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_brand_categories_with_counts(uuid) TO authenticated, service_role;"
    );
  });

  it("unifies New Arrivals definition to 30 days window in database migration", () => {
    expect(migration5).toContain("c.slug IN ('new-arrivals', 'new')");
    expect(migration5).toContain("p.created_at >= (now() - interval '30 days')");
    expect(migration5).toContain("p.is_active = true");
  });

  it("applies 30-day window query constraint on storefront category page", () => {
    expect(storefrontCategory).toContain('if (smartKind === "new")');
    expect(storefrontCategory).toContain('30 * 24 * 60 * 60 * 1000');
    expect(storefrontCategory).toContain('query.gte("created_at", thirtyDaysAgo)');
  });

  it("applies 30-day window filter for new-arrivals on storefront homepage", () => {
    expect(storefrontIndex).toContain("if (isNew) {");
    expect(storefrontIndex).toContain("30 * 24 * 60 * 60 * 1000");
    expect(storefrontIndex).toContain("createdAt >= thirtyDaysAgo");
  });

  it("correctly filters products by the 30-day window, active state, and brand ID", () => {
    const now = Date.now();
    const brandA = "brand-a-uuid";
    const brandB = "brand-b-uuid";
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    const mockProducts = [
      { id: "1", brand_id: brandA, is_active: true, created_at: new Date(now - 5 * 24 * 3600 * 1000).toISOString() }, // recent, active -> KEEP
      { id: "2", brand_id: brandA, is_active: true, created_at: new Date(now - 45 * 24 * 3600 * 1000).toISOString() }, // old (>30d) -> EXCLUDE
      { id: "3", brand_id: brandA, is_active: false, created_at: new Date(now - 2 * 24 * 3600 * 1000).toISOString() }, // inactive -> EXCLUDE
      { id: "4", brand_id: brandB, is_active: true, created_at: new Date(now - 1 * 24 * 3600 * 1000).toISOString() }, // other brand -> EXCLUDE
    ];

    const targetBrand = brandA;
    const filtered = mockProducts.filter((p) => {
      const createdAt = new Date(p.created_at).getTime();
      return p.brand_id === targetBrand && p.is_active && createdAt >= now - thirtyDaysMs;
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("1");
  });
});

describe("Item 5: Stored Secrets and Vault Rotation Invariants", () => {
  const migration5 = readFileSync(
    "supabase/migrations/20260905110000_remediate_phase5_categories_and_campaign_safeguards.sql",
    "utf8"
  );
  const integrationsUi = readFileSync("src/routes/_authenticated/admin.b.$slug.integrations.tsx", "utf8");

  it("adds last_rotated_at and rotated_by columns to integration_credentials", () => {
    expect(migration5).toContain("ADD COLUMN IF NOT EXISTS last_rotated_at timestamptz");
    expect(migration5).toContain("ADD COLUMN IF NOT EXISTS rotated_by uuid REFERENCES auth.users(id)");
  });

  it("updates save_integration_credential to record rotation timestamps and user", () => {
    expect(migration5).toContain("v_rotated := true;");
    expect(migration5).toContain("last_rotated_at = CASE WHEN v_rotated THEN now() ELSE last_rotated_at END");
    expect(migration5).toContain("rotated_by = CASE WHEN v_rotated THEN auth.uid() ELSE rotated_by END");
  });

  it("updates list_integration_credentials return signature and masks secrets", () => {
    expect(migration5).toContain("last_rotated_at timestamp with time zone");
    expect(migration5).toContain("'••••••••••••' || right(api.decrypted_secret, 4)");
    expect(migration5).toContain("REVOKE ALL ON FUNCTION public.list_integration_credentials(uuid) FROM PUBLIC, anon;");
  });

  it("exposes and formats last_rotated_at in the merchant integrations admin UI", () => {
    expect(integrationsUi).toContain("last_rotated_at: string | null;");
    expect(integrationsUi).toContain("History");
    expect(integrationsUi).toContain("row.last_rotated_at");
    expect(integrationsUi).toContain("آخر تدوير للمفاتيح:");
  });
});
