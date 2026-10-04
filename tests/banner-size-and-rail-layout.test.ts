import { describe, expect, it } from "vitest";
import {
  BANNER_SIZES,
  CATEGORY_BANNER,
  DEFAULT_BANNER_SIZE,
  SECTION_BANNER,
  resolveBannerSize,
} from "../src/lib/banner-size";
import { CENTERED_RAIL_MAX, RAIL_CARD, RAIL_CONTAINER, railLayout } from "../src/lib/rail-layout";

/** The tallest the band gets, in rem, from its clamp(min, preferred, max). */
const tallest = (height: string) => {
  const max = /clamp\([^,]+,[^,]+,([\d.]+)rem\)/.exec(height);
  return max ? Number(max[1]) : NaN;
};
const titleMax = (title: string) => {
  const max = /clamp\([^,]+,[^,]+,([\d.]+)rem\)/.exec(title);
  return max ? Number(max[1]) : NaN;
};

describe("banner sizes", () => {
  it("are compact, medium and large, and compact is the default", () => {
    expect([...BANNER_SIZES]).toEqual(["compact", "medium", "large"]);
    expect(DEFAULT_BANNER_SIZE).toBe("compact");
  });

  it("read a stored value, and anything else as the default", () => {
    expect(resolveBannerSize("large")).toBe("large");
    expect(resolveBannerSize("medium")).toBe("medium");
    for (const bad of [null, undefined, "", "huge", 3, {}]) {
      expect(resolveBannerSize(bad)).toBe("compact");
    }
  });

  it("get taller from compact to large, for a section and for a category", () => {
    for (const table of [SECTION_BANNER, CATEGORY_BANNER]) {
      const [c, m, l] = BANNER_SIZES.map((size) => tallest(table[size].height));
      expect(c).toBeLessThan(m);
      expect(m).toBeLessThan(l);
    }
  });

  it("keep the large size exactly as the banners were before the setting", () => {
    expect(SECTION_BANNER.large).toMatchObject({
      height: "min-h-[clamp(14rem,30vw,24rem)]",
      title: "text-[clamp(2rem,5vw,4rem)]",
      padding: "py-10 sm:py-14",
    });
    expect(CATEGORY_BANNER.large).toMatchObject({
      height: "min-h-[clamp(16rem,32vw,24rem)]",
      title: "text-3xl sm:text-5xl",
      padding: "py-12 sm:py-16",
    });
  });

  it("keep a compact band under a third of a 768px laptop screen, a medium one under half", () => {
    // 1rem = 16px; the tallest each band gets.
    for (const table of [SECTION_BANNER, CATEGORY_BANNER]) {
      expect(tallest(table.compact.height) * 16).toBeLessThanOrEqual(768 / 3);
      expect(tallest(table.medium.height) * 16).toBeLessThanOrEqual(768 / 2);
    }
  });

  it("scale the section title down with the band", () => {
    expect(titleMax(SECTION_BANNER.compact.title)).toBeLessThan(
      titleMax(SECTION_BANNER.medium.title),
    );
    expect(titleMax(SECTION_BANNER.medium.title)).toBeLessThan(
      titleMax(SECTION_BANNER.large.title),
    );
  });
});

describe("how a home section lays out its products", () => {
  it("centres up to three products, and uses the grid from four", () => {
    expect(CENTERED_RAIL_MAX).toBe(3);
    expect([0, 1, 2, 3, 4, 5, 12].map(railLayout)).toEqual([
      "grid",
      "centered",
      "centered",
      "centered",
      "grid",
      "grid",
      "grid",
    ]);
  });

  it("gives a centred card the width a grid column would have, at 3 and at 4 columns", () => {
    expect(RAIL_CARD.centered).toContain("md:w-[calc((100%-3rem)/3)]");
    expect(RAIL_CARD.centered).toContain("lg:w-[calc((100%-4.5rem)/4)]");
    expect(RAIL_CONTAINER.centered).toContain("md:justify-center");
    expect(RAIL_CONTAINER.grid).toContain("lg:grid-cols-4");
    expect(RAIL_CONTAINER.grid).not.toContain("justify-center");
  });
});
