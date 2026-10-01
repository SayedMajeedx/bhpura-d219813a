import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { brandStoryDefaults } from "../src/lib/brand-templates/brand-story";
import { STORE_VERTICALS } from "../src/lib/store-profile";

// The storefront's "Our story" section knew only food and perfume; every other
// store (services, beauty, jewelry, gifts…) got the fashion copy, so a services
// store promised "exclusive collections" and "refined design".

let storeVertical = "services";
const storefront = {
  useStorefront: () => ({
    brand: { slug: "bloom", name_ar: "بلوم", name_en: "Bloom", hero_media: null, logo_url: null },
    settings: { store_vertical: storeVertical, motion_enabled: false },
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
    for (const value of services.values) expect(screen.getByText(value.ar)).toBeTruthy();
    expect(screen.queryByText("تشكيلات حصرية مميزة")).toBeNull();
    expect(screen.queryByText(/التصميم الراقي/)).toBeNull();
  });
});
