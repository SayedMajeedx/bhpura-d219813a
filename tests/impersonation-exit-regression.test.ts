import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

describe("impersonation exit regression", () => {
  it("uses the narrowly scoped exit middleware for the stop function", () => {
    const source = fs.readFileSync(path.join(root, "src/lib/impersonation.functions.ts"), "utf8");

    expect(source).toMatch(
      /stopImpersonationSession[\s\S]*?middleware\(\[requireSupabaseAuthForImpersonationExit\]\)/,
    );
  });

  it("keeps the read-only safeguard enabled for normal authenticated mutations", () => {
    const source = fs.readFileSync(
      path.join(root, "src/integrations/supabase/auth-middleware.ts"),
      "utf8",
    );

    expect(source).toContain("export const requireSupabaseAuth = createSupabaseAuthMiddleware();");
    expect(source).toContain("options?.allowImpersonationLifecycle !== true");
    expect(source).toContain("superadmin_impersonation_mutation_allowed");
  });
});
