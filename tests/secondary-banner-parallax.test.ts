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

describe("secondary banner parallax guardrails", () => {
  it("defaults the per-store feature off and exposes it through public settings", () => {
    const route = shellSource();
    const migration = read(
      "supabase/migrations/20260813173000_add_secondary_banner_backgrounds.sql",
    );
    expect(route).toContain("secondary_banner_parallax_enabled ?? false");
    expect(migration).toContain("bs.secondary_banner_parallax_enabled");
    expect(migration).toContain("bs.trending_banner_background_url");
    expect(migration).toContain("bs.category_banner_background_url");
  });

  it("is scoped to editorial and category banners, not hero or product components", () => {
    const home = homeSource();
    const category = read("src/routes/$slug.$category.tsx");
    const hero = [
      "src/features/storefront-home/components/HeroBanner.tsx",
      "src/features/storefront-home/components/HeroContentCarousel.tsx",
    ]
      .map((file) => read(file))
      .join("\n");
    expect(home).toContain("settings.homepage_editorial_sections[kind]");
    expect(category).toContain("<SecondaryBannerParallax");
    expect(home).toContain("editorial.banner_image_url");
    expect(category).toContain("settings.category_banner_background_url");
    expect(hero).not.toContain("<SecondaryBannerParallax");
    expect(read("src/components/storefront/product-card.tsx")).not.toContain(
      "SecondaryBannerParallax",
    );
    expect(read("src/components/storefront/product-grid.tsx")).not.toContain(
      "SecondaryBannerParallax",
    );
  });

  it("uses one throttled controller, safe coverage, and a reduced-motion kill switch", () => {
    const component = read("src/components/storefront/secondary-banner-parallax.tsx");
    const styles = read("src/styles.css");
    expect(styles).toContain("animation-timeline: view(block)");
    expect(styles).toContain("animation-duration: auto");
    expect(styles).toContain("animation-range-start: entry 0%");
    expect(styles).toContain("animation-range-end: exit 100%");
    expect(styles).toContain("translate3d(0, -3rem, 0)");
    expect(styles).toContain("prefers-reduced-motion: reduce");
    expect(component).toContain("IntersectionObserver");
    expect(component).toContain("requestAnimationFrame(renderActiveEntries)");
    expect(component).toContain('addEventListener("scroll", scheduleParallaxFrame');
    expect(component).toContain('background.style.animation = "none"');
    expect(component).toContain("DESKTOP_MAX_OFFSET_PX = 84");
    expect(component).toContain("MOBILE_MAX_OFFSET_PX = 42");
    expect(component).toContain("PARALLAX_SCALE = 1.08");
    expect(component).toContain("MOTION_SMOOTHING = 0.18");
    expect(component).toContain('entry.foreground.style.transform = "none"');
    expect(component).toContain("centerDistance / (viewportHeight * 0.58)");
    expect(component).toContain("MIN_COVERAGE_GUARD_PX = 32");
    expect(component).toContain("--secondary-banner-parallax-overscan");
    expect(component).not.toContain("inset-[-6rem]");
    expect(component).not.toContain("background-attachment");
  });
});
