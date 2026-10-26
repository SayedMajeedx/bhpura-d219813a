import { describe, expect, it } from "vitest";
import { storeShareImage } from "../src/lib/seo/share-image";
import { storefrontHead } from "../src/features/storefront-shell/lib/storefront-head";
import { productHead } from "../src/features/product-page/lib/product-head";

// What a store's link shows when it is shared, and the store's name in a product's title
// (go-live review of Aurora, fix 4: every Aurora link showed Boutq's placeholder).

const CDN = "https://media.boutq.store/brands/aurora";
const PLACEHOLDER = "https://boutq.store/og-placeholder.png";

// Aurora on 2026-10-26: an SVG logo, a video hero with a poster, a brand story picture.
const aurora = {
  brand: {
    logo_url: null,
    hero_media: {
      background: null,
      slides: [
        { type: "text", media_url: `${CDN}/hero.mp4`, media_poster_url: `${CDN}/poster.webp` },
      ],
    },
  },
  settings: { logo_url: `${CDN}/logo.svg`, brand_story_image_url: `${CDN}/story.jpg` },
};

describe("the picture a store's shared link shows", () => {
  it("is the first hero slide's still, never Boutq's placeholder while the store has a picture", () => {
    expect(storeShareImage(aurora)).toBe(`${CDN}/poster.webp`);
  });

  it("falls back to a picture slide, the background, the brand story, then the logo", () => {
    expect(
      storeShareImage({
        brand: { hero_media: { slides: [{ type: "image", media_url: `${CDN}/slide.jpg` }] } },
      }),
    ).toBe(`${CDN}/slide.jpg`);
    // A video with no poster is not a still.
    expect(
      storeShareImage({
        brand: {
          hero_media: {
            background: { type: "image", url: `${CDN}/bg.jpg` },
            slides: [{ type: "video", media_url: `${CDN}/clip.mp4` }],
          },
        },
      }),
    ).toBe(`${CDN}/bg.jpg`);
    expect(storeShareImage({ ...aurora, brand: { logo_url: null } })).toBe(`${CDN}/story.jpg`);
    expect(storeShareImage({ brand: { logo_url: `${CDN}/logo.png` } })).toBe(`${CDN}/logo.png`);
  });

  it("is the placeholder only when the store has no picture a preview can draw (an SVG logo)", () => {
    expect(
      storeShareImage({
        brand: { logo_url: null },
        settings: aurora.settings && { logo_url: `${CDN}/logo.svg` },
      }),
    ).toBe(PLACEHOLDER);
  });

  it("is what the store's home and booking pages share", () => {
    const head = storefrontHead({
      brand: { slug: "aurora", name_en: "Aurora", name_ar: "اورورا", ...aurora.brand },
      settings: aurora.settings,
      initialLang: "ar",
    }) as { meta: Array<Record<string, string>> };
    expect(head.meta.find((m) => m.property === "og:image")?.content).toBe(`${CDN}/poster.webp`);
  });
});

describe("a product page's title", () => {
  const title = (lang: "ar" | "en") =>
    (
      productHead({
        loaderData: {
          product: { id: "p1", name_ar: "فوتوبوث", name_en: "Photobooth", product_variants: [] },
          brand: { name_en: "Aurora", name_ar: "اورورا" },
          initialLang: lang,
        },
        params: { slug: "aurora", id: "p1" },
      }) as { meta: Array<Record<string, string>> }
    ).meta.find((m) => m.title)?.title;

  it("names the store as it writes its name, in the page's language", () => {
    expect(title("ar")).toBe("فوتوبوث | اورورا");
    expect(title("en")).toBe("Photobooth | Aurora");
  });
});
