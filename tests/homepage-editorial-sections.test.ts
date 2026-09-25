import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// The storefront shell is split across its route and src/features/storefront-shell (Phase 5).
const shellSource = () =>
  [
    "src/routes/$slug.route.tsx",
    ...["components", "lib"].flatMap((dir) =>
      readdirSync(`src/features/storefront-shell/${dir}`)
        .sort()
        .map((file) => `src/features/storefront-shell/${dir}/${file}`),
    ),
  ]
    .map((file) => read(file))
    .join("\n");

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
    const home = homeSource();
    expect(home).toContain("settings.homepage_editorial_sections[kind]");
    expect(home).toContain('<section className="w-full overflow-hidden"');
    expect(home).toContain('className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14"');
    expect(home).not.toContain('className="w-full overflow-hidden border');
  });

  it("joins the promo cards to the first visible editorial background with balanced spacing", () => {
    const home = homeSource();
    expect(home).toContain("const leadingEditorialKind");
    expect(home).toContain("style={{ backgroundColor: promoAreaBackground }}");
    expect(home).toContain('className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8"');
    expect(home).toContain('className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4"');
    expect(home).not.toContain(
      'className="mb-6 grid grid-cols-1 gap-3 sm:mb-8 sm:grid-cols-2 sm:gap-4"',
    );
  });

  it("keeps the hero, navigation, footer, and product cards outside the editorial wrapper", () => {
    const home = homeSource();
    const hero = [
      "src/features/storefront-home/components/HeroBanner.tsx",
      "src/features/storefront-home/components/HeroContentCarousel.tsx",
    ]
      .map((file) => read(file))
      .join("\n");
    expect(home).toContain("function MerchandisingSection");
    expect(hero).not.toContain("homepage_editorial_sections");
    expect(read("src/components/storefront/product-card.tsx")).not.toContain(
      "homepage_editorial_sections",
    );
    expect(shellSource()).not.toContain("luxury-parallax-container");
  });
});
