import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  aspectFromSize,
  coverCropFraction,
  heroMediaFit,
  isValidAspect,
} from "../src/lib/media-aspect";
import { imageWidths } from "../src/lib/media-delivery";

const WIDESCREEN = 16 / 9;
const CDN = "https://media.boutq.store/brands/x/hero";

// HeroV2 and the shell read the storefront context; the shell's children are
// stubbed (the test is about the header frame).
const storefront = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  lang: "en",
  brand: { slug: "pura", primary_color: null, hero_media: null },
  cart: [] as unknown[],
  clearCart: () => undefined,
}));
vi.mock("../src/lib/storefront-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useStorefront: () => storefront,
}));
vi.mock("@/lib/storefront-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useStorefront: () => storefront,
}));
vi.mock("@tanstack/react-router", () => ({ Outlet: () => null, useRouter: () => ({}) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));
const stubs = {
  analytics: { StorefrontAnalytics: () => null },
  header: { AnnouncementBar: () => null, StoreHeader: () => null },
  nav: { DesktopStoreNavigation: () => null },
  fab: { WhatsAppFab: () => null },
  footer: { StorefrontFooter: () => null },
};
vi.mock("../src/components/storefront-analytics", () => stubs.analytics);
vi.mock("@/components/storefront-analytics", () => stubs.analytics);
vi.mock("../src/components/storefront/StorefrontHeader", () => stubs.header);
vi.mock("@/components/storefront/StorefrontHeader", () => stubs.header);
vi.mock("../src/components/storefront/StorefrontNavigation", () => stubs.nav);
vi.mock("@/components/storefront/StorefrontNavigation", () => stubs.nav);
vi.mock("../src/features/storefront-shell/components/WhatsAppFab", () => stubs.fab);
vi.mock("@/features/storefront-shell/components/WhatsAppFab", () => stubs.fab);
vi.mock("../src/features/storefront-shell/components/StorefrontFooter", () => stubs.footer);
vi.mock("@/features/storefront-shell/components/StorefrontFooter", () => stubs.footer);
const { HeroV2 } = await import("../src/components/storefront/HeroV2");
const { StoreShell } = await import("../src/features/storefront-shell/components/StoreShell");

const videoSlide = (id: string, url: string, aspect: number) => ({
  id,
  type: "video" as const,
  title_en: "",
  title_ar: "",
  body_en: "",
  body_ar: "",
  media_url: url,
  media_url_en: url,
  media_aspect_en: aspect,
});

describe("hero smart fit", () => {
  it("records aspects from intrinsic sizes and rejects degenerate ones", () => {
    expect(aspectFromSize(1280, 720)).toBeCloseTo(WIDESCREEN, 3);
    expect(aspectFromSize(1080, 1920)).toBeCloseTo(0.5625, 4);
    expect(aspectFromSize(0, 720)).toBeNull();
    expect(isValidAspect(Number.NaN)).toBe(false);
    expect(isValidAspect(undefined)).toBe(false);
  });

  it("measures how much cover would crop", () => {
    // 16:9 video in a 4:3 phone frame loses a quarter of its width.
    expect(coverCropFraction(WIDESCREEN, 4 / 3)).toBeCloseTo(0.25, 3);
    expect(coverCropFraction(WIDESCREEN, WIDESCREEN)).toBe(0);
  });

  it("fills when the frame matches the media and letterboxes when it does not", () => {
    expect(heroMediaFit(WIDESCREEN, WIDESCREEN)).toBe("cover");
    // Near-identical after rounding the frame to device pixels.
    expect(heroMediaFit(WIDESCREEN, 390 / 220)).toBe("cover");
    // Desktop frame clamped to 1440x680 (≈2.12:1) would cut 16% of a 16:9 video.
    expect(heroMediaFit(WIDESCREEN, 1440 / 680)).toBe("contain");
    // Vertical reel in a landscape frame.
    expect(heroMediaFit(9 / 16, WIDESCREEN)).toBe("contain");
  });

  it("keeps the legacy behaviour while an aspect is still unknown", () => {
    expect(heroMediaFit(null, WIDESCREEN)).toBe("cover");
    expect(heroMediaFit(WIDESCREEN, null)).toBe("cover");
  });

  it("serves full-HD hero sources for full-bleed desktops", () => {
    expect(Math.max(...imageWidths("hero"))).toBeGreaterThanOrEqual(1920);
  });

  it("HeroV2 sizes the frame to the media and never double-decodes video for the ambient fill", () => {
    // Smart Fit is the default: two video slides of different shapes.
    storefront.settings = {};
    const { container } = render(
      createElement(HeroV2, {
        slides: [
          videoSlide("s1", `${CDN}/wide.mp4`, WIDESCREEN),
          videoSlide("s2", `${CDN}/tall.mp4`, 9 / 16),
        ],
      }),
    );
    const section = container.querySelector("section");
    // Full bleed tucks under the header on a dark backing (no light seam).
    expect(section?.className).toContain("-mt-px bg-neutral-950");
    // The frame takes the media's shape from CSS variables.
    expect(container.innerHTML).toContain("aspect-[var(--hero-ar-m)] sm:aspect-[var(--hero-ar)]");
    // One video per slide: the letterboxed slide's ambient fill (aria-hidden)
    // is a still or a gradient, never a second video decode.
    expect(container.querySelectorAll("video")).toHaveLength(2);
    const ambientLayers = container.querySelectorAll('article > div[aria-hidden="true"]');
    expect(ambientLayers.length).toBeGreaterThan(0);
    for (const layer of ambientLayers) expect(layer.querySelector("video")).toBeNull();
  });

  it("HeroV2 uses the merchant's fixed frame when Fill is chosen", () => {
    storefront.settings = { hero_video_fit: "cover", hero_aspect_mobile: "story_9_16" };
    const { container } = render(
      createElement(HeroV2, { slides: [videoSlide("s1", `${CDN}/wide.mp4`, WIDESCREEN)] }),
    );
    expect(container.innerHTML).toContain("aspect-[9/16] min-h-[520px]");
    expect(container.innerHTML).not.toContain("aspect-[var(--hero-ar-m)]");
    // Fill crops instead of letterboxing, so there is no ambient layer.
    expect(container.querySelectorAll('article > div[aria-hidden="true"]')).toHaveLength(0);
  });

  it("the storefront header draws its hairline without adding layout height", async () => {
    const { defaultStorefrontTypography } = await import("../src/lib/typography");
    storefront.settings = { storefront_typography: defaultStorefrontTypography() };
    const { container } = render(createElement(StoreShell));
    const header = container.querySelector<HTMLElement>(".sticky.top-0");
    expect(header?.style.boxShadow).toBe("inset 0 -1px 0 rgba(0, 0, 0, 0.08)");
    expect(header?.style.borderBottom).toBe("");
  });
});
