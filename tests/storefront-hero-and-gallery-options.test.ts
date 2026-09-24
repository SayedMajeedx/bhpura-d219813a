import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { SETTINGS_REGISTRY } from "../src/features/settings/registry";

// The product page is split across its route and src/features/product-page (Phase 5).
const productPageSource = () =>
  [
    "src/routes/$slug.product.$id.tsx",
    ...["components", "lib"].flatMap((dir) =>
      fs
        .readdirSync(`src/features/product-page/${dir}`)
        .sort()
        .map((file) => `src/features/product-page/${dir}/${file}`),
    ),
  ]
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");

describe("Storefront Hero & PDP Gallery Options Suite", () => {
  it("registers all 6 hero and gallery settings in SETTINGS_REGISTRY with correct metadata", () => {
    const keys = [
      "hero_layout",
      "hero_aspect_mobile",
      "hero_height_desktop",
      "hero_show_arrows",
      "hero_video_fit",
      "pdp_gallery_aspect_ratio",
    ];

    for (const key of keys) {
      const entry = SETTINGS_REGISTRY.find((s) => s.key === key);
      expect(entry, `Setting ${key} should exist in SETTINGS_REGISTRY`).toBeDefined();
      expect(entry?.table).toBe("business_settings");
      expect(entry?.owner).toBe("settings");
      expect(entry?.label.ar).toBeTruthy();
      expect(entry?.label.en).toBeTruthy();
    }

    const heroLayout = SETTINGS_REGISTRY.find((s) => s.key === "hero_layout");
    expect(heroLayout?.level).toBe("basic");
    expect(heroLayout?.tab).toBe("storefront");
    expect(heroLayout?.group).toBe("home_hero");

    const heroAspectMobile = SETTINGS_REGISTRY.find((s) => s.key === "hero_aspect_mobile");
    expect(heroAspectMobile?.level).toBe("basic");
    expect(heroAspectMobile?.tab).toBe("storefront");
    expect(heroAspectMobile?.group).toBe("home_hero");

    const heroVideoFit = SETTINGS_REGISTRY.find((s) => s.key === "hero_video_fit");
    expect(heroVideoFit?.level).toBe("basic");
    expect(heroVideoFit?.tab).toBe("storefront");
    expect(heroVideoFit?.group).toBe("home_hero");

    const heroHeightDesktop = SETTINGS_REGISTRY.find((s) => s.key === "hero_height_desktop");
    expect(heroHeightDesktop?.level).toBe("advanced");
    expect(heroHeightDesktop?.tab).toBe("storefront");
    expect(heroHeightDesktop?.group).toBe("home_hero");

    const heroShowArrows = SETTINGS_REGISTRY.find((s) => s.key === "hero_show_arrows");
    expect(heroShowArrows?.level).toBe("advanced");
    expect(heroShowArrows?.tab).toBe("storefront");
    expect(heroShowArrows?.group).toBe("home_hero");

    const pdpAspect = SETTINGS_REGISTRY.find((s) => s.key === "pdp_gallery_aspect_ratio");
    expect(pdpAspect?.level).toBe("advanced");
    expect(pdpAspect?.tab).toBe("storefront");
    expect(pdpAspect?.group).toBe("design_v2");
  });

  it("strictly honors Owner Decision #7: basic settings count <= 45", () => {
    const basicSettings = SETTINGS_REGISTRY.filter(
      (s) => s.owner === "settings" && s.level === "basic",
    );
    expect(basicSettings.length).toBeLessThanOrEqual(45);
  });

  it("HeroV2 component contains full-bleed, mobile aspect ratios, ambient cinema glow, and pure arrows", () => {
    const heroCode = fs.readFileSync(
      path.resolve(__dirname, "../src/components/storefront/HeroV2.tsx"),
      "utf-8",
    );

    // Full-bleed & contained layout support
    expect(heroCode).toContain('settings.hero_layout ?? "full_bleed"');
    expect(heroCode).toContain("isFullBleed");

    // Mobile aspect ratios (reels/video portrait support)
    expect(heroCode).toContain("hero_aspect_mobile");
    expect(heroCode).toContain("aspect-[4/5]");
    expect(heroCode).toContain("aspect-[9/16]");
    expect(heroCode).toContain("aspect-square");

    // Clean single-layer video fit support
    expect(heroCode).toContain("hero_video_fit");
    expect(heroCode).toContain("object-cover");

    // Desktop height modes & adaptive clamp typography
    expect(heroCode).toContain("hero_height_desktop");
    expect(heroCode).toContain("sm:h-[420px]");
    expect(heroCode).toContain("sm:h-[520px]");
    expect(heroCode).toContain("sm:h-[620px]");

    // Pure chevron navigation arrows without circles
    expect(heroCode).toContain("ChevronLeft");
    expect(heroCode).toContain("ChevronRight");
    expect(heroCode).toContain("hero_show_arrows");
    expect(heroCode).not.toContain("rounded-full bg-black/35");
  });

  it("ImageZoom uses preset product and bounded container to prevent mobile blowout", () => {
    const zoomCode = fs.readFileSync(
      path.resolve(__dirname, "../src/components/storefront/ImageZoom.tsx"),
      "utf-8",
    );

    expect(zoomCode).toContain('preset="product"');
    expect(zoomCode).not.toContain('preset="hero"');
    expect(zoomCode).toContain("max-w-full");
  });

  it("PDP route enforces gallery aspect ratio, RTL logical arrow positioning, and overflow containment", () => {
    const pdpCode = productPageSource();

    // Gallery aspect ratio from settings
    expect(pdpCode).toContain("pdp_gallery_aspect_ratio");
    expect(pdpCode).toContain("galleryRatioClass");

    // No aspect-auto blowout in ImageZoom
    expect(pdpCode).not.toContain('aspectRatio="aspect-auto h-full"');
    expect(pdpCode).toContain('aspectRatio="w-full h-full"');

    // Logical RTL navigation buttons (pure floating arrows without circles)
    expect(pdpCode).toContain("start-2");
    expect(pdpCode).toContain("end-2");
    expect(pdpCode).toContain("rtl:rotate-180");
    expect(pdpCode).not.toContain("rounded-full shadow-md border border-border-subtle");

    // Root container overflow containment
    expect(pdpCode).toContain("overflow-x-hidden");
  });
});
