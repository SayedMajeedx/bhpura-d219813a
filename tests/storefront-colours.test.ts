import { describe, expect, it } from "vitest";
import { manifestIcon } from "../src/lib/storefront-manifest";
import { SALE_BADGE_CLASS } from "../src/lib/storefront-badges";

// The colour audit of Pura's live storefront (2026-10-29): its sale badges were the error red while
// the store had chosen maroon, and its home-screen icon was the cream wordmark, cropped.

describe("a sale badge", () => {
  it("wears the colour the store chose, which the storefront writes for it", () => {
    expect(SALE_BADGE_CLASS).toContain("var(--badge-accent-bg");
    expect(SALE_BADGE_CLASS).toContain("text-white");
  });
});

describe("a store's home-screen icon", () => {
  const favicon = "https://media.boutq.store/brands/b/favicon/tile.svg";
  const logo = "https://media.boutq.store/brands/b/logo/wordmark.svg";

  it("is its favicon, a square made for small sizes, before its logo", () => {
    expect(manifestIcon({ favicon_url: favicon, logo_url: logo }, null).src).toBe(favicon);
    expect(manifestIcon({ favicon_url: " ", logo_url: logo }, null).src).toBe(logo);
    expect(manifestIcon(null, { logo_url: "/brand.png" })).toMatchObject({
      src: "https://boutq.store/brand.png",
      type: "image/png",
      sizes: "192x192 512x512",
    });
  });

  it("is never cropped as a maskable icon", () => {
    expect(manifestIcon({ favicon_url: favicon }, null)).toMatchObject({
      purpose: "any",
      type: "image/svg+xml",
      sizes: "any",
    });
  });
});
