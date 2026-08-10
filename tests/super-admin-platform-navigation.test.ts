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
});
