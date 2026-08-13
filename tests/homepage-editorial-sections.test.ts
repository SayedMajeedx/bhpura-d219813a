import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("homepage editorial sections", () => {
  it("stores independent per-section display and background settings", () => {
    const migration = read(
      "supabase/migrations/20260813210000_add_homepage_editorial_sections.sql",
    );
    for (const key of ["best", "sale", "trending"]) {
      expect(migration).toContain(`"${key}"`);
    }
    expect(migration).toContain("homepage_editorial_sections jsonb");
    expect(migration).toContain("banner_image_url");
    expect(migration).toContain("background_color");
    expect(migration).toContain("background_image_url");
  });

  it("renders editorial surfaces full width with bounded product content", () => {
    const home = read("src/routes/$slug.index.tsx");
    expect(home).toContain("settings.homepage_editorial_sections[kind]");
    expect(home).toContain('<section className="w-full overflow-hidden"');
    expect(home).toContain('className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14"');
    expect(home).not.toContain('className="w-full overflow-hidden border');
  });

  it("joins the promo cards to the first visible editorial background with balanced spacing", () => {
    const home = read("src/routes/$slug.index.tsx");
    expect(home).toContain("const leadingEditorialKind");
    expect(home).toContain("style={{ backgroundColor: promoAreaBackground }}");
    expect(home).toContain('className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8"');
    expect(home).toContain('className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4"');
    expect(home).not.toContain(
      'className="mb-6 grid grid-cols-1 gap-3 sm:mb-8 sm:grid-cols-2 sm:gap-4"',
    );
  });

  it("keeps the hero, navigation, footer, and product cards outside the editorial wrapper", () => {
    const home = read("src/routes/$slug.index.tsx");
    const editorialStart = home.indexOf("function MerchandisingSection");
    const heroStart = home.indexOf("function HeroBanner");
    expect(heroStart).toBeGreaterThan(editorialStart);
    expect(read("src/components/storefront/product-card.tsx")).not.toContain(
      "homepage_editorial_sections",
    );
    expect(read("src/routes/$slug.route.tsx")).not.toContain("luxury-parallax-container");
  });
});
