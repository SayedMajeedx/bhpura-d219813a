import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  brandStoryDefaults,
  storyPoints as readStoryPoints,
} from "../src/lib/brand-templates/brand-story";
import { STORE_VERTICALS } from "../src/lib/store-profile";

// The storefront's "Our story" section knew only food and perfume; every other
// store (services, beauty, jewelry, gifts…) got the fashion copy, so a services
// store promised "exclusive collections" and "refined design".

let storeVertical = "services";
let storyPoints: Array<{ ar: string; en: string }> | undefined;
const storefront = {
  useStorefront: () => ({
    brand: { slug: "bloom", name_ar: "بلوم", name_en: "Bloom", hero_media: null, logo_url: null },
    settings: {
      store_vertical: storeVertical,
      motion_enabled: false,
      brand_story_points: storyPoints,
    },
    lang: "ar",
    t: (ar: string) => ar,
  }),
};
vi.mock("../src/lib/storefront-context", () => storefront);
vi.mock("@/lib/storefront-context", () => storefront);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

const { BrandStorySection } = await import("../src/components/storefront/BrandStorySection");

describe("the default brand story", () => {
  it("has its own words for every store vertical", () => {
    const seen = new Set<string>();
    for (const vertical of STORE_VERTICALS) {
      const story = brandStoryDefaults(vertical);
      for (const text of [story.subtitle, story.description, ...story.values]) {
        expect(text.ar.trim(), vertical).not.toBe("");
        expect(text.en.trim(), vertical).not.toBe("");
      }
      expect(seen.has(story.description.en), `${vertical} reuses another's story`).toBe(false);
      seen.add(story.description.en);
    }
  });

  it("falls back to the general story for an unknown vertical", () => {
    expect(brandStoryDefaults("spaceships")).toBe(brandStoryDefaults("general"));
    expect(brandStoryDefaults(undefined)).toBe(brandStoryDefaults("general"));
    expect(brandStoryDefaults(" Services ")).toBe(brandStoryDefaults("services"));
  });
});

describe("the story section on a services store", () => {
  it("speaks about services, not collections", () => {
    storeVertical = "services";
    render(<BrandStorySection />);
    const services = brandStoryDefaults("services");
    expect(screen.getByText(services.subtitle.ar)).toBeTruthy();
    expect(screen.getByText(services.description.ar)).toBeTruthy();
    expect(screen.queryByText("تشكيلات حصرية مميزة")).toBeNull();
    expect(screen.queryByText(/التصميم الراقي/)).toBeNull();
  });
});

describe("the story's points", () => {
  it("shows none the store did not write: the defaults are only suggestions", () => {
    // Pura and ZH showed "ضمان الجودة والأصالة", a promise neither store made.
    storeVertical = "abayas";
    storyPoints = undefined;
    render(<BrandStorySection />);
    for (const value of brandStoryDefaults("abayas").values) {
      expect(screen.queryByText(value.ar)).toBeNull();
    }
  });

  it("shows the store's own points, in the reader's language or else the other", () => {
    storyPoints = [
      { ar: "خياطة في البحرين", en: "Sewn in Bahrain" },
      { ar: "", en: "Free alterations" },
    ];
    render(<BrandStorySection />);
    expect(screen.getByText("خياطة في البحرين")).toBeTruthy();
    expect(screen.getByText("Free alterations")).toBeTruthy();
  });
});

describe("storyPoints", () => {
  it("keeps up to three points with some text, trimmed", () => {
    expect(
      readStoryPoints({
        best: {},
        story_points: [
          { ar: " أ ", en: "" },
          { ar: "", en: "" },
          { ar: "ب", en: "B" },
          { ar: "ج" },
          { en: "D" },
        ],
      }),
    ).toEqual([
      { ar: "أ", en: "" },
      { ar: "ب", en: "B" },
      { ar: "ج", en: "" },
    ]);
    expect(readStoryPoints(null)).toEqual([]);
    expect(readStoryPoints({ story_points: "x" })).toEqual([]);
  });
});
