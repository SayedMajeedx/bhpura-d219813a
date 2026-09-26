import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { SETTINGS_REGISTRY } from "../src/features/settings/registry";

// HeroV2 reads its settings from the storefront context.
const storefront = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  lang: "en",
  brand: { slug: "pura", primary_color: null, hero_media: null },
}));
vi.mock("../src/lib/storefront-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useStorefront: () => storefront,
}));
vi.mock("@/lib/storefront-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useStorefront: () => storefront,
}));
const { HeroV2 } = await import("../src/components/storefront/HeroV2");
const imageSlide = (id: string) => ({
  id,
  type: "image" as const,
  title_en: "",
  title_ar: "",
  body_en: "",
  body_ar: "",
  media_url: "https://media.boutq.store/brands/x/hero/a.jpg",
  media_url_en: "https://media.boutq.store/brands/x/hero/a.jpg",
});

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

  it("HeroV2 honours full-bleed or contained layout, phone ratios, desktop heights and arrows", () => {
    const renderHero = (settings: Record<string, unknown>, count = 2) => {
      storefront.settings = { hero_video_fit: "cover", ...settings };
      return render(
        createElement(HeroV2, {
          slides: Array.from({ length: count }, (_, i) => imageSlide(`s${i}`)),
        }),
      );
    };

    // Full bleed by default; contained is a rounded card inside the page width.
    const bleed = renderHero({});
    expect(bleed.container.querySelector("section")?.className).toContain("-mt-px");
    expect(bleed.container.innerHTML).not.toContain("max-w-7xl");
    bleed.unmount();
    const contained = renderHero({ hero_layout: "contained" });
    expect(contained.container.innerHTML).toContain("max-w-7xl");
    expect(contained.container.innerHTML).toContain("rounded-2xl");
    contained.unmount();

    // Phone ratios (portrait default, reels, square) and desktop heights.
    for (const [ratio, cls] of [
      [undefined, "aspect-[4/5]"],
      ["story_9_16", "aspect-[9/16]"],
      ["square_1_1", "aspect-square"],
    ] as const) {
      const view = renderHero({ hero_aspect_mobile: ratio });
      expect(view.container.innerHTML).toContain(cls);
      view.unmount();
    }
    for (const [height, cls] of [
      ["compact", "sm:h-[420px]"],
      [undefined, "sm:h-[520px]"],
      ["cinematic", "sm:h-[620px]"],
    ] as const) {
      const view = renderHero({ hero_height_desktop: height });
      expect(view.container.innerHTML).toContain(cls);
      view.unmount();
    }

    // Plain chevron arrows (no dark circles) for several slides, unless turned off.
    const withArrows = renderHero({});
    const arrows = withArrows.container.querySelectorAll(
      "button svg.lucide-chevron-left, button svg.lucide-chevron-right",
    );
    expect(arrows.length).toBeGreaterThanOrEqual(2);
    expect(withArrows.container.innerHTML).not.toContain("rounded-full bg-black/35");
    withArrows.unmount();
    const noArrows = renderHero({ hero_show_arrows: false });
    expect(
      noArrows.container.querySelectorAll(
        "button svg.lucide-chevron-left, button svg.lucide-chevron-right",
      ),
    ).toHaveLength(0);
    noArrows.unmount();
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
