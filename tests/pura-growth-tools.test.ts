import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Pura growth tools", () => {
  it("keeps fit passports consent-based, versioned, and brand isolated", () => {
    const migration = read("supabase/migrations/20260903180000_pura_fit_passports.sql");
    expect(migration).toContain("consent_to_store boolean NOT NULL DEFAULT false");
    expect(migration).toContain("customer_fit_passport_history");
    expect(migration).toContain("public.can_access_brand(brand_id)");
    expect(migration).toContain("UNIQUE (brand_id, customer_id)");
  });

  it("offers production social formats and a PNG export", () => {
    const studio = read("src/routes/_authenticated/admin.b.$slug.content-studio.tsx");
    expect(studio).toContain("width: 1080, height: 1920");
    expect(studio).toContain("width: 1080, height: 1350");
    expect(studio).toContain("width: 1080, height: 1080");
    expect(studio).toContain(
      'link.download = `pura-${selected?.name || "creative"}-${format}.png`',
    );
    expect(studio).toContain('crossOrigin="anonymous"');
  });
});
