import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
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
const { ImageZoom } = await import("../src/components/storefront/ImageZoom");
const { ProductGallery } = await import("../src/features/product-page/components/ProductGallery");
const { galleryRatioClass } = await import("../src/features/product-page/lib/product-media");
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

  it("ImageZoom uses the product image preset in a bounded container to prevent mobile blowout", () => {
    const { container } = render(
      createElement(ImageZoom, { src: "https://media.boutq.store/p1.jpg", alt: "Abaya" }),
    );
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.className).toContain("max-w-full");
    const srcset = container.querySelector("img")?.getAttribute("srcset") ?? "";
    // Product widths (up to 800w), not the hero's (up to 1920w).
    expect(srcset).toContain(" 800w");
    expect(srcset).not.toContain(" 1920w");
  });

  it("PDP gallery follows the ratio setting, fills its frame and has logical RTL arrows", () => {
    expect(galleryRatioClass(undefined)).toBe("aspect-[3/4]");
    expect(galleryRatioClass("1:1")).toBe("aspect-square");
    expect(galleryRatioClass("4:5")).toBe("aspect-[4/5]");

    const setMediaIdx = vi.fn();
    const { container } = render(
      createElement(ProductGallery, {
        displayName: "Abaya",
        galleryRatioClass: galleryRatioClass("4:5"),
        galleryTouchStartX: { current: null },
        media: [
          { type: "image", url: "https://media.boutq.store/a.jpg" },
          { type: "image", url: "https://media.boutq.store/b.jpg" },
        ],
        mediaIdx: 0,
        primary: "#000",
        product: { id: "p1" } as never,
        setMediaIdx,
        settings: { storefront_design_version: 2 } as never,
        t: (_ar: string, en: string) => en,
      }),
    );
    expect(container.querySelector('[class~="aspect-[4/5]"]')).not.toBeNull();
    // Storefront 2.0 zooms the image, filling the gallery frame (no aspect-auto blowout).
    expect(container.querySelector(".cursor-zoom-in")?.className).toContain("w-full h-full");

    const previous = screen.getByRole("button", { name: "Previous media" });
    const next = screen.getByRole("button", { name: "Next media" });
    expect(previous.className).toContain("start-2");
    expect(next.className).toContain("end-2");
    // Plain arrows (no circles) that flip in RTL.
    expect(previous.className).not.toContain("rounded-full");
    expect(previous.querySelector("svg")?.getAttribute("class")).toContain("rtl:rotate-180");

    fireEvent.click(next);
    const advance = setMediaIdx.mock.calls[0][0] as (i: number) => number;
    expect(advance(1)).toBe(0);
  });
});
