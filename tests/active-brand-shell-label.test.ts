import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("active brand shell label", () => {
  const shell = fs.readFileSync(path.join(process.cwd(), "src/components/app-shell.tsx"), "utf8");

  it("resolves the displayed brand from the active route slug", () => {
    expect(shell).toContain('select("id, slug, name_en, name_ar, is_active")');
    expect(shell).toContain("brand.slug.toLowerCase() === activeSlug.toLowerCase()");
    expect(shell).toContain("profileBrandMatchesRoute");
    expect(shell).toMatch(/const brandLabel =[\s\S]*?activeBrand\?\.name_ar[\s\S]*?activeSlug/);
  });

  it("does not fall back to the profile brand when another route brand is open", () => {
    expect(shell).toContain(
      "routeBrand ?? (profileBrandMatchesRoute ? profile?.brand : undefined)",
    );
  });

  it("keeps the super-admin platform workspace tenant-free", () => {
    expect(shell).toContain("const isPlatformMode = isSuperAdmin && !urlSlug");
    expect(shell).toMatch(
      /urlSlug \?\?\s*\(isSuperAdmin \? null : \(?profile\?\.brand\?\.slug \?\? null\)?\)/,
    );
    expect(shell).toContain('lang === "ar" ? "إدارة منصة بوتيك" : "Boutq Platform"');
    expect(shell).toMatch(/const activeBrand = isPlatformMode\s*\? undefined/);
  });
});
