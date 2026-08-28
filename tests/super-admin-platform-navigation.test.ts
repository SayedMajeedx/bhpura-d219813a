import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("super-admin platform navigation", () => {
  const shell = fs.readFileSync(path.join(process.cwd(), "src/components/app-shell.tsx"), "utf8");
  const switcher = fs.readFileSync(
    path.join(process.cwd(), "src/components/os/os-brand-switcher.tsx"),
    "utf8",
  );
  const brandsPage = fs.readFileSync(
    path.join(process.cwd(), "src/routes/_authenticated/admin.brands.tsx"),
    "utf8",
  );

  it("shows no tenant selector until a brand workspace is open", () => {
    expect(switcher).toMatch(/\{activeSlug && \(\s*<Select/);
  });

  it("retains exactly the three platform destinations", () => {
    expect(switcher).toContain('to="/admin/brands"');
    expect(switcher).toContain('to="/admin/super/requests"');
    expect(switcher).toContain('to="/admin/super/settings"');
  });

  it("keeps the platform sidebar expanded and tenant-free", () => {
    expect(shell).toContain("sidebarExpanded || isPlatformMode");
    expect(shell).toContain("collapsible={!isPlatformMode}");
  });

  it("uses a clean non-technical dashboard title", () => {
    expect(brandsPage).toContain('lang === "ar" ? "لوحة تحكم بوتيك" : "Boutq Dashboard"');
    expect(brandsPage).not.toContain("SaaS Dashboard");
  });

  it("routes superadmin directly to tenant management on /admin", () => {
    const adminIndex = fs.readFileSync(
      path.join(process.cwd(), "src/routes/_authenticated/admin.index.tsx"),
      "utf8",
    );
    // Superadmin check happens BEFORE any profile.brand_id redirect
    const superAdminCheckPos = adminIndex.indexOf("if (isSuperAdmin)");
    const brandIdCheckPos = adminIndex.indexOf("if (profile?.brand_id)");
    expect(superAdminCheckPos).toBeGreaterThan(0);
    expect(superAdminCheckPos).toBeLessThan(brandIdCheckPos);
    expect(adminIndex).toContain('throw redirect({ to: "/admin/brands" });');
  });

  it("enforces impersonation token unconditionally on tenant workspaces for superadmins", () => {
    const tenantRoute = fs.readFileSync(
      path.join(process.cwd(), "src/routes/_authenticated/admin.b.$slug.route.tsx"),
      "utf8",
    );
    expect(tenantRoute).toMatch(/if \(isSuperAdmin\) \{\s*const accessEnabled = brand\.support_access_enabled !== false;/);
    expect(tenantRoute).not.toContain("if (isSuperAdmin && !belongsToBrand)");
  });

  it("uses neutral phrasing for password reset subtitle in Arabic", () => {
    const i18n = fs.readFileSync(path.join(process.cwd(), "src/lib/i18n.tsx"), "utf8");
    expect(i18n).toContain('"auth.resetSubtitle": "اختر كلمة مرور قوية لم تستخدمها من قبل."');
    expect(i18n).not.toContain("لم تستخدميها");
  });

  it("handles PKCE and OTP tokens in reset-password route", () => {
    const resetRoute = fs.readFileSync(
      path.join(process.cwd(), "src/routes/reset-password.tsx"),
      "utf8",
    );
    expect(resetRoute).toContain("exchangeCodeForSession");
    expect(resetRoute).toContain("verifyOtp");
  });
});

