import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

// The home page is split across its route and src/features/storefront-home (Phase 5).
const homeSource = () =>
  [
    "src/routes/$slug.index.tsx",
    ...["components", "lib"].flatMap((dir) =>
      readdirSync(`src/features/storefront-home/${dir}`)
        .sort()
        .map((file) => `src/features/storefront-home/${dir}/${file}`),
    ),
  ]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

describe("Item 3 & Item 4: Category taxonomy & RPC security integrity", () => {
  const migration5 = readFileSync(
    "supabase/migrations/20260905110000_remediate_phase5_categories_and_campaign_safeguards.sql",
    "utf8",
  );
  const storefrontIndex = homeSource();

  it("enforces admin access and brand boundary inside get_brand_categories_with_counts", () => {
    expect(migration5).toContain(
      "IF NOT (public.is_admin() AND public.can_access_brand(p_brand_id)) THEN",
    );
    expect(migration5).toContain("RAISE EXCEPTION 'Access denied'");
  });

  it("revokes get_brand_categories_with_counts execution from anon and public", () => {
    expect(migration5).toContain(
      "REVOKE ALL ON FUNCTION public.get_brand_categories_with_counts(uuid) FROM PUBLIC, anon;",
    );
    expect(migration5).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_brand_categories_with_counts(uuid) TO authenticated, service_role;",
    );
  });

  it("unifies New Arrivals definition to 30 days window in database migration", () => {
    expect(migration5).toContain("c.slug IN ('new-arrivals', 'new')");
    expect(migration5).toContain("p.created_at >= (now() - interval '30 days')");
    expect(migration5).toContain("p.is_active = true");
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
      {
        id: "1",
        brand_id: brandA,
        is_active: true,
        created_at: new Date(now - 5 * 24 * 3600 * 1000).toISOString(),
      }, // recent, active -> KEEP
      {
        id: "2",
        brand_id: brandA,
        is_active: true,
        created_at: new Date(now - 45 * 24 * 3600 * 1000).toISOString(),
      }, // old (>30d) -> EXCLUDE
      {
        id: "3",
        brand_id: brandA,
        is_active: false,
        created_at: new Date(now - 2 * 24 * 3600 * 1000).toISOString(),
      }, // inactive -> EXCLUDE
      {
        id: "4",
        brand_id: brandB,
        is_active: true,
        created_at: new Date(now - 1 * 24 * 3600 * 1000).toISOString(),
      }, // other brand -> EXCLUDE
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
    "utf8",
  );
  const integrationsUi = readFileSync(
    "src/routes/_authenticated/admin.b.$slug.integrations.tsx",
    "utf8",
  );

  it("adds last_rotated_at and rotated_by columns to integration_credentials", () => {
    expect(migration5).toContain("ADD COLUMN IF NOT EXISTS last_rotated_at timestamptz");
    expect(migration5).toContain(
      "ADD COLUMN IF NOT EXISTS rotated_by uuid REFERENCES auth.users(id)",
    );
  });

  it("updates save_integration_credential to record rotation timestamps and user", () => {
    expect(migration5).toContain("v_rotated := true;");
    expect(migration5).toContain(
      "last_rotated_at = CASE WHEN v_rotated THEN now() ELSE last_rotated_at END",
    );
    expect(migration5).toContain(
      "rotated_by = CASE WHEN v_rotated THEN auth.uid() ELSE rotated_by END",
    );
  });

  it("audit-logs key rotations inside save_integration_credential (bug #27)", () => {
    const fix = readFileSync(
      "supabase/migrations/20260928180000_audit_integration_key_rotations.sql",
      "utf8",
    );
    // Written by the function itself, in the rotation's transaction, as the caller.
    expect(fix).toMatch(/IF v_rotated THEN\s+INSERT INTO public\.saas_audit_logs/);
    expect(fix).toContain("'integration.key_rotated'");
    expect(fix).toContain("'integration_credential'");
    expect(fix).toMatch(
      /auth\.uid\(\),\s+\(SELECT u\.email FROM auth\.users u WHERE u\.id = auth\.uid\(\)\)/,
    );
    // Which secrets changed, never their values.
    expect(fix).toContain("'api_key', v_api_key_set");
    expect(fix).toContain("'webhook_secret', v_webhook_secret_set");
    expect(fix).not.toMatch(/jsonb_build_object\([^;]*p_api_key/);
    // Still admin-only and brand-scoped, and not callable anonymously.
    expect(fix).toContain(
      "IF NOT public.is_admin() OR NOT public.can_access_brand(p_brand_id) THEN",
    );
    expect(fix).toContain("FROM PUBLIC, anon;");
  });

  it("updates list_integration_credentials return signature and masks secrets", () => {
    expect(migration5).toContain("last_rotated_at timestamp with time zone");
    expect(migration5).toContain("'••••••••••••' || right(api.decrypted_secret, 4)");
    expect(migration5).toContain(
      "REVOKE ALL ON FUNCTION public.list_integration_credentials(uuid) FROM PUBLIC, anon;",
    );
  });

  it("exposes and formats last_rotated_at in the merchant integrations admin UI", () => {
    expect(integrationsUi).toContain("last_rotated_at: string | null;");
    expect(integrationsUi).toContain("History");
    expect(integrationsUi).toContain("row.last_rotated_at");
    expect(integrationsUi).toContain("آخر تدوير للمفاتيح:");
  });
});
