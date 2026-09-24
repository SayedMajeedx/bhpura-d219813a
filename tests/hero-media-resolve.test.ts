import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  HERO_FILL_DESKTOP_PX,
  HERO_FILL_MOBILE,
  HERO_SMART_FRAME,
  heroFocalPosition,
  heroFrameAspect,
  resolveHeroSlideMedia,
} from "../src/lib/hero-media";

const CDN = "https://media.boutq.store/brands/x/hero";
const WIDE = 16 / 9;

const videoSlide = {
  type: "video",
  media_url: `${CDN}/ar.mp4`,
  media_url_ar: `${CDN}/ar.mp4`,
  media_url_en: `${CDN}/en.mp4`,
  media_poster_url_ar: `${CDN}/ar.webp`,
  media_poster_url_en: `${CDN}/en.webp`,
  media_aspect_ar: WIDE,
  media_aspect_en: WIDE,
  media_url_mobile_ar: `${CDN}/ar-phone.mp4`,
  media_poster_url_mobile_ar: `${CDN}/ar-phone.webp`,
  media_aspect_mobile_ar: 9 / 16,
};

describe("resolveHeroSlideMedia", () => {
  it("picks each language's file, poster, aspect and phone cut", () => {
    const ar = resolveHeroSlideMedia(videoSlide, "ar");
    expect(ar.isVideo).toBe(true);
    expect(ar.main).toEqual({ url: `${CDN}/ar.mp4`, posterUrl: `${CDN}/ar.webp`, aspect: WIDE });
    expect(ar.mobile).toEqual({
      url: `${CDN}/ar-phone.mp4`,
      posterUrl: `${CDN}/ar-phone.webp`,
      aspect: 9 / 16,
    });

    const en = resolveHeroSlideMedia(videoSlide, "en");
    expect(en.main?.url).toBe(`${CDN}/en.mp4`);
    expect(en.main?.posterUrl).toBe(`${CDN}/en.webp`);
    // English has no phone cut; it must not borrow the Arabic one.
    expect(en.mobile).toBeNull();
  });

  it("falls back to the background, including its phone cut", () => {
    const text = { type: "text", media_url: "" };
    const resolved = resolveHeroSlideMedia(text, "ar", {
      type: "video",
      url: `${CDN}/bg.mp4`,
      posterUrl: `${CDN}/bg.webp`,
      aspect: WIDE,
      mobileUrl: `${CDN}/bg-phone.mp4`,
      mobilePosterUrl: `${CDN}/bg-phone.webp`,
      mobileAspect: 4 / 5,
    });
    expect(resolved.usesBackground).toBe(true);
    expect(resolved.isVideo).toBe(true);
    expect(resolved.main?.posterUrl).toBe(`${CDN}/bg.webp`);
    expect(resolved.mobile?.aspect).toBe(4 / 5);
  });

  it("does not show another video's poster on a slide that has its own video", () => {
    const own = { type: "video", media_url: `${CDN}/own.mp4` };
    const resolved = resolveHeroSlideMedia(own, "en", {
      type: "video",
      url: `${CDN}/bg.mp4`,
      posterUrl: `${CDN}/bg.webp`,
    });
    expect(resolved.main?.url).toBe(`${CDN}/own.mp4`);
    expect(resolved.main?.posterUrl).toBeNull();
  });

  it("uses an image as its own still and leaves legacy aspects unknown", () => {
    const image = { type: "image", media_url_en: `${CDN}/look.jpg` };
    const resolved = resolveHeroSlideMedia(image, "en");
    expect(resolved.isVideo).toBe(false);
    expect(resolved.main).toEqual({
      url: `${CDN}/look.jpg`,
      posterUrl: `${CDN}/look.jpg`,
      aspect: null,
    });
  });
});

describe("heroFrameAspect", () => {
  it("Smart Fit follows the lead media on a phone", () => {
    expect(
      heroFrameAspect({ device: "mobile", fitSetting: "contain_ambient", leadAspect: WIDE }),
    ).toBeCloseTo(WIDE, 3);
  });

  it("Smart Fit caps tall media and wide desktops", () => {
    // 9:16 on a 390×844 phone: capped at 78svh (658px).
    expect(
      heroFrameAspect({ device: "mobile", fitSetting: "contain_ambient", leadAspect: 9 / 16 }),
    ).toBeCloseTo(390 / (0.78 * 844), 3);
    // 16:9 on a 1440×900 laptop: capped at min(80svh, 680px) = 680px.
    expect(
      heroFrameAspect({ device: "desktop", fitSetting: "contain_ambient", leadAspect: WIDE }),
    ).toBeCloseTo(1440 / 680, 3);
  });

  it("Fill modes use the configured mobile ratio and desktop height", () => {
    expect(
      heroFrameAspect({
        device: "mobile",
        fitSetting: "cover",
        leadAspect: WIDE,
        mobileRatio: "landscape_4_3",
      }),
    ).toBeCloseTo(4 / 3, 3);
    expect(
      heroFrameAspect({
        device: "desktop",
        fitSetting: "top",
        leadAspect: WIDE,
        desktopHeight: "cinematic",
      }),
    ).toBeCloseTo(1440 / 620, 3);
  });

  it("falls back to the fill frame until the lead aspect is known", () => {
    expect(
      heroFrameAspect({ device: "mobile", fitSetting: "contain_ambient", leadAspect: null }),
    ).toBeCloseTo(4 / 5, 3);
  });
});

describe("heroFocalPosition", () => {
  it("defaults to the centre, or the top for the top-aligned mode", () => {
    expect(heroFocalPosition({})).toBe("50% 50%");
    expect(heroFocalPosition({}, "top")).toBe("50% 0%");
  });

  it("uses and clamps the merchant's focal point", () => {
    expect(heroFocalPosition({ focal_x: 80, focal_y: 20 }, "top")).toBe("80% 20%");
    expect(heroFocalPosition({ focal_x: 140, focal_y: -5 })).toBe("100% 0%");
  });
});

describe("HeroV2 classes mirror the frame model", () => {
  const heroCode = fs.readFileSync(
    path.resolve(__dirname, "../src/components/storefront/HeroV2.tsx"),
    "utf-8",
  );

  it("encodes the Smart Fit limits", () => {
    const m = HERO_SMART_FRAME.mobile;
    expect(heroCode).toContain(`min-h-[${m.minPx}px]`);
    expect(heroCode).toContain(`max-h-[min(${m.maxVh * 100}svh,${m.maxPx}px)]`);
    expect(heroCode).toContain(`sm:min-h-[${HERO_SMART_FRAME.desktop.minPx}px]`);
    for (const { vh, px } of Object.values(HERO_SMART_FRAME.desktop.max)) {
      expect(heroCode).toContain(`sm:max-h-[min(${Math.round(vh * 100)}svh,${px}px)]`);
    }
  });

  it("encodes the Fill frame sizes", () => {
    for (const { minPx } of Object.values(HERO_FILL_MOBILE)) {
      expect(heroCode).toContain(`min-h-[${minPx}px]`);
    }
    for (const px of Object.values(HERO_FILL_DESKTOP_PX)) {
      expect(heroCode).toContain(`sm:h-[${px}px]`);
    }
  });

  it("serves phone cuts and keeps the focal point in view", () => {
    expect(heroCode).toContain("mobileSrc={mobile?.url}");
    expect(heroCode).toContain("mobilePoster={mobile?.posterUrl}");
    expect(heroCode).toContain("[object-position:var(--hero-focal)]");
  });
});
