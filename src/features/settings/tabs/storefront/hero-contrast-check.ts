import {
  bandPixels,
  contrastAdvice,
  contrastVerdict,
  heroTextContrast,
  mediaBand,
  textBand,
  visibleMediaRows,
  type ContrastAdvice,
  type ContrastInput,
  type ContrastVerdict,
} from "@/lib/hero-contrast";
import { headlineSettings, slideLook, type HeroHeadlineFields } from "@/lib/hero-headline";
import { heroFrameAspect, isSmartFitSetting, type HeroDevice } from "@/lib/hero-media";
import type { ImagePixels } from "./use-image-pixels";

export type ContrastFraming = {
  fit?: string | null;
  mobileRatio?: string | null;
  desktopHeight?: string | null;
};

type Slide = HeroHeadlineFields & { focal_y?: number };

export type SlideContrast = {
  device: HeroDevice;
  ratio: number;
  verdict: ContrastVerdict;
  advice: ContrastAdvice;
};

/**
 * What a slide's headline reads like over its picture on a laptop and on a phone, and the weaker
 * of the two (the one to fix). Null when there is no picture to measure.
 */
export function slideContrast(args: {
  slide: Slide;
  store: { hero_overlay_strength?: number | null; hero_title_color_v2?: string | null };
  framing: ContrastFraming;
  pixels: { desktop: ImagePixels | null; mobile: ImagePixels | null };
}): SlideContrast | null {
  const look = slideLook(args.slide, args.store);
  const headline = headlineSettings(args.slide);
  const readings = (["desktop", "mobile"] as const).flatMap((device) => {
    const picture = args.pixels[device] ?? args.pixels.desktop;
    if (!picture) return [];
    const position = device === "mobile" ? headline.positionMobile : headline.position;
    // A smart frame shows the whole picture; a filled one cuts it around its focal point.
    const visible: [number, number] = isSmartFitSetting(args.framing.fit)
      ? [0, 1]
      : visibleMediaRows(
          picture.aspect,
          heroFrameAspect({
            device,
            fitSetting: args.framing.fit,
            leadAspect: picture.aspect,
            mobileRatio: args.framing.mobileRatio,
            desktopHeight: args.framing.desktopHeight,
          }),
          args.slide.focal_y ?? (args.framing.fit === "top" ? 0 : 50),
        );
    const input: ContrastInput = {
      pixels: bandPixels(
        picture.data,
        picture.width,
        picture.height,
        mediaBand(textBand(position), visible),
      ),
      tone: look.tone,
      textColor: look.titleColor,
      position,
      shade: look.shade,
    };
    const ratio = heroTextContrast(input);
    return ratio === null ? [] : [{ device, ratio, input }];
  });
  if (readings.length === 0) return null;
  const worst = readings.reduce((a, b) => (b.ratio < a.ratio ? b : a));
  const verdict = contrastVerdict(worst.ratio);
  return {
    device: worst.device,
    ratio: worst.ratio,
    verdict,
    advice: verdict === "low" ? contrastAdvice(worst.input) : { kind: "none" },
  };
}
