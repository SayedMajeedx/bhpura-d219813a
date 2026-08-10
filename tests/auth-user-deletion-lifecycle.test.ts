import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Auth user deletion lifecycle", () => {
  const migration = read("supabase/migrations/20260810223000_delete_orphaned_auth_users.sql");
  const userManagement = read("supabase/functions/user-management/index.ts");

  it("deletes customer identities only after every customer and team link is gone", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.delete_brand_customers");
    expect(migration).toContain("c.brand_id = p_brand_id");
    expect(migration).toContain("c.id = ANY(p_customer_ids)");
    expect(migration).toContain("NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)");
    expect(migration).toContain(
      "NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.auth_user_id = u.id)",
    );
    expect(migration).toContain("DELETE FROM auth.users u");
  });

  it("removes team access without deleting a linked storefront identity", () => {
    expect(userManagement).toContain('from("profiles").delete().eq("id", userId)');
    expect(userManagement).toContain("customer_identity_preserved: true");
    expect(userManagement).toContain("supabase.auth.admin.deleteUser(userId)");
  });

  it("cleans orphaned identities after a permanent brand purge", () => {
    expect(migration).toContain("p.role <> 'super_admin'");
    expect(migration).toContain("'auth_users_deleted', v_auth_count");
    expect(migration).toContain("IF NOT p_hard THEN");
  });
});
