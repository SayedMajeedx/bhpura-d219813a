import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("secondary banner parallax guardrails", () => {
  it("defaults the per-store feature off and exposes it through public settings", () => {
    const route = read("src/routes/$slug.route.tsx");
    const migration = read(
      "supabase/migrations/20260813173000_add_secondary_banner_backgrounds.sql",
    );
    expect(route).toContain("secondary_banner_parallax_enabled ?? false");
    expect(migration).toContain("bs.secondary_banner_parallax_enabled");
    expect(migration).toContain("bs.trending_banner_background_url");
    expect(migration).toContain("bs.category_banner_background_url");
  });

  it("is scoped to trending and category banners, not hero or product components", () => {
    const home = read("src/routes/$slug.index.tsx");
    const category = read("src/routes/$slug.$category.tsx");
    const hero = home.slice(home.indexOf("function HeroBanner"));
    expect(home).toContain('kind === "trending"');
    expect(category).toContain("<SecondaryBannerParallax");
    expect(home).toContain("settings.trending_banner_background_url");
    expect(category).toContain("settings.category_banner_background_url");
    expect(hero).not.toContain("<SecondaryBannerParallax");
    expect(read("src/components/storefront/product-card.tsx")).not.toContain(
      "SecondaryBannerParallax",
    );
    expect(read("src/components/storefront/product-grid.tsx")).not.toContain(
      "SecondaryBannerParallax",
    );
  });

  it("uses a contained, throttled transform-only implementation", () => {
    const component = read("src/components/storefront/secondary-banner-parallax.tsx");
    const styles = read("src/styles.css");
    expect(styles).toContain(".luxury-parallax-container");
    expect(styles).toContain("overflow: hidden !important");
    expect(styles).toContain("isolation: isolate");
    expect(styles).toContain("will-change: transform");
    expect(styles).toContain("prefers-reduced-motion: reduce");
    expect(component).toContain("IntersectionObserver");
    expect(component).toContain("requestAnimationFrame(render)");
    expect(component).toContain('addEventListener("scroll", schedule');
    expect(component).toContain("mobile ? 0.06 : 0.15");
    expect(component).toContain("translate3d");
    expect(component).not.toContain("background-attachment");
  });
});
