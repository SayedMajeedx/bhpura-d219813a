import { describe, it, expect } from "vitest";
import fs, { readdirSync } from "fs";
import path from "path";
import {
  aspectFromSize,
  coverCropFraction,
  heroMediaFit,
  isValidAspect,
} from "../src/lib/media-aspect";
import { imageWidths } from "../src/lib/media-delivery";

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
    .map((file) => fs.readFileSync(file, "utf-8"))
    .join("\n");

const WIDESCREEN = 16 / 9;

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
    const heroCode = fs.readFileSync(
      path.resolve(__dirname, "../src/components/storefront/HeroV2.tsx"),
      "utf-8",
    );
    expect(heroCode).toContain('settings.hero_video_fit ?? "contain_ambient"');
    expect(heroCode).toContain("aspect-[var(--hero-ar-m)] sm:aspect-[var(--hero-ar)]");
    expect(heroCode).toContain("heroMediaFit(");
    expect(heroCode).toContain("useMeasuredAspects(");
    expect(heroCode).toContain('sizes={isFullBleed ? "100vw"');
    // Only one <OptimizedVideo> per slide: the ambient layer is a blurred still.
    expect(heroCode.match(/<OptimizedVideo/g)?.length).toBe(1);
    // Dark backing tucked under the header hides sub-pixel seams.
    expect(heroCode).toContain('"-mt-px bg-neutral-950"');
  });

  it("the storefront header draws its hairline without adding layout height", () => {
    const routeCode = shellSource();
    expect(routeCode).toContain('boxShadow: "inset 0 -1px 0 rgba(0, 0, 0, 0.08)"');
    expect(routeCode).not.toContain('borderBottom: "1px solid rgba(0, 0, 0, 0.08)"');
  });
});
