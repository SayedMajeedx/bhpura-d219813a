import { describe, expect, it } from "vitest";
import { categoryBannerInk, categoryBannerTextColor } from "../src/lib/banner-size";

describe("a category banner's text colour", () => {
  it("reads only a #rrggbb the store chose", () => {
    expect(categoryBannerTextColor({ category_banner_text_color: " #ffffff " })).toBe("#ffffff");
    expect(categoryBannerTextColor({ category_banner_text_color: "white" })).toBeNull();
    expect(categoryBannerTextColor({ story_points: [] })).toBeNull();
    expect(categoryBannerTextColor(null)).toBeNull();
  });

  it("takes the store's own colour first, even over a picture", () => {
    expect(
      categoryBannerInk({
        own: "#ffd700",
        hasPicture: true,
        headingColor: "#3f121a",
        backgroundColor: "#4a2c2c",
      }),
    ).toBe("#ffd700");
  });

  it("is white over a picture", () => {
    expect(
      categoryBannerInk({
        own: null,
        hasPicture: true,
        headingColor: "#3f121a",
        backgroundColor: "#ffffff",
      }),
    ).toBe("#ffffff");
  });

  it("does not put a dark heading colour on a dark band", () => {
    expect(
      categoryBannerInk({
        own: null,
        hasPicture: false,
        headingColor: "#3f121a",
        backgroundColor: "#4a2c2c",
      }),
    ).toBe("#ffffff");
  });

  it("keeps the heading colour when it reads on the band", () => {
    expect(
      categoryBannerInk({
        own: null,
        hasPicture: false,
        headingColor: "#3f121a",
        backgroundColor: "#ffffff",
      }),
    ).toBe("#3f121a");
  });

  it("falls back to the heading colour when the band's colour is not known", () => {
    expect(
      categoryBannerInk({
        own: null,
        hasPicture: false,
        headingColor: "#3f121a",
        backgroundColor: null,
      }),
    ).toBe("#3f121a");
  });
});
