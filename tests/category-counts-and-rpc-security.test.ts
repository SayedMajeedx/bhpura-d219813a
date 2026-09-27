import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// The storefront's 30-day new-arrivals rule is homeGridProducts
// (tests/home-products.test.ts); the integrations screen's "last rotated" line
// and rotation are rendered in tests/integrations-screen.test.tsx.
describe("Item 3 & Item 4: Category taxonomy & RPC security integrity", () => {
  const migration5 = readFileSync(
    "supabase/migrations/20260905110000_remediate_phase5_categories_and_campaign_safeguards.sql",
    "utf8",
  );

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
});

describe("Item 5: Stored Secrets and Vault Rotation Invariants", () => {
  const migration5 = readFileSync(
    "supabase/migrations/20260905110000_remediate_phase5_categories_and_campaign_safeguards.sql",
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
});
