import React from "react";
import { readFileSync } from "node:fs";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SecondaryBannerParallax } from "../src/components/storefront/secondary-banner-parallax";
import { publicSettingsFromPageData } from "../src/features/storefront-shell/lib/public-settings";

// Where the parallax may be used, and its CSS fallback, are checked in
// tests/storefront-performance-guardrails.test.ts.

const banner = (enabled: boolean) => (
  <SecondaryBannerParallax enabled={enabled} background={<img alt="" src="/banner.jpg" />}>
    <p>Eid edit</p>
  </SecondaryBannerParallax>
);

/** An IntersectionObserver whose callback the test can call. */
function observeIntersections() {
  const observers: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
  const RealObserver = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = class {
    constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
      observers.push(callback);
    }
    observe() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
  return {
    observers,
    restore: () => (globalThis.IntersectionObserver = RealObserver),
  };
}

describe("secondary banner parallax guardrails", () => {
  it("defaults the per-store feature off and exposes it through public settings", () => {
    const brand = { id: "b1", slug: "pura", name_en: "Pura" } as never;
    const load = (settings: Record<string, unknown>) =>
      publicSettingsFromPageData(brand, { brand, settings } as never);
    expect(load({}).secondary_banner_parallax_enabled).toBe(false);
    expect(
      load({ secondary_banner_parallax_enabled: true }).secondary_banner_parallax_enabled,
    ).toBe(true);

    const migration = readFileSync(
      "supabase/migrations/20260813173000_add_secondary_banner_backgrounds.sql",
      "utf8",
    );
    expect(migration).toContain("bs.secondary_banner_parallax_enabled");
    expect(migration).toContain("bs.trending_banner_background_url");
    expect(migration).toContain("bs.category_banner_background_url");
  });

  it("renders a static banner when the store has not enabled it", () => {
    const { container } = render(banner(false));
    expect(container.querySelector("[data-parallax-driver]")).toBeNull();
    expect(container).toHaveTextContent("Eid edit");
  });

  it("stays still for visitors who prefer reduced motion", () => {
    // Swapped by hand: the setup file's matchMedia is itself a mock.
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const io = observeIntersections();
    try {
      const { container } = render(banner(true));
      expect(io.observers).toHaveLength(0);
      expect(container.querySelector("[data-parallax-active]")).toBeNull();
    } finally {
      io.restore();
      window.matchMedia = originalMatchMedia;
    }
  });

  it("drives the banner from one throttled scroll controller with safe coverage", () => {
    const io = observeIntersections();
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const listen = vi.spyOn(window, "addEventListener");
    try {
      const { container, unmount } = render(banner(true));
      const root = container.querySelector<HTMLElement>("[data-parallax-driver='raf']")!;
      const background = root.querySelector<HTMLElement>(".secondary-banner-parallax__background")!;
      const foreground = root.querySelector<HTMLElement>(".secondary-banner-parallax__foreground")!;

      // Nothing moves until the banner nears the viewport.
      expect(listen.mock.calls.some(([type]) => type === "scroll")).toBe(false);
      act(() => io.observers[0]([{ isIntersecting: true }]));
      expect(root.dataset.parallaxActive).toBe("true");
      // The CSS scroll-timeline animation is switched off in favour of the controller.
      expect(background.style.animation).toBe("none");
      // Overscan covers the desktop offset (84px) plus a 32px guard.
      expect(root.style.getPropertyValue("--secondary-banner-parallax-overscan")).toBe("116px");
      expect(listen.mock.calls.filter(([type]) => type === "scroll")).toHaveLength(1);

      act(() => frames.shift()?.(0));
      expect(background.style.transform).toMatch(/^translate3d\(0, .+px, 0\) scale\(1\.08\)$/);
      expect(foreground.style.transform).toBe("none");

      unmount();
      expect(root.style.getPropertyValue("--secondary-banner-parallax-overscan")).toBe("");
    } finally {
      io.restore();
      raf.mockRestore();
      listen.mockRestore();
    }
  });
});
