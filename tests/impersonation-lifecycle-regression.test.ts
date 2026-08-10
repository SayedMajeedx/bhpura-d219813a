import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("impersonation lifecycle", () => {
  const functions = fs.readFileSync(
    path.join(process.cwd(), "src/lib/impersonation.functions.ts"),
    "utf8",
  );
  const brandsPage = fs.readFileSync(
    path.join(process.cwd(), "src/routes/_authenticated/admin.brands.tsx"),
    "utf8",
  );

  it("allows starting a new session while replacing a stale read-only cookie", () => {
    expect(functions).toMatch(
      /startImpersonationSession[\s\S]*?middleware\(\[requireSupabaseAuthForImpersonationLifecycle\]\)/,
    );
  });

  it("requires the dedicated super-admin role without email bypasses", () => {
    expect(functions).toContain('rpc("is_super_admin")');
    expect(functions).not.toContain("isFixedSuperAdmin");
    expect(functions).not.toContain('rpc("is_admin")');
  });

  it("localizes launch failures instead of exposing technical middleware errors", () => {
    const launchHandler = brandsPage.slice(
      brandsPage.indexOf("const handleImpersonate"),
      brandsPage.indexOf("const [editing"),
    );
    expect(launchHandler).toContain("تعذر بدء محاكاة المتجر");
    expect(launchHandler).not.toContain("err.message ||");
  });

  it("clears a stale impersonation cookie before starting a replacement session", () => {
    const launchHandler = brandsPage.slice(
      brandsPage.indexOf("const handleImpersonate"),
      brandsPage.indexOf("const [editing"),
    );
    expect(launchHandler).toContain(
      'document.cookie = "boutq_impersonation_token=; path=/; max-age=0; samesite=lax"',
    );
    expect(launchHandler.indexOf("max-age=0")).toBeLessThan(
      launchHandler.indexOf("startImpersonationSession"),
    );
  });
});
