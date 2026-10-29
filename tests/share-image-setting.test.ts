import { describe, expect, it } from "vitest";
import { shareImageSetting, storeShareImage } from "../src/lib/seo/share-image";

const brand = {
  logo_url: null,
  hero_media: {
    slides: [{ type: "video", media_poster_url: "https://media.example/poster.webp" }],
  },
};

describe("the picture a store's shared link shows", () => {
  it("reads only an https address the store chose", () => {
    expect(shareImageSetting({ share_image_url: " https://media.example/a.webp " })).toBe(
      "https://media.example/a.webp",
    );
    expect(shareImageSetting({ share_image_url: "javascript:alert(1)" })).toBeNull();
    expect(shareImageSetting({ story_points: [] })).toBeNull();
    expect(shareImageSetting(null)).toBeNull();
  });

  it("puts the store's own picture before the hero video's first frame", () => {
    const own = "https://media.example/share.webp";
    expect(
      storeShareImage({
        brand,
        settings: { homepage_editorial_sections: { share_image_url: own } },
      }),
    ).toBe(own);
    expect(storeShareImage({ brand, settings: { share_image_url: own } })).toBe(own);
  });

  it("keeps the first hero picture when the store chose none", () => {
    expect(storeShareImage({ brand, settings: {} })).toBe("https://media.example/poster.webp");
  });
});
